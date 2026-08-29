import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "../creator/creator-chat.css";

import {
  createCreatorId,
  generationStages,
  intakeQuestions,
} from "../creator/creatorChatConfig";
import {
  createAgentConversationKey,
  useAgentStore,
} from "../stores/agentStore";
import {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_ALLOWED_EXTENSIONS_LABEL,
  DOCUMENT_MAX_SIZE_BYTES,
  fetchCourseStatus,
  saveDocument,
} from "../utils/api";
import { getLocalStorage } from "../utils/storage";

const MAX_FILES = 5;

const ACTIVE_CREATOR_COURSE_KEY = "course-generation:active-course";
const POLLING_INTERVAL_MS = 15_000;
const PROGRESS_TICK_MS = 500;
const STATUS_ERROR_TIMEOUT_MS = 25 * 60 * 1000;
const LONG_GENERATION_MS = 25 * 60 * 1000;
const NOT_FOUND_STATUS = 404;

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
}

function getGenerationKey(courseId) {
  return `course-generation:${courseId}`;
}

function createCourseId() {
  return getLocalStorage()?.getItem(ACTIVE_CREATOR_COURSE_KEY) || createUuid();
}

function readGenerationState(courseId) {
  const storage = getLocalStorage();
  if (!storage || !courseId) return null;
  try {
    const value = JSON.parse(
      storage.getItem(getGenerationKey(courseId)) || "null",
    );
    return value?.courseId === courseId ? value : null;
  } catch {
    return null;
  }
}

function writeGenerationState(record) {
  const storage = getLocalStorage();
  if (!storage || !record?.courseId) return;
  storage.setItem(getGenerationKey(record.courseId), JSON.stringify(record));
  storage.setItem(ACTIVE_CREATOR_COURSE_KEY, record.courseId);
}

function clearGenerationState(courseId) {
  const storage = getLocalStorage();
  if (!storage || !courseId) return;
  storage.removeItem(getGenerationKey(courseId));
  if (storage.getItem(ACTIVE_CREATOR_COURSE_KEY) === courseId) {
    storage.removeItem(ACTIVE_CREATOR_COURSE_KEY);
  }
}

function estimateProgress(startedAt) {
  const started = Date.parse(startedAt || "");
  const elapsed = Number.isFinite(started) ? Date.now() - started : 0;
  const ratio = Math.max(0, elapsed) / (25 * 60 * 1000);
  return Math.min(
    90,
    Math.max(4, Math.round(90 * (1 - Math.exp(-ratio * 1.25)))),
  );
}

function safeMarkdownUrl(url) {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^(\/|\.{1,2}\/|#)/.test(value)) return value;
  return value.includes(":") ? "" : value;
}

function isFinalCourseStatus(status) {
  return ["draft", "invite_only", "published", "archived"].includes(status);
}

export default function CreatorChatView() {
  const [courseId] = useState(createCourseId);
  const conversationKey = useMemo(
    () => createAgentConversationKey("interviewer", courseId),
    [courseId],
  );
  const conversation = useAgentStore(
    (state) => state.conversations[conversationKey],
  );
  const initializeConversation = useAgentStore(
    (state) => state.initializeConversation,
  );
  const appendAgentMessage = useAgentStore((state) => state.appendMessage);
  const sendAgentMessage = useAgentStore((state) => state.sendMessage);
  const clearConversation = useAgentStore((state) => state.clearConversation);
  const cancelRequest = useAgentStore((state) => state.cancelRequest);
  const setConversationChatId = useAgentStore((state) => state.setChatId);
  const messages = conversation?.messages || [];
  const isThinking = conversation?.status === "loading";
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [hasGenerationStarted, setHasGenerationStarted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("Жду ответы в чате");
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [taskId, setTaskId] = useState(null);
  const [generationStartedAt, setGenerationStartedAt] = useState(null);
  const [generatedBlocks, setGeneratedBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [fileUploadError, setFileUploadError] = useState("");
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const generationStageRef = useRef(0);
  const pollingTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const statusErrorStartedAtRef = useRef(null);

  const requiredQuestionIds = [
    "title",
    "goal",
    "duration",
    "format",
    "level",
    "audience",
    "materials",
  ];
  const answeredRequiredCount = requiredQuestionIds.filter(
    (id) => (answers[id] || "").trim().length > 0,
  ).length;
  const briefingPercent = useMemo(
    () =>
      Math.round((answeredRequiredCount / requiredQuestionIds.length) * 100),
    [answeredRequiredCount],
  );

  const completionPercent = hasGenerationStarted
    ? Math.max(briefingPercent, generationProgress)
    : briefingPercent;
  const selectedBlock =
    generatedBlocks.find((block) => block.id === selectedBlockId) ||
    generatedBlocks[0] ||
    null;
  const currentQuestion = intakeQuestions[stepIndex] || null;

  useEffect(() => {
    initializeConversation({
      key: conversationKey,
      agent: "interviewer",
      courseId,
    });
    return () => cancelRequest(conversationKey);
  }, [cancelRequest, conversationKey, courseId, initializeConversation]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isThinking]);

  useEffect(() => {
    if (!isGenerating) {
      return undefined;
    }

    const waitTimer = window.setInterval(() => {
      setWaitSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(waitTimer);
  }, [isGenerating]);

  const pushAssistantMessage = (text) => {
    appendAgentMessage(conversationKey, "assistant", text);
  };

  const applyGenerationStage = (stageIndex) => {
    const stage = generationStages[stageIndex];
    if (!stage) {
      return;
    }

    setGenerationProgress(stage.progress);
    setGenerationStatus(stage.status);
    setWaitSeconds(stage.wait);

    setGeneratedBlocks((prev) => {
      if (prev.some((block) => block.stageIndex === stageIndex)) {
        return prev;
      }

      const newBlock = {
        id: createCreatorId("block"),
        stageIndex,
        title: stage.block.title,
        description: stage.block.description,
        readyPercent: stage.progress,
      };
      setSelectedBlockId((current) => current || newBlock.id);
      return [...prev, newBlock];
    });

    pushAssistantMessage(
      `Готово: ${stage.block.title}. Сейчас ${stage.status.toLowerCase()}.`,
    );

    if (stage.progress >= 100) {
      setIsGenerating(false);
    }
  };

  const stopGenerationTimers = useCallback(() => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const finishGeneration = useCallback(
    (status = "draft") => {
      stopGenerationTimers();
      clearGenerationState(courseId);
      setIsGenerating(false);
      setHasGenerationStarted(true);
      setGenerationProgress(100);
      setWaitSeconds(0);
      setGenerationStatus(
        status === "draft"
          ? "Курс сгенерирован! Смотрите его в своём профиле."
          : "Курс получил финальный статус.",
      );
      pushAssistantMessage(
        status === "draft"
          ? "Курс сгенерирован! Смотрите его в своём профиле."
          : "Курс больше не находится в генерации. Чат снова доступен.",
      );
    },
    [courseId, stopGenerationTimers],
  );

  const startProgressSimulation = useCallback((startedAt) => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
    }
    const tick = () => {
      const nextProgress = estimateProgress(startedAt);
      setGenerationProgress((current) => Math.max(current, nextProgress));
      const started = Date.parse(startedAt || "");
      if (
        Number.isFinite(started) &&
        Date.now() - started > LONG_GENERATION_MS
      ) {
        setGenerationStatus(
          "Генерация занимает больше времени, чем обычно. Мы продолжаем проверять статус курса.",
        );
      }
    };
    tick();
    progressTimerRef.current = window.setInterval(tick, PROGRESS_TICK_MS);
  }, []);

  const checkStatusOnce = useCallback(async () => {
    try {
      const { status } = await fetchCourseStatus(courseId);
      statusErrorStartedAtRef.current = null;
      if (status === "in_generation") {
        setGenerationStatus(
          "Курс генерируется. Проверяем готовность каждые 15 секунд.",
        );
        return false;
      }
      if (isFinalCourseStatus(status)) {
        finishGeneration(status);
        return true;
      }
      return false;
    } catch (error) {
      if (error?.status === NOT_FOUND_STATUS) {
        stopGenerationTimers();
        clearGenerationState(courseId);
        statusErrorStartedAtRef.current = null;
        setIsGenerating(false);
        setHasGenerationStarted(false);
        setGenerationProgress(0);
        setWaitSeconds(0);
        setTaskId(null);
        setGenerationStartedAt(null);
        setGeneratedBlocks([]);
        setSelectedBlockId(null);
        setGenerationStatus(
          "Предыдущая генерация больше не найдена. Можно начать новый диалог.",
        );
        return true;
      }

      console.error("Не удалось получить статус генерации курса", error);
      if (!statusErrorStartedAtRef.current) {
        statusErrorStartedAtRef.current = Date.now();
      }

      const hasTimedOut =
        Date.now() - statusErrorStartedAtRef.current >= STATUS_ERROR_TIMEOUT_MS;

      if (hasTimedOut) {
        stopGenerationTimers();
        clearGenerationState(courseId);
        setIsGenerating(false);
        setGenerationStatus(
          "Произошла ошибка при проверке статуса курса. Попробуйте обновить страницу позже.",
        );
        return true;
      }

      setGenerationStatus(
        "Курс генерируется. Продолжаем проверять готовность.",
      );
      return false;
    }
  }, [courseId, finishGeneration, stopGenerationTimers]);

  const startStatusPolling = useCallback(async () => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    const finished = await checkStatusOnce();
    if (finished) return;
    pollingTimerRef.current = window.setInterval(
      checkStatusOnce,
      POLLING_INTERVAL_MS,
    );
  }, [checkStatusOnce]);

  const beginGeneration = useCallback(
    ({
      taskId: nextTaskId,
      chatId: nextChatId,
      startedAt = new Date().toISOString(),
    }) => {
      setTaskId(nextTaskId || null);
      setGenerationStartedAt(startedAt);
      setHasGenerationStarted(true);
      setIsGenerating(true);
      setGenerationProgress(
        Math.max(briefingPercent, estimateProgress(startedAt)),
      );
      setGenerationStatus(
        "Курс генерируется. Это может занять несколько минут.",
      );
      setWaitSeconds(0);
      setGeneratedBlocks([]);
      setSelectedBlockId(null);
      statusErrorStartedAtRef.current = null;
      writeGenerationState({
        courseId,
        chatId: nextChatId || conversation?.chatId || null,
        taskId: nextTaskId || null,
        generationStartedAt: startedAt,
        status: "in_generation",
      });
      startProgressSimulation(startedAt);
      startStatusPolling();
    },
    [
      briefingPercent,
      conversation?.chatId,
      courseId,
      startProgressSimulation,
      startStatusPolling,
    ],
  );

  const getFileValidationError = (file) => {
    if (!file) return "Файл не выбран.";
    if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
      return "Размер файла не должен превышать 30 МБ.";
    }
    if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || "")) {
      return `Поддерживаются файлы ${DOCUMENT_ALLOWED_EXTENSIONS_LABEL}.`;
    }
    return "";
  };

  const uploadAllFiles = async () => {
    if (uploadedFiles.length === 0) {
      return true;
    }

    const validationErrors = uploadedFiles
      .map((uploadedFile) => ({
        name: uploadedFile.name,
        error: getFileValidationError(uploadedFile.file),
      }))
      .filter((item) => item.error);

    if (validationErrors.length > 0) {
      setFileUploadError(
        validationErrors
          .map((item) => `${item.name}: ${item.error}`)
          .join("\n"),
      );
      return false;
    }

    setIsUploadingFiles(true);
    setFileUploadError("");
    setGenerationStatus("Загружаю материалы в базу знаний...");

    const results = await Promise.allSettled(
      uploadedFiles.map((uploadedFile) => saveDocument(uploadedFile.file)),
    );
    const failedUploads = results
      .map((result, index) => ({ result, file: uploadedFiles[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, file }) => {
        const error = result.reason;
        const reason =
          error?.userMessage ||
          error?.message ||
          (Number(error?.status) >= 500
            ? "Ошибка сервера при загрузке файла. Попробуйте ещё раз."
            : "Не удалось загрузить файл.");
        return `${file.name}: ${reason}`;
      });

    setIsUploadingFiles(false);

    if (failedUploads.length > 0) {
      setFileUploadError(failedUploads.join("\n"));
      return false;
    }

    return true;
  };

  useEffect(
    () => () => {
      stopGenerationTimers();
    },
    [stopGenerationTimers],
  );

  useEffect(() => {
    const savedGeneration = readGenerationState(courseId);
    if (!savedGeneration) return;

    setConversationChatId(conversationKey, savedGeneration.chatId || null);
    setTaskId(savedGeneration.taskId || null);
    setGenerationStartedAt(savedGeneration.generationStartedAt || null);
    setHasGenerationStarted(true);
    setIsGenerating(true);
    setGenerationProgress(
      estimateProgress(savedGeneration.generationStartedAt),
    );
    setGenerationStatus(
      "Восстанавливаем генерацию курса и проверяем актуальный статус.",
    );
    startProgressSimulation(savedGeneration.generationStartedAt);
    startStatusPolling();
  }, [
    conversationKey,
    courseId,
    setConversationChatId,
    startProgressSimulation,
    startStatusPolling,
    stopGenerationTimers,
  ]);

  const submitMessage = async () => {
    const text = inputValue.trim();
    const hasFiles = uploadedFiles.length > 0;

    if (
      (!text && !hasFiles) ||
      isThinking ||
      isGenerating ||
      isUploadingFiles
    ) {
      return;
    }

    if (fileUploadError && !hasFiles) {
      return;
    }

    const targetQuestion = intakeQuestions[stepIndex] || null;
    const messageText = text || "Файлы прикреплены";

    if (hasFiles) {
      const filesOk = await uploadAllFiles();
      if (!filesOk) return;
    }

    if (targetQuestion && text) {
      setAnswers((prev) => ({
        ...prev,
        [targetQuestion.id]: text,
      }));
    }

    if (hasFiles) {
      setUploadedFiles([]);
    }

    setInputValue("");
    try {
      const response = await sendAgentMessage({
        key: conversationKey,
        agent: "interviewer",
        courseId,
        content: messageText,
        emptyResponseMessage: "",
      });
      if (!response) return;

      if (targetQuestion) {
        setStepIndex((current) =>
          Math.min(current + 1, intakeQuestions.length),
        );
      }
      if (
        response.content &&
        typeof response.content === "object" &&
        response.content.task_id
      ) {
        beginGeneration({
          taskId: response.content.task_id,
          chatId: response.chatId || conversation?.chatId,
        });
      } else if (!String(response.content ?? "").trim()) {
        setGenerationStatus(
          "Интервью завершено, но backend не вернул идентификатор задачи.",
        );
      }
    } catch {
      // Публичная ошибка отображается из Zustand-store без технических деталей.
    }
  };

  const pickFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const remaining = MAX_FILES - uploadedFiles.length;
    const accepted = [];
    const existingFileKeys = new Set(
      uploadedFiles.map(
        (uploadedFile) =>
          `${uploadedFile.name}:${uploadedFile.file.size}:${uploadedFile.file.lastModified}`,
      ),
    );
    let skippedByLimit = false;
    let skippedBySize = false;
    let skippedDuplicate = false;

    for (const file of files) {
      if (accepted.length >= remaining) {
        skippedByLimit = true;
        continue;
      }
      const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
      if (existingFileKeys.has(fileKey)) {
        skippedDuplicate = true;
        continue;
      }
      if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
        skippedBySize = true;
        continue;
      }
      if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || "")) {
        const message = `Поддерживаются файлы ${DOCUMENT_ALLOWED_EXTENSIONS_LABEL}.`;
        setFileUploadError(message);
        pushAssistantMessage(message);
        continue;
      }
      accepted.push(file);
      existingFileKeys.add(fileKey);
    }

    if (skippedByLimit) {
      pushAssistantMessage(
        `Можно прикрепить не более ${MAX_FILES} файлов. Лишние файлы не добавлены.`,
      );
    }
    if (skippedBySize) {
      const message = "Файл больше 30 МБ не поддерживается и не был добавлен.";
      setFileUploadError(message);
      pushAssistantMessage(message);
    }

    const nextFiles = accepted.map((file, index) => ({
      id: `${file.name}-${Date.now()}-${index}`,
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      file,
    }));

    if (skippedDuplicate) {
      pushAssistantMessage("Повторно выбранные файлы не добавлены.");
    }

    if (nextFiles.length > 0) {
      setFileUploadError("");
      setUploadedFiles((prev) => [...nextFiles, ...prev]);
      setAnswers((prev) => ({
        ...prev,
        materials:
          prev.materials && prev.materials.trim().length > 0
            ? prev.materials
            : "Файлы прикреплены",
      }));
    }
    event.target.value = "";
  };

  const clearChat = () => {
    stopGenerationTimers();
    clearGenerationState(courseId);
    clearConversation(conversationKey);
    initializeConversation({
      key: conversationKey,
      agent: "interviewer",
      courseId,
    });
    setStepIndex(0);
    setAnswers({});
    setInputValue("");
    setUploadedFiles([]);
    setHasGenerationStarted(false);
    setIsGenerating(false);
    setGenerationProgress(0);
    setGenerationStatus("Жду ответы в чате");
    setWaitSeconds(0);
    setGeneratedBlocks([]);
    setSelectedBlockId(null);
    setFileUploadError("");
    setTaskId(null);
    setGenerationStartedAt(null);
    setIsUploadingFiles(false);
    generationStageRef.current = 0;
    statusErrorStartedAtRef.current = null;
  };

  return (
    <section className="creator-chat-shell">
      {hasGenerationStarted && (
        <article className="glass-card creator-chat-topbar">
          <div className="creator-chat-top-main">
            <span>Создание курса</span>
            <h3>ИИ собирает структуру программы</h3>
            <p>{generationStatus}</p>
          </div>

          <div className="creator-chat-top-stats">
            <div>
              <span>Готовность</span>
              <strong>{completionPercent}%</strong>
            </div>
          </div>

          <div className="creator-chat-top-track">
            <div style={{ width: `${completionPercent}%` }} />
          </div>
        </article>
      )}

      {(!hasGenerationStarted ||
        (!isGenerating && generationProgress >= 100)) && (
        <div className="creator-chat-layout is-briefing">
          <article className="glass-card creator-chat-main">
            <div className="creator-chat-main-head">
              <h4>Чат-конструктор</h4>
              <span>
                {isUploadingFiles
                  ? "Загружаю файлы..."
                  : isGenerating
                    ? "ИИ работает..."
                    : "Диалог активен"}
              </span>
            </div>

            <div
              className="creator-chat-messages"
              ref={messagesContainerRef}
              aria-live="polite"
              aria-busy={isThinking}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`creator-chat-msg ${message.role === "user" ? "is-user" : "is-assistant"}`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={safeMarkdownUrl}
                    >
                      {message.text}
                    </ReactMarkdown>
                  ) : (
                    <p>{message.text}</p>
                  )}
                  {message.role === "user" && (
                    <span className="chat-message-status">✓ Отправлено</span>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="creator-chat-msg is-assistant is-thinking">
                  <span className="chat-thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <p>Сообщение получено — думаю над следующим уточнением…</p>
                </div>
              )}
              {conversation?.error && (
                <p className="lesson-ai-error" role="alert">
                  {conversation.error}
                </p>
              )}
            </div>

            <div className="creator-chat-composer-wrap">
              <input
                ref={fileInputRef}
                type="file"
                className="knowledge-file-input"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.txt,.json"
                onChange={pickFiles}
                disabled={isGenerating || isUploadingFiles}
              />
              <div className="creator-chat-composer">
                <button
                  type="button"
                  className="creator-chat-plus"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating || isUploadingFiles}
                  title="Загрузить файл"
                  aria-label="Загрузить файл"
                >
                  +
                </button>

                <textarea
                  placeholder={
                    currentQuestion?.placeholder || "Напишите сообщение для ИИ"
                  }
                  value={inputValue}
                  onChange={(event) => {
                    setInputValue(event.target.value);
                    if (fileUploadError && uploadedFiles.length === 0) {
                      setFileUploadError("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) {
                      return;
                    }

                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submitMessage();
                    }
                  }}
                  maxLength={10_000}
                  disabled={isGenerating || isUploadingFiles}
                />

                <button
                  type="button"
                  className="btn btn-solid creator-chat-send-btn"
                  onClick={submitMessage}
                  disabled={
                    isGenerating ||
                    isUploadingFiles ||
                    isThinking ||
                    (Boolean(fileUploadError) && uploadedFiles.length === 0) ||
                    (!inputValue.trim() && uploadedFiles.length === 0)
                  }
                >
                  {isUploadingFiles
                    ? "Загружаю файлы..."
                    : isThinking
                      ? "Отправлено"
                      : "Отправить"}
                </button>
              </div>

              {uploadedFiles.length > 0 && (
                <ul className="knowledge-files-list">
                  {uploadedFiles.map((file) => (
                    <li key={file.id}>
                      {file.name} • {file.sizeKb} КБ
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {fileUploadError && (
              <p
                className="lesson-ai-error creator-chat-file-error"
                role="alert"
              >
                {fileUploadError}
              </p>
            )}

            <div className="creator-chat-actions">
              <span>
                Файлов прикреплено: {uploadedFiles.length} • Enter для отправки,
                Shift + Enter для новой строки
              </span>
              <div className="creator-chat-actions-buttons">
                {fileUploadError && (
                  <button
                    type="button"
                    className="btn btn-solid"
                    onClick={submitMessage}
                    disabled={
                      isUploadingFiles ||
                      isThinking ||
                      isGenerating ||
                      uploadedFiles.length === 0
                    }
                  >
                    {isUploadingFiles ? "Загружаю..." : "Повторить загрузку"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={clearChat}
                >
                  Очистить чат
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
