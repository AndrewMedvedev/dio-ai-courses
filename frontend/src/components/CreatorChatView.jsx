import { useEffect, useMemo, useRef, useState } from "react";
import "../creator/creator-chat.css";

import {
  createCreatorId,
  formatWait,
  generationStages,
  intakeQuestions,
} from "../creator/creatorChatConfig";
import {
  createAgentConversationKey,
  useAgentStore,
} from "../stores/agentStore";
import { saveDocument } from "../utils/api";

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024;
const ALLOWED_DOCUMENT_EXTENSION = /\.(pdf|docx|pptx|xlsx|md|html|txt|json)$/i;

function createCourseId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    const digit = value === "x" ? random : (random & 0x3) | 0x8;
    return digit.toString(16);
  });
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
  const [generatedBlocks, setGeneratedBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [fileUploadError, setFileUploadError] = useState("");

  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const generationStageRef = useRef(0);
  const filesUploadRef = useRef(false);

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
      initialMessage: intakeQuestions[0].prompt,
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

  const beginGeneration = () => {
    if (hasGenerationStarted) return;

    setHasGenerationStarted(true);
    setIsGenerating(false);
    setGenerationProgress(briefingPercent);
    setGenerationStatus(
      "Генерация курса запущена в фоне. Готовый курс появится в каталоге со статусом «Черновик».",
    );
    setWaitSeconds(0);
    setGeneratedBlocks([]);
    setSelectedBlockId(null);
  };

  const uploadAllFiles = async () => {
    if (uploadedFiles.length === 0) {
      return true;
    }

    setGenerationStatus("Загружаю материалы...");

    for (const uploadedFile of uploadedFiles) {
      try {
        await saveDocument(uploadedFile.file);
      } catch (error) {
        setFileUploadError(
          error.userMessage || error.message || "Не удалось загрузить файл.",
        );
        return false;
      }
    }

    return true;
  };

  useEffect(() => {
    if (!isGenerating) {
      return undefined;
    }

    const stageTimer = window.setInterval(() => {
      const nextStageIndex = generationStageRef.current + 1;
      if (nextStageIndex >= generationStages.length) {
        window.clearInterval(stageTimer);
        setIsGenerating(false);
        return;
      }

      generationStageRef.current = nextStageIndex;
      applyGenerationStage(nextStageIndex);
    }, 2200);

    return () => window.clearInterval(stageTimer);
  }, [isGenerating]);

  useEffect(() => {
    if (hasGenerationStarted && !isGenerating && generationProgress >= 100) {
      setGenerationStatus("Готово: курс собран. Можно изучать блоки слева.");
    }
  }, [hasGenerationStarted, isGenerating, generationProgress]);

  const submitMessage = async () => {
    const text = inputValue.trim();
    const hasFiles = uploadedFiles.length > 0;

    if ((!text && !hasFiles) || isThinking || isGenerating) {
      return;
    }

    const targetQuestion = intakeQuestions[stepIndex] || null;
    const messageText = text || "Файлы прикреплены";

    if (targetQuestion && text) {
      setAnswers((prev) => ({
        ...prev,
        [targetQuestion.id]: text,
      }));
    }

    if (targetQuestion?.id === "materials" && uploadedFiles.length > 0) {
      filesUploadRef.current = true;
      setFileUploadError("");
      const filesOk = await uploadAllFiles();
      filesUploadRef.current = false;
      if (!filesOk) return;
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
      if (!String(response.content ?? "").trim()) {
        beginGeneration();
      }
    } catch {
      // Публичная ошибка отображается из Zustand-store без технических деталей.
    }
  };

  const applyQuickOption = (value) => {
    setInputValue(value);
  };

  const pickFiles = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const remaining = MAX_FILES - uploadedFiles.length;
    const accepted = [];
    let skippedByLimit = false;
    let skippedBySize = false;

    for (const file of files) {
      if (accepted.length >= remaining) {
        skippedByLimit = true;
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        skippedBySize = true;
        continue;
      }
      if (!ALLOWED_DOCUMENT_EXTENSION.test(file.name || "")) {
        pushAssistantMessage(
          "Поддерживаются файлы .pdf, .docx, .pptx, .xlsx, .md, .html, .txt и .json.",
        );
        continue;
      }
      accepted.push(file);
    }

    if (skippedByLimit) {
      pushAssistantMessage(
        `Можно прикрепить не более ${MAX_FILES} файлов. Лишние файлы не добавлены.`,
      );
    }
    if (skippedBySize) {
      pushAssistantMessage(
        "Файл больше 30 МБ не поддерживается и не был добавлен.",
      );
    }

    const nextFiles = accepted.map((file, index) => ({
      id: `${file.name}-${Date.now()}-${index}`,
      name: file.name,
      sizeKb: Math.max(1, Math.round(file.size / 1024)),
      file,
    }));

    if (nextFiles.length > 0) {
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
    clearConversation(conversationKey);
    initializeConversation({
      key: conversationKey,
      agent: "interviewer",
      courseId,
      initialMessage: intakeQuestions[0].prompt,
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
    filesUploadRef.current = false;
    generationStageRef.current = 0;
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
            <div>
              <span>Осталось</span>
              <strong>{formatWait(waitSeconds)}</strong>
            </div>
            <div>
              <span>Блоков собрано</span>
              <strong>{generatedBlocks.length}</strong>
            </div>
          </div>

          <div className="creator-chat-top-track">
            <div style={{ width: `${completionPercent}%` }} />
          </div>
        </article>
      )}

      <div
        className={`creator-chat-layout ${hasGenerationStarted ? "is-generating" : "is-briefing"}`}
      >
        {hasGenerationStarted && (
          <aside className="creator-chat-left">
            <div className="glass-card creator-chat-left-card">
              <div className="creator-chat-left-head">
                <h4>Блоки курса</h4>
                <span>{generatedBlocks.length} создано</span>
              </div>

              <ul className="creator-chat-block-list">
                {generatedBlocks.map((block, index) => (
                  <li key={block.id}>
                    <button
                      type="button"
                      className={`creator-chat-block-btn ${block.id === selectedBlock?.id ? "is-active" : ""}`}
                      onClick={() => setSelectedBlockId(block.id)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{block.title}</strong>
                      <small>{block.readyPercent}% готовности</small>
                    </button>
                  </li>
                ))}
              </ul>

              {selectedBlock && (
                <article className="creator-chat-block-preview">
                  <h5>{selectedBlock.title}</h5>
                  <p>{selectedBlock.description}</p>
                </article>
              )}
            </div>
          </aside>
        )}

        <article className="glass-card creator-chat-main">
          <div className="creator-chat-main-head">
            <h4>Чат-конструктор</h4>
            <span>{isGenerating ? "ИИ работает..." : "Диалог активен"}</span>
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
                <p>{message.text}</p>
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

          {currentQuestion?.quickOptions && !isGenerating && (
            <div className="creator-chat-quick-options">
              {currentQuestion.quickOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => applyQuickOption(option)}
                >
                  {option}
                </button>
              ))}
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
            />
            <div className="creator-chat-composer">
              <button
                type="button"
                className="creator-chat-plus"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
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
                onChange={(event) => setInputValue(event.target.value)}
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
                disabled={isGenerating}
              />

              <button
                type="button"
                className="btn btn-solid creator-chat-send-btn"
                onClick={submitMessage}
                disabled={
                  isGenerating ||
                  isThinking ||
                  (!inputValue.trim() && uploadedFiles.length === 0)
                }
              >
                {isThinking ? "Отправлено" : "Отправить"}
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
                >
                  Повторить загрузку
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
    </section>
  );
}
