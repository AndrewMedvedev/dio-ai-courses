import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import "./creator-chat.css";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { isAgentMockEnabled } from "@/shared/lib/agent-mock";
import {
  CONFIRM_LAUNCH_MESSAGE,
  getLastAssistantMessage,
  isAwaitingLaunchConfirmation,
  looksLikeLaunchConfirmation,
  createAgentConversationKey,
  createInitialGenerationState,
  useAgentStore,
  type GenerationPatch,
} from "@/entities/agent-chat";

import { intakeQuestions } from "../config/intake-questions";
import {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_ALLOWED_EXTENSIONS_LABEL,
  DOCUMENT_MAX_SIZE_BYTES,
  saveDocument,
} from "@/features/upload-document";
import { fetchCourseStatus } from "@/entities/course";
import { getLocalStorage } from "@/shared/lib/storage";
import {
  estimateProgress,
  extractCourseId,
  getStatusErrorMessage,
  isDraftCourseStatus,
  isGenerationCourseStatus,
  normalizeCourseStatus,
  normalizeGenerationResponse,
  safeMarkdownUrl,
} from "../lib/generation-response";
import {
  ACTIVE_CREATOR_COURSE_KEY,
  clearGenerationState,
  createCourseId,
  createUuid,
  readGenerationState,
  writeGenerationState,
} from "../model/generation-storage";

const MAX_FILES = 5;

const COURSE_GENERATION_POLLING_INTERVAL_MS = 10_000;
const COURSE_GENERATION_NOT_FOUND_GRACE_MS = 25 * 60 * 1000;
const PROGRESS_TICK_MS = 500;
const NOT_FOUND_STATUS = 404;

interface UploadedFile {
  id: string;
  name: string;
  sizeKb: number;
  file: File;
}

interface GenerationStart {
  taskId: string | null;
  courseId: string | null;
  chatId?: string | null;
  startedAt?: string;
}

/** Чат создания курса: бриф с ИИ-интервьюером, запуск генерации и слежение за ней. */
export function CreatorChatView() {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState(createCourseId);
  // Текст, который уйдёт агенту после подтверждения запуска генерации.
  const [confirmLaunchText, setConfirmLaunchText] = useState<string | null>(
    null,
  );
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
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
  const storeGeneration = useAgentStore(
    (state) => state.generations[conversationKey],
  );
  const setGeneration = useAgentStore((state) => state.setGeneration);
  const resetGeneration = useAgentStore((state) => state.resetGeneration);
  const defaultGeneration = useMemo(createInitialGenerationState, []);
  const generation = storeGeneration || defaultGeneration;
  const messages = conversation?.messages || [];
  const isThinking = conversation?.status === "loading";
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const hasGenerationStarted = generation.hasStarted;
  const isGenerating = generation.isGenerating;
  const generationProgress = generation.progress;
  const generationStatus = generation.status;
  const [fileUploadError, setFileUploadError] = useState("");
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const statusRequestControllerRef = useRef<AbortController | null>(null);
  const statusRequestInFlightRef = useRef(false);
  const hasReceivedGenerationStatusRef = useRef(false);

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
    ? generationProgress
    : briefingPercent;
  const isGenerationComplete =
    hasGenerationStarted && !isGenerating && generationProgress >= 100;
  const currentQuestion = intakeQuestions[stepIndex] || null;

  const updateGeneration = useCallback(
    (patch: GenerationPatch) => setGeneration(conversationKey, patch),
    [conversationKey, setGeneration],
  );

  const pushAssistantMessage = useCallback(
    (text: string) => {
      appendAgentMessage(conversationKey, "assistant", text);
    },
    [appendAgentMessage, conversationKey],
  );

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

  const stopGenerationTimers = useCallback(() => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    statusRequestControllerRef.current?.abort();
    statusRequestControllerRef.current = null;
    statusRequestInFlightRef.current = false;
  }, []);

  const finishGeneration = useCallback(
    (status = "draft") => {
      stopGenerationTimers();
      clearGenerationState(courseId);
      updateGeneration({
        isGenerating: false,
        hasStarted: true,
        courseStatus: normalizeCourseStatus(status),
        progress: 100,
        error: "",
        status:
          "Курс сгенерирован! Он находится в профиле в разделе «Мои курсы».",
      });
      pushAssistantMessage(
        "Курс сгенерирован! Он находится в профиле в разделе «Мои курсы».",
      );
    },
    [courseId, pushAssistantMessage, stopGenerationTimers, updateGeneration],
  );

  const startProgressSimulation = useCallback(
    (startedAt: string | null | undefined) => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
      const tick = () => {
        const nextProgress = estimateProgress(startedAt);
        updateGeneration((current) => ({
          progress: Math.max(current.progress, nextProgress),
        }));
      };
      tick();
      progressTimerRef.current = window.setInterval(tick, PROGRESS_TICK_MS);
    },
    [updateGeneration],
  );

  const checkStatusOnce = useCallback(async () => {
    if (statusRequestInFlightRef.current) return false;

    const currentGeneration = useAgentStore
      .getState()
      .getGeneration(conversationKey);
    const statusLookupId = currentGeneration.generatedCourseId;
    if (!statusLookupId) {
      stopGenerationTimers();
      clearGenerationState(courseId);
      updateGeneration({
        isGenerating: false,
        error: "Не удалось проверить статус генерации курса.",
        status: "Не удалось проверить статус генерации курса.",
      });
      pushAssistantMessage("Не удалось проверить статус генерации курса.");
      return true;
    }

    statusRequestInFlightRef.current = true;
    const controller = new AbortController();
    statusRequestControllerRef.current = controller;

    try {
      const { status } = await fetchCourseStatus(statusLookupId, {
        signal: controller.signal,
      });
      const normalizedStatus = normalizeCourseStatus(status);

      if (isGenerationCourseStatus(normalizedStatus)) {
        hasReceivedGenerationStatusRef.current = true;
        updateGeneration({
          courseStatus: normalizedStatus,
          error: "",
          status: "Курс генерируется. Мы сообщим, когда он будет готов.",
        });
        return false;
      }
      if (isDraftCourseStatus(normalizedStatus)) {
        hasReceivedGenerationStatusRef.current = true;
        finishGeneration(normalizedStatus);
        return true;
      }
      updateGeneration({
        courseStatus: normalizedStatus,
        status: "Курс генерируется. Мы сообщим, когда он будет готов.",
      });
      return false;
    } catch (error) {
      if (controller.signal.aborted) return true;

      if ((error as { status?: number } | null)?.status === NOT_FOUND_STATUS) {
        const started = Date.parse(currentGeneration.startedAt || "");
        const elapsed = Number.isFinite(started) ? Date.now() - started : 0;
        const shouldKeepPolling =
          !hasReceivedGenerationStatusRef.current &&
          elapsed < COURSE_GENERATION_NOT_FOUND_GRACE_MS;

        if (shouldKeepPolling) {
          updateGeneration({
            courseStatus: "not_found",
            error: "",
            status:
              "Задача генерации ещё подготавливается. Мы сообщим, когда курс будет готов.",
          });
          return false;
        }

        stopGenerationTimers();
        clearGenerationState(courseId);
        updateGeneration({
          isGenerating: false,
          hasStarted: false,
          taskId: null,
          generatedCourseId: null,
          courseStatus: "not_found",
          progress: 0,
          startedAt: null,
          error: "Не удалось сгенерировать курс.",
          status: "Не удалось сгенерировать курс.",
        });
        pushAssistantMessage("Не удалось сгенерировать курс.");
        return true;
      }

      console.error("Не удалось получить статус генерации курса", error);
      const errorMessage = getStatusErrorMessage(error);
      const shouldStopPolling = true;

      updateGeneration({
        isGenerating: !shouldStopPolling,
        error: errorMessage,
        status: errorMessage,
      });

      if (shouldStopPolling) {
        stopGenerationTimers();
        clearGenerationState(courseId);
        pushAssistantMessage(errorMessage);
        return true;
      }

      return false;
    } finally {
      if (statusRequestControllerRef.current === controller) {
        statusRequestControllerRef.current = null;
      }
      statusRequestInFlightRef.current = false;
    }
  }, [
    conversationKey,
    courseId,
    finishGeneration,
    pushAssistantMessage,
    stopGenerationTimers,
    updateGeneration,
  ]);

  const startStatusPolling = useCallback(async () => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    const finished = await checkStatusOnce();
    if (finished) return;
    pollingTimerRef.current = window.setInterval(
      checkStatusOnce,
      COURSE_GENERATION_POLLING_INTERVAL_MS,
    );
  }, [checkStatusOnce]);

  const beginGeneration = useCallback(
    ({
      taskId: nextTaskId,
      courseId: nextGeneratedCourseId,
      chatId: nextChatId,
      startedAt = new Date().toISOString(),
    }: GenerationStart) => {
      hasReceivedGenerationStatusRef.current = false;
      const savedGeneratedCourseId = useAgentStore
        .getState()
        .getGeneration(conversationKey).generatedCourseId;
      const generationCourseId =
        nextGeneratedCourseId || savedGeneratedCourseId;
      updateGeneration({
        taskId: nextTaskId || null,
        generatedCourseId: generationCourseId || null,
        startedAt,
        hasStarted: true,
        isGenerating: true,
        courseStatus: "in_generation",
        progress: estimateProgress(startedAt),
        status: "Курс генерируется. Это может занять несколько минут.",
        error: "",
      });
      writeGenerationState({
        courseId,
        chatId: nextChatId || conversation?.chatId || null,
        taskId: nextTaskId || null,
        generatedCourseId: generationCourseId || null,
        generationStartedAt: startedAt,
        status: "in_generation",
      });
      startProgressSimulation(startedAt);
      startStatusPolling();
    },
    [
      conversation?.chatId,
      conversationKey,
      courseId,
      startProgressSimulation,
      startStatusPolling,
      updateGeneration,
    ],
  );

  const getFileValidationError = (file: File | null | undefined) => {
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
    updateGeneration({ status: "Загружаю материалы в базу знаний..." });

    const results = await Promise.allSettled(
      uploadedFiles.map((uploadedFile) => saveDocument(uploadedFile.file)),
    );
    const failedUploads = results
      .map((result, index) => ({ result, file: uploadedFiles[index] }))
      .filter(({ result }) => result.status === "rejected")
      .map(({ result, file }) => {
        const error = (result as PromiseRejectedResult).reason as {
          userMessage?: string;
          message?: string;
          status?: number;
        } | null;
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
    updateGeneration({
      taskId: savedGeneration.taskId || null,
      generatedCourseId: savedGeneration.generatedCourseId || null,
      startedAt: savedGeneration.generationStartedAt || null,
      hasStarted: true,
      isGenerating: true,
      courseStatus: "in_generation",
      progress: estimateProgress(savedGeneration.generationStartedAt),
      status: "Генерация курса продолжается.",
      error: "",
    });
    startProgressSimulation(savedGeneration.generationStartedAt);
    startStatusPolling();
  }, [
    conversationKey,
    courseId,
    setConversationChatId,
    startProgressSimulation,
    startStatusPolling,
    updateGeneration,
  ]);

  // Из обработчика клика приходит событие, а не текст: это обычная отправка.
  const submitMessage = async (overrideText?: unknown) => {
    const isConfirmedLaunch = typeof overrideText === "string";
    const text = (
      typeof overrideText === "string" ? overrideText : inputValue
    ).trim();
    const hasFiles = !isConfirmedLaunch && uploadedFiles.length > 0;

    // Согласие на запуск генерации сначала показываем в окне подтверждения.
    if (
      !isConfirmedLaunch &&
      !hasFiles &&
      awaitingLaunchConfirmation &&
      looksLikeLaunchConfirmation(text)
    ) {
      setConfirmLaunchText(text);
      return;
    }

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

    if (!isConfirmedLaunch) setInputValue("");
    // Курс и chat_id запоминаем с первого сообщения, чтобы после перезагрузки
    // страницы продолжить ту же беседу.
    getLocalStorage()?.setItem(ACTIVE_CREATOR_COURSE_KEY, courseId);
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
      const responseCourseId = extractCourseId(response);
      if (responseCourseId) {
        updateGeneration({ generatedCourseId: responseCourseId });
      }

      const generationResult = normalizeGenerationResponse(response);
      if (generationResult) {
        beginGeneration({
          taskId: generationResult.taskId,
          courseId: generationResult.courseId,
          chatId: response.chatId || conversation?.chatId,
          startedAt: generationResult.startedAt,
        });
      } else if (!String(response.content ?? "").trim()) {
        beginGeneration({
          taskId: null,
          courseId: null,
          chatId: response.chatId || conversation?.chatId,
        });
      }
    } catch {
      // Публичная ошибка отображается из Zustand-store без технических деталей.
    }
  };

  const pickFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const remaining = MAX_FILES - uploadedFiles.length;
    const accepted: File[] = [];
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
    resetGeneration(conversationKey);
    hasReceivedGenerationStatusRef.current = false;
    setFileUploadError("");
    setIsUploadingFiles(false);
  };

  const awaitingLaunchConfirmation =
    !isGenerating &&
    !hasGenerationStarted &&
    !isThinking &&
    isAwaitingLaunchConfirmation(messages);
  const lastAssistantMessage = getLastAssistantMessage(messages);
  const generatedCourseId = generation.generatedCourseId || courseId;

  const startNewChat = () => {
    stopGenerationTimers();
    clearGenerationState(courseId);
    clearConversation(conversationKey);
    setStepIndex(0);
    setAnswers({});
    setInputValue("");
    setUploadedFiles([]);
    resetGeneration(conversationKey);
    hasReceivedGenerationStatusRef.current = false;
    setFileUploadError("");
    setIsUploadingFiles(false);
    setCourseId(createUuid());
  };

  return (
    <section className="creator-chat-shell">
      {isAgentMockEnabled() ? (
        <p className="agent-mock-badge">
          Демо-режим: ответы ИИ имитируются, модель не вызывается. Курс
          создаётся настоящими запросами к backend.
        </p>
      ) : null}
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

      {isGenerating && (
        <div className="creator-chat-layout is-generating">
          <article className="glass-card creator-chat-main">
            <div className="creator-chat-main-head">
              <h4>Чат-конструктор</h4>
              <span>ИИ работает...</span>
            </div>

            <div
              className="creator-chat-messages"
              ref={messagesContainerRef}
              aria-live="polite"
              aria-busy="true"
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

              <div className="creator-chat-msg is-assistant is-thinking">
                <span className="chat-thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <p>Курс генерируется. Можно оставить страницу открытой.</p>
              </div>
            </div>

            <div className="creator-chat-runtime">
              <h5>Генерация курса</h5>
              <p>{generationStatus}</p>
              <div className="creator-chat-runtime-bar">
                <div style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
          </article>
        </div>
      )}

      {isGenerationComplete && (
        <div className="creator-chat-layout is-briefing">
          <article className="glass-card creator-chat-main">
            <div className="creator-chat-main-head">
              <h4>Чат-конструктор</h4>
              <span>Курс готов</span>
            </div>

            <div
              className="creator-chat-messages"
              ref={messagesContainerRef}
              aria-live="polite"
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
            </div>

            <div className="creator-chat-actions creator-chat-new-actions">
              <span>
                Курс сохранён черновиком. Откройте его, чтобы проверить и
                отредактировать, или начните новый диалог.
              </span>
              <div className="creator-chat-actions-buttons">
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => navigate(`/course/${generatedCourseId}/edit`)}
                >
                  Открыть курс
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={startNewChat}
                >
                  Новый чат
                </button>
              </div>
            </div>
          </article>
        </div>
      )}

      {!isGenerating && !isGenerationComplete && (
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

            {awaitingLaunchConfirmation && (
              <div className="creator-chat-launch">
                <span>
                  ИИ подготовил структуру курса. Проверьте описание и цели
                  обучения перед запуском — после запуска генерацию нельзя
                  отменить.
                </span>
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => setConfirmLaunchText(CONFIRM_LAUNCH_MESSAGE)}
                >
                  Проверить и запустить
                </button>
              </div>
            )}

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
                  onClick={() =>
                    messages.length > 0
                      ? setIsClearConfirmOpen(true)
                      : clearChat()
                  }
                >
                  Очистить чат
                </button>
              </div>
            </div>
          </article>
        </div>
      )}

      <ConfirmDialog
        open={confirmLaunchText !== null}
        size="lg"
        eyebrow="Проверьте перед запуском"
        title="Запустить генерацию курса?"
        description="Описание и цели обучения, которые подготовил ИИ. Если что-то не так — нажмите «Отмена» и напишите правки в чат."
        confirmLabel="Подтвердить и запустить"
        busyLabel="Отправляем..."
        onCancel={() => setConfirmLaunchText(null)}
        onConfirm={async () => {
          const text = confirmLaunchText || CONFIRM_LAUNCH_MESSAGE;
          setConfirmLaunchText(null);
          if (text !== CONFIRM_LAUNCH_MESSAGE) setInputValue("");
          await submitMessage(text);
        }}
      >
        <div className="agent-launch-summary">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={safeMarkdownUrl}
          >
            {lastAssistantMessage?.text || ""}
          </ReactMarkdown>
        </div>
        <p className="app-modal-note">
          После подтверждения ИИ поставит курс в очередь на генерацию. Это
          займёт несколько минут, страницу можно не держать открытой.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={isClearConfirmOpen}
        danger
        title="Очистить чат?"
        description="Вся переписка с ИИ по этому курсу удалится. Отменить это нельзя."
        confirmLabel="Очистить"
        busyLabel="Очищаем..."
        onCancel={() => setIsClearConfirmOpen(false)}
        onConfirm={() => {
          clearChat();
          setIsClearConfirmOpen(false);
        }}
      />
    </section>
  );
}
