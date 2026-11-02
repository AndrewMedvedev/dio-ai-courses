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
    <section className="creator-chat-shell tw:mt-[10px] tw:grid tw:gap-[16px]">
      {isAgentMockEnabled() ? (
        <p className="agent-mock-badge tw:m-[0_0_12px] tw:p-[8px_12px] tw:rounded-[12px] tw:text-(--text) tw:text-[1rem] tw:font-[700] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border:1px_dashed_rgba(212,_150,_30,_0.6)] tw:[background:rgba(212,_150,_30,_0.12)]">
          Демо-режим: ответы ИИ имитируются, модель не вызывается. Курс
          создаётся настоящими запросами к backend.
        </p>
      ) : null}
      {hasGenerationStarted && (
        <article className="glass-card creator-chat-topbar tw:relative tw:z-[2] tw:p-[18px_20px] tw:grid tw:gap-[14px] tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:overflow-hidden tw:isolate tw:max-760:p-[16px] tw:hover:border-(--glass-glow) tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[border-width:1px] tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:dark:hover:border-[rgba(var(--accent-rgb),_0.5)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
          <div className="creator-chat-top-main">
            <span className="tw:inline-block tw:text-[0.76rem] tw:tracking-[0.08em] tw:uppercase tw:text-(--accent) tw:font-[700] tw:dark:text-(--contrast)">
              Создание курса
            </span>
            <h3 className="tw:mt-[6px] tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
              ИИ собирает структуру программы
            </h3>
            <p className="tw:mt-[8px] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
              {generationStatus}
            </p>
          </div>

          <div className="creator-chat-top-stats tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[10px] tw:max-980:grid-cols-[1fr]">
            <div className="tw:rounded-[12px] tw:p-[10px_12px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.3)] tw:[background:rgba(var(--accent-rgb),_0.08)]">
              <span className="tw:block tw:text-[0.76rem] tw:text-(--muted)">
                Готовность
              </span>
              <strong className="tw:block tw:mt-[4px] tw:text-[1rem] tw:text-(--heading)">
                {completionPercent}%
              </strong>
            </div>
          </div>

          <div className="creator-chat-top-track tw:w-[100%] tw:h-[8px] tw:rounded-[999px] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)]">
            <div
              className="tw:h-[100%] tw:rounded-[inherit] tw:[background:linear-gradient(_90deg,_rgba(var(--accent-rgb),_0.96),_rgba(var(--accent-soft-rgb),_0.96)_)] tw:[transition:width_0.45s_ease]"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </article>
      )}

      {isGenerating && (
        <div className="creator-chat-layout is-generating tw:grid tw:gap-[14px] tw:items-stretch tw:grid-cols-[minmax(0,_1fr)] tw:max-980:grid-cols-[1fr]">
          <article className="glass-card creator-chat-main tw:p-[18px] tw:h-[auto] tw:min-h-[520px] tw:flex tw:flex-col tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:max-760:p-[16px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            <div className="creator-chat-main-head tw:flex tw:justify-between tw:items-center tw:gap-[10px]">
              <h4>Чат-конструктор</h4>
              <span>ИИ работает...</span>
            </div>

            <div
              className="creator-chat-messages tw:mt-[12px] tw:flex-[1] tw:min-h-[280px] tw:max-h-[460px] tw:overflow-y-auto tw:overflow-x-hidden tw:flex tw:flex-col tw:justify-end tw:gap-[8px] tw:pr-[4px]"
              ref={messagesContainerRef}
              aria-live="polite"
              aria-busy="true"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`creator-chat-msg tw:max-w-[90%] tw:rounded-[14px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:[border-width:1px] tw:[&.is-user]:border-[rgba(var(--accent-rgb),_0.58)] tw:[&.is-assistant]:self-start tw:[&.is-user]:self-end tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.12)] tw:[&.is-user]:[background:rgba(var(--accent-rgb),_0.18)] tw:dark:[.page_&]:text-(--text) tw:dark:[.page_&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.16)] tw:dark:[.page_&.is-user]:[background:rgba(var(--accent-rgb),_0.24)] ${message.role === "user" ? "is-user" : "is-assistant"}`}
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
                    <span className="chat-message-status tw:block tw:mt-[2px] tw:text-(--muted) tw:text-[0.66rem] tw:font-[700] tw:leading-[1.2] tw:text-right">
                      ✓ Отправлено
                    </span>
                  )}
                </div>
              ))}

              <div className="creator-chat-msg is-assistant is-thinking tw:max-w-[90%] tw:rounded-[14px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:self-start tw:opacity-[0.84] tw:italic tw:flex tw:items-center tw:gap-[8px] tw:[border-width:1px] tw:[background:rgba(var(--accent-soft-rgb),_0.12)] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:dark:[.page_&]:text-(--text) tw:dark:[.page_&]:[background:rgba(var(--accent-soft-rgb),_0.16)]">
                <span
                  className="chat-thinking-dots tw:inline-flex tw:items-center tw:gap-[3px] tw:flex-[0_0_auto]"
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
                <p>Курс генерируется. Можно оставить страницу открытой.</p>
              </div>
            </div>

            <div className="creator-chat-runtime tw:mt-[14px] tw:pt-[12px] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.24)]">
              <h5>Генерация курса</h5>
              <p>{generationStatus}</p>
              <div className="creator-chat-runtime-bar tw:mt-[10px] tw:w-[100%] tw:h-[8px] tw:rounded-[999px] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)]">
                <div style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
          </article>
        </div>
      )}

      {isGenerationComplete && (
        <div className="creator-chat-layout is-briefing tw:grid tw:gap-[14px] tw:grid-cols-[minmax(0,_1fr)] tw:[align-items:start] tw:max-980:grid-cols-[1fr]">
          <article className="glass-card creator-chat-main tw:p-[18px] tw:h-[auto] tw:min-h-[520px] tw:flex tw:flex-col tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:max-760:p-[16px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            <div className="creator-chat-main-head tw:flex tw:justify-between tw:items-center tw:gap-[10px]">
              <h4 className="tw:text-[0.95rem] tw:text-(--heading) tw:[font-family:'Unbounded',_sans-serif]">
                Чат-конструктор
              </h4>
              <span className="tw:text-(--muted) tw:text-[0.78rem]">
                Курс готов
              </span>
            </div>

            <div
              className="creator-chat-messages tw:mt-[12px] tw:flex-[1] tw:min-h-[280px] tw:max-h-[460px] tw:overflow-y-auto tw:overflow-x-hidden tw:flex tw:flex-col tw:justify-end tw:gap-[8px] tw:pr-[4px]"
              ref={messagesContainerRef}
              aria-live="polite"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`creator-chat-msg tw:max-w-[90%] tw:rounded-[14px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:[border-width:1px] tw:[&.is-user]:border-[rgba(var(--accent-rgb),_0.58)] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-user]:self-end tw:[&.is-assistant]:self-start tw:dark:text-(--text) tw:dark:[&.is-user]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-user]:[background:rgba(var(--accent-rgb),_0.18)] tw:[&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.12)] tw:dark:[.page_&.is-user]:[background:rgba(var(--accent-rgb),_0.24)] tw:dark:[.page_&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.16)] ${message.role === "user" ? "is-user" : "is-assistant"}`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={safeMarkdownUrl}
                    >
                      {message.text}
                    </ReactMarkdown>
                  ) : (
                    <p className="tw:m-[0] tw:leading-[1.72] tw:text-[1rem] tw:wrap-anywhere tw:tracking-[0.012em]">
                      {message.text}
                    </p>
                  )}
                  {message.role === "user" && (
                    <span className="chat-message-status tw:block tw:mt-[2px] tw:text-(--muted) tw:text-[0.66rem] tw:font-[700] tw:leading-[1.2] tw:text-right">
                      ✓ Отправлено
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="creator-chat-actions creator-chat-new-actions tw:mt-[14px] tw:pt-[12px] tw:flex tw:items-center tw:justify-between tw:gap-[10px] tw:flex-wrap tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:max-760:items-stretch tw:max-760:flex-col tw:[&_.btn]:p-[9px_15px] tw:[&_.btn]:min-h-[38px] tw:[&_.btn]:flex-[0_0_auto] tw:max-760:[&_.btn]:w-[100%]">
              <span className="tw:flex-[1_1_320px] tw:text-(--muted) tw:text-[0.78rem] tw:leading-[1.45]">
                Курс сохранён черновиком. Откройте его, чтобы проверить и
                отредактировать, или начните новый диалог.
              </span>
              <div className="creator-chat-actions-buttons tw:flex tw:items-center tw:gap-[8px] tw:flex-wrap">
                <button
                  type="button"
                  className="btn btn-solid tw:flex-[0_0_auto] tw:min-h-[38px] tw:p-[9px_15px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:max-760:w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => navigate(`/course/${generatedCourseId}/edit`)}
                >
                  Открыть курс
                </button>
                <button
                  type="button"
                  className="btn btn-outline tw:flex-[0_0_auto] tw:min-h-[38px] tw:p-[9px_15px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:max-760:w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
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
        <div className="creator-chat-layout is-briefing tw:grid tw:gap-[14px] tw:grid-cols-[minmax(0,_1fr)] tw:[align-items:start] tw:max-980:grid-cols-[1fr]">
          <article className="glass-card creator-chat-main tw:p-[18px] tw:h-[auto] tw:min-h-[520px] tw:flex tw:flex-col tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:max-760:p-[16px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
            <div className="creator-chat-main-head tw:flex tw:justify-between tw:items-center tw:gap-[10px]">
              <h4 className="tw:text-[0.95rem] tw:text-(--heading) tw:[font-family:'Unbounded',_sans-serif]">
                Чат-конструктор
              </h4>
              <span className="tw:text-(--muted) tw:text-[0.78rem]">
                {isUploadingFiles
                  ? "Загружаю файлы..."
                  : isGenerating
                    ? "ИИ работает..."
                    : "Диалог активен"}
              </span>
            </div>

            <div
              className="creator-chat-messages tw:mt-[12px] tw:flex-[1] tw:min-h-[280px] tw:max-h-[460px] tw:overflow-y-auto tw:overflow-x-hidden tw:flex tw:flex-col tw:justify-end tw:gap-[8px] tw:pr-[4px]"
              ref={messagesContainerRef}
              aria-live="polite"
              aria-busy={isThinking}
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`creator-chat-msg tw:max-w-[90%] tw:rounded-[14px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:[border-width:1px] tw:[&.is-user]:border-[rgba(var(--accent-rgb),_0.58)] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-user]:self-end tw:[&.is-assistant]:self-start tw:dark:text-(--text) tw:dark:[&.is-user]:border-[rgba(var(--accent-rgb),_0.42)] tw:[&.is-user]:[background:rgba(var(--accent-rgb),_0.18)] tw:[&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.12)] tw:dark:[.page_&.is-user]:[background:rgba(var(--accent-rgb),_0.24)] tw:dark:[.page_&.is-assistant]:[background:rgba(var(--accent-soft-rgb),_0.16)] ${message.role === "user" ? "is-user" : "is-assistant"}`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      urlTransform={safeMarkdownUrl}
                    >
                      {message.text}
                    </ReactMarkdown>
                  ) : (
                    <p className="tw:m-[0] tw:leading-[1.72] tw:text-[1rem] tw:wrap-anywhere tw:tracking-[0.012em]">
                      {message.text}
                    </p>
                  )}
                  {message.role === "user" && (
                    <span className="chat-message-status tw:block tw:mt-[2px] tw:text-(--muted) tw:text-[0.66rem] tw:font-[700] tw:leading-[1.2] tw:text-right">
                      ✓ Отправлено
                    </span>
                  )}
                </div>
              ))}

              {isThinking && (
                <div className="creator-chat-msg is-assistant is-thinking tw:max-w-[90%] tw:rounded-[14px] tw:p-[10px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:self-start tw:opacity-[0.84] tw:italic tw:flex tw:items-center tw:gap-[8px] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:rgba(var(--accent-soft-rgb),_0.12)] tw:dark:text-(--text) tw:dark:[background:rgba(var(--accent-soft-rgb),_0.16)]">
                  <span
                    className="chat-thinking-dots tw:inline-flex tw:items-center tw:gap-[3px] tw:flex-[0_0_auto]"
                    aria-hidden="true"
                  >
                    <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:[animation:chat-thinking-pulse_1.1s_ease-in-out_infinite] tw:motion-reduce:[animation:none] tw:[.chat-thinking-dots_&:nth-child(2)]:[animation-delay:160ms] tw:[.chat-thinking-dots_&:nth-child(3)]:[animation-delay:320ms]" />
                    <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:[animation:chat-thinking-pulse_1.1s_ease-in-out_infinite] tw:motion-reduce:[animation:none] tw:[&:nth-child(2)]:[animation-delay:160ms] tw:[.chat-thinking-dots_&:nth-child(3)]:[animation-delay:320ms]" />
                    <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:[animation:chat-thinking-pulse_1.1s_ease-in-out_infinite] tw:motion-reduce:[animation:none] tw:[&:nth-child(3)]:[animation-delay:320ms]" />
                  </span>
                  <p className="tw:m-[0] tw:leading-[1.72] tw:text-[1rem] tw:wrap-anywhere tw:tracking-[0.012em]">
                    Сообщение получено — думаю над следующим уточнением…
                  </p>
                </div>
              )}
              {conversation?.error && (
                <p className="lesson-ai-error" role="alert">
                  {conversation.error}
                </p>
              )}
            </div>

            {awaitingLaunchConfirmation && (
              <div className="creator-chat-launch tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[10px] tw:m-[0_0_12px] tw:p-[12px_14px] tw:rounded-[16px] tw:[border:1px_solid_rgba(47,_125,_79,_0.35)] tw:[background:rgba(47,_125,_79,_0.08)]">
                <span className="tw:flex-[1_1_260px] tw:text-(--muted) tw:text-[0.9rem]">
                  ИИ подготовил структуру курса. Проверьте описание и цели
                  обучения перед запуском — после запуска генерацию нельзя
                  отменить.
                </span>
                <button
                  type="button"
                  className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() => setConfirmLaunchText(CONFIRM_LAUNCH_MESSAGE)}
                >
                  Проверить и запустить
                </button>
              </div>
            )}

            <div className="creator-chat-composer-wrap tw:mt-[12px]">
              <input
                ref={fileInputRef}
                type="file"
                className="knowledge-file-input tw:hidden tw:text-[0.96rem] tw:leading-[1.45]"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.txt,.json"
                onChange={pickFiles}
                disabled={isGenerating || isUploadingFiles}
              />
              <div className="creator-chat-composer tw:relative tw:grid tw:grid-cols-[34px_minmax(0,_1fr)_auto] tw:gap-[8px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[14px] tw:p-[8px] tw:max-760:grid-cols-[34px_minmax(0,_1fr)] tw:[align-items:end] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.46)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:dark:[background:rgba(var(--accent-rgb),_0.14)]">
                <button
                  type="button"
                  className="creator-chat-plus tw:static tw:w-[30px] tw:h-[30px] tw:min-w-[30px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.38)] tw:rounded-[50%] tw:text-(--ink-accent) tw:text-[0.96rem] tw:font-[700] tw:leading-[1.45] tw:cursor-pointer tw:inline-flex tw:items-center tw:justify-center tw:[align-self:end] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.6)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:dark:text-(--heading) tw:max-760:min-h-[30px] tw:dark:[background:rgba(var(--accent-rgb),_0.2)]"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating || isUploadingFiles}
                  title="Загрузить файл"
                  aria-label="Загрузить файл"
                >
                  +
                </button>

                <textarea
                  className="tw:w-[100%] tw:min-h-[72px] tw:max-h-[170px] tw:resize-y tw:rounded-[8px] tw:p-[10px_8px] tw:text-(--text) tw:overflow-y-auto tw:overflow-x-hidden tw:[border:0] tw:[background:transparent] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.66)_rgba(var(--accent-rgb),_0.12)] tw:dark:placeholder:text-(--muted) tw:[&::-webkit-scrollbar]:w-[10px] tw:[&::-webkit-scrollbar-track]:rounded-[999px] tw:[&::-webkit-scrollbar-thumb]:rounded-[999px] tw:[&::-webkit-scrollbar-track]:[background:rgba(var(--accent-rgb),_0.12)] tw:[&::-webkit-scrollbar-thumb]:[background:linear-gradient(_180deg,_rgba(var(--accent-rgb),_0.82)_0%,_rgba(var(--accent-soft-rgb),_0.76)_100%_)] tw:[&::-webkit-scrollbar-thumb]:[border:2px_solid_rgba(var(--accent-rgb),_0.14)]"
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
                  className="btn btn-solid creator-chat-send-btn tw:min-w-[96px] tw:min-h-[40px] tw:p-[12px_20px] tw:rounded-[999px] tw:text-[0.96rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[align-self:end] tw:max-760:col-[1_/_-1] tw:max-760:w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
                <ul className="knowledge-files-list tw:m-[12px_0_0] tw:p-[0] tw:pr-[4px] tw:grid tw:gap-[6px] tw:max-h-[88px] tw:overflow-y-auto tw:[list-style:none] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.52)_transparent] tw:[&::-webkit-scrollbar]:w-[8px] tw:[&::-webkit-scrollbar-thumb]:rounded-[999px] tw:[&::-webkit-scrollbar-track]:[background:transparent] tw:[&::-webkit-scrollbar-thumb]:[background:rgba(var(--accent-rgb),_0.45)]">
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

            <div className="creator-chat-actions tw:mt-[14px] tw:pt-[12px] tw:flex tw:items-center tw:justify-between tw:gap-[10px] tw:flex-wrap tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:max-760:items-stretch tw:max-760:flex-col tw:[&_.btn]:p-[9px_15px] tw:[&_.btn]:min-h-[38px] tw:[&_.btn]:flex-[0_0_auto] tw:max-760:[&_.btn]:w-[100%]">
              <span className="tw:flex-[1_1_320px] tw:text-(--muted) tw:text-[0.78rem] tw:leading-[1.45]">
                Файлов прикреплено: {uploadedFiles.length} • Enter для отправки,
                Shift + Enter для новой строки
              </span>
              <div className="creator-chat-actions-buttons tw:flex tw:items-center tw:gap-[8px] tw:flex-wrap">
                {fileUploadError && (
                  <button
                    type="button"
                    className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
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
                  className="btn btn-outline tw:flex-[0_0_auto] tw:min-h-[38px] tw:p-[9px_15px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:max-760:w-[100%] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
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
        <div className="agent-launch-summary tw:p-[12px_14px] tw:rounded-[14px] tw:max-h-[46vh] tw:overflow-y-auto tw:leading-[1.5] tw:wrap-anywhere tw:[border:1px_solid_var(--app-modal-border)] tw:[background:var(--app-modal-row)]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={safeMarkdownUrl}
          >
            {lastAssistantMessage?.text || ""}
          </ReactMarkdown>
        </div>
        <p className="app-modal-note tw:m-[0] tw:text-(--muted) tw:text-[0.9rem]">
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
