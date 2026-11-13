import { toText } from '@/shared/lib/text';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChatButton,
  ChatCard,
  ChatComposer,
  ChatEmpty,
  ChatIconButton,
  ChatMarkdown,
  ChatMessage,
  ChatNotice,
  ChatProgress,
  ChatThread,
  ChatTyping,
  IconNewChat,
} from '@/shared/ui/ai-chat';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { isAgentMockEnabled } from '@/shared/lib/agent-mock';
import {
  CONFIRM_LAUNCH_MESSAGE,
  getLastAssistantMessage,
  isAwaitingLaunchConfirmation,
  looksLikeLaunchConfirmation,
  createAgentConversationKey,
  createInitialGenerationState,
  useAgentStore,
  type GenerationPatch,
} from '@/entities/agent-chat';

import { intakeQuestions } from '../config/intake-questions';
import {
  DOCUMENT_ALLOWED_EXTENSION,
  DOCUMENT_ALLOWED_EXTENSIONS_LABEL,
  DOCUMENT_MAX_SIZE_BYTES,
  saveDocument,
} from '@/shared/api';
import { fetchCourseStatus } from '@/entities/course';
import { getLocalStorage } from '@/shared/lib/storage';
import {
  estimateProgress,
  extractCourseId,
  getStatusErrorMessage,
  isDraftCourseStatus,
  isGenerationCourseStatus,
  normalizeCourseStatus,
  normalizeGenerationResponse,
} from '../lib/generation-response';
import {
  ACTIVE_CREATOR_COURSE_KEY,
  clearGenerationState,
  createCourseId,
  createUuid,
  readGenerationState,
  writeGenerationState,
} from '../model/generation-storage';

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
    () => createAgentConversationKey('interviewer', courseId),
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
  const isThinking = conversation?.status === 'loading';
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [inputValue, setInputValue] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const hasGenerationStarted = generation.hasStarted;
  const isGenerating = generation.isGenerating;
  const generationProgress = generation.progress;
  const generationStatus = generation.status;
  const [fileUploadError, setFileUploadError] = useState('');
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const statusRequestControllerRef = useRef<AbortController | null>(null);
  const statusRequestInFlightRef = useRef(false);
  const hasReceivedGenerationStatusRef = useRef(false);

  const requiredQuestionIds = [
    'title',
    'goal',
    'duration',
    'format',
    'level',
    'audience',
    'materials',
  ];
  const answeredRequiredCount = requiredQuestionIds.filter(
    (id) => (answers[id] || '').trim().length > 0,
  ).length;
  const briefingPercent = Math.round(
    (answeredRequiredCount / requiredQuestionIds.length) * 100,
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
      appendAgentMessage(conversationKey, 'assistant', text);
    },
    [appendAgentMessage, conversationKey],
  );

  useEffect(() => {
    initializeConversation({
      key: conversationKey,
      agent: 'interviewer',
      courseId,
    });
    return () => cancelRequest(conversationKey);
  }, [cancelRequest, conversationKey, courseId, initializeConversation]);

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
    (status = 'draft') => {
      stopGenerationTimers();
      clearGenerationState(courseId);
      updateGeneration({
        isGenerating: false,
        hasStarted: true,
        courseStatus: normalizeCourseStatus(status),
        progress: 100,
        error: '',
        status:
          'Курс сгенерирован! Он находится в профиле в разделе «Мои курсы».',
      });
      pushAssistantMessage(
        'Курс сгенерирован! Он находится в профиле в разделе «Мои курсы».',
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
        error: 'Не удалось проверить статус генерации курса.',
        status: 'Не удалось проверить статус генерации курса.',
      });
      pushAssistantMessage('Не удалось проверить статус генерации курса.');
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
          error: '',
          status: 'Курс генерируется. Мы сообщим, когда он будет готов.',
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
        status: 'Курс генерируется. Мы сообщим, когда он будет готов.',
      });
      return false;
    } catch (error) {
      if (controller.signal.aborted) return true;

      if ((error as { status?: number } | null)?.status === NOT_FOUND_STATUS) {
        const started = Date.parse(currentGeneration.startedAt || '');
        const elapsed = Number.isFinite(started) ? Date.now() - started : 0;
        const shouldKeepPolling =
          !hasReceivedGenerationStatusRef.current &&
          elapsed < COURSE_GENERATION_NOT_FOUND_GRACE_MS;

        if (shouldKeepPolling) {
          updateGeneration({
            courseStatus: 'not_found',
            error: '',
            status:
              'Задача генерации ещё подготавливается. Мы сообщим, когда курс будет готов.',
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
          courseStatus: 'not_found',
          progress: 0,
          startedAt: null,
          error: 'Не удалось сгенерировать курс.',
          status: 'Не удалось сгенерировать курс.',
        });
        pushAssistantMessage('Не удалось сгенерировать курс.');
        return true;
      }

      console.error('Не удалось получить статус генерации курса', error);
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
        courseStatus: 'in_generation',
        progress: estimateProgress(startedAt),
        status: 'Курс генерируется. Это может занять несколько минут.',
        error: '',
      });
      writeGenerationState({
        courseId,
        chatId: nextChatId || conversation?.chatId || null,
        taskId: nextTaskId || null,
        generatedCourseId: generationCourseId || null,
        generationStartedAt: startedAt,
        status: 'in_generation',
      });
      startProgressSimulation(startedAt);
      void startStatusPolling();
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
    if (!file) return 'Файл не выбран.';
    if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
      return 'Размер файла не должен превышать 30 МБ.';
    }
    if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || '')) {
      return `Поддерживаются файлы ${DOCUMENT_ALLOWED_EXTENSIONS_LABEL}.`;
    }
    return '';
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
          .join('\n'),
      );
      return false;
    }

    setIsUploadingFiles(true);
    setFileUploadError('');
    updateGeneration({ status: 'Загружаю материалы в базу знаний...' });

    const results = await Promise.allSettled(
      uploadedFiles.map((uploadedFile) => saveDocument(uploadedFile.file)),
    );
    const failedUploads = results
      .map((result, index) => ({ result, file: uploadedFiles[index] }))
      .filter(({ result }) => result.status === 'rejected')
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
            ? 'Ошибка сервера при загрузке файла. Попробуйте ещё раз.'
            : 'Не удалось загрузить файл.');
        return `${file.name}: ${reason}`;
      });

    setIsUploadingFiles(false);

    if (failedUploads.length > 0) {
      setFileUploadError(failedUploads.join('\n'));
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
      courseStatus: 'in_generation',
      progress: estimateProgress(savedGeneration.generationStartedAt),
      status: 'Генерация курса продолжается.',
      error: '',
    });
    startProgressSimulation(savedGeneration.generationStartedAt);
    void startStatusPolling();
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
    const isConfirmedLaunch = typeof overrideText === 'string';
    const text = (
      typeof overrideText === 'string' ? overrideText : inputValue
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
    const messageText = text || 'Файлы прикреплены';

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

    if (!isConfirmedLaunch) setInputValue('');
    // Курс и chat_id запоминаем с первого сообщения, чтобы после перезагрузки
    // страницы продолжить ту же беседу.
    getLocalStorage()?.setItem(ACTIVE_CREATOR_COURSE_KEY, courseId);
    try {
      const response = await sendAgentMessage({
        key: conversationKey,
        agent: 'interviewer',
        courseId,
        content: messageText,
        emptyResponseMessage: '',
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
      } else if (!toText(response.content ?? '').trim()) {
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
      if (!DOCUMENT_ALLOWED_EXTENSION.test(file.name || '')) {
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
      const message = 'Файл больше 30 МБ не поддерживается и не был добавлен.';
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
      pushAssistantMessage('Повторно выбранные файлы не добавлены.');
    }

    if (nextFiles.length > 0) {
      setFileUploadError('');
      setUploadedFiles((prev) => [...nextFiles, ...prev]);
      setAnswers((prev) => ({
        ...prev,
        materials:
          prev.materials && prev.materials.trim().length > 0
            ? prev.materials
            : 'Файлы прикреплены',
      }));
    }
    event.target.value = '';
  };

  const clearChat = () => {
    stopGenerationTimers();
    clearGenerationState(courseId);
    clearConversation(conversationKey);
    initializeConversation({
      key: conversationKey,
      agent: 'interviewer',
      courseId,
    });
    setStepIndex(0);
    setAnswers({});
    setInputValue('');
    setUploadedFiles([]);
    resetGeneration(conversationKey);
    hasReceivedGenerationStatusRef.current = false;
    setFileUploadError('');
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
    setInputValue('');
    setUploadedFiles([]);
    resetGeneration(conversationKey);
    hasReceivedGenerationStatusRef.current = false;
    setFileUploadError('');
    setIsUploadingFiles(false);
    setCourseId(createUuid());
  };

  const statusLabel = isUploadingFiles
    ? 'Загружаю файлы…'
    : isGenerating
      ? 'ИИ собирает курс…'
      : isGenerationComplete
        ? 'Курс готов'
        : isThinking
          ? 'ИИ отвечает…'
          : 'Диалог активен';
  const canSend =
    !isGenerating &&
    !isUploadingFiles &&
    !isThinking &&
    !(Boolean(fileUploadError) && uploadedFiles.length === 0) &&
    (Boolean(inputValue.trim()) || uploadedFiles.length > 0);

  return (
    <section className="creator-chat-shell tw:mt-[10px] tw:grid tw:gap-[16px]">
      <div className="tw:min-w-0">
        <article className="glass-card creator-chat-main tw:relative tw:flex tw:flex-col tw:h-[calc(100dvh_-_140px)] tw:min-h-[320px] tw:max-760:h-[calc(100dvh_-_124px)] tw:max-760:min-h-[280px] tw:rounded-[22px] tw:overflow-hidden tw:[border:1px_solid_var(--glass-border)] tw:dark:[border-color:rgba(var(--accent-rgb),_0.5)] tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))]">
          <header className="creator-chat-head tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:shrink-0 tw:min-h-[56px] tw:py-[10px] tw:pr-[12px] tw:pl-[18px] tw:[border-bottom:1px_solid_var(--line)]">
            <h2 className="tw:m-0 tw:text-[18px] tw:[font-family:Unbounded,sans-serif]">
              Чат-конструктор
            </h2>
            <span
              role="status"
              className="tw:ml-auto tw:text-[12px] tw:text-(--muted)"
            >
              {statusLabel}
            </span>
            <ChatIconButton
              label={isGenerationComplete ? 'Новый чат' : 'Очистить чат'}
              onClick={() =>
                isGenerationComplete
                  ? startNewChat()
                  : messages.length > 0
                    ? setIsClearConfirmOpen(true)
                    : clearChat()
              }
              disabled={isGenerating}
            >
              <IconNewChat />
            </ChatIconButton>
          </header>
          <ChatThread
            busy={isThinking || isGenerating}
            scrollKey={`${messages.length}:${isThinking}:${isGenerating}:${isGenerationComplete}:${awaitingLaunchConfirmation}`}
            centered={
              messages.length === 0 && !isThinking && !hasGenerationStarted
            }
            label="Переписка с ИИ-конструктором"
          >
            <div className="tw:w-full tw:mx-auto tw:flex tw:flex-col tw:gap-[18px]">
              {isAgentMockEnabled() ? (
                <ChatNotice tone="info" className="agent-mock-badge">
                  Демо-режим: ответы ИИ имитируются, модель не вызывается. Курс
                  создаётся настоящими запросами к backend.
                </ChatNotice>
              ) : null}
              {messages.length === 0 && !isThinking && !hasGenerationStarted ? (
                <ChatEmpty
                  title="Какой курс создадим?"
                  text="Опишите тему и аудиторию или прикрепите материалы. ИИ задаст пару вопросов, покажет описание курса, и только после подтверждения начнётся генерация."
                />
              ) : null}
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  text={message.text}
                  className="creator-chat-msg"
                  size="md"
                />
              ))}
              {isThinking ? (
                <ChatTyping label="Думаю над следующим уточнением…" />
              ) : null}
              {conversation?.error ? (
                <ChatNotice tone="error">{conversation.error}</ChatNotice>
              ) : null}
              {awaitingLaunchConfirmation ? (
                <ChatCard
                  className="creator-chat-launch"
                  title="Проверьте перед запуском"
                  actions={
                    <ChatButton
                      variant="primary"
                      onClick={() =>
                        setConfirmLaunchText(CONFIRM_LAUNCH_MESSAGE)
                      }
                    >
                      Проверить и запустить
                    </ChatButton>
                  }
                >
                  <span className="tw:text-(--muted)">
                    ИИ подготовил структуру курса. Проверьте описание и цели
                    обучения — после запуска генерацию нельзя отменить.
                  </span>
                </ChatCard>
              ) : null}
              {hasGenerationStarted && !isGenerationComplete ? (
                <ChatCard
                  className="creator-chat-progress"
                  role="status"
                  title="ИИ собирает структуру программы"
                >
                  <div className="tw:flex tw:items-baseline tw:justify-between tw:gap-[12px]">
                    <span className="tw:text-(--muted)">
                      {generationStatus}
                    </span>
                    <strong className="tw:text-[15px] tw:text-(--heading)">
                      {completionPercent}%
                    </strong>
                  </div>
                  <ChatProgress
                    value={completionPercent}
                    label="Готовность курса"
                  />
                  <span className="tw:text-[12.5px] tw:text-(--muted)">
                    Можно оставить страницу — генерация продолжится.
                  </span>
                </ChatCard>
              ) : null}
              {isGenerationComplete ? (
                <ChatCard
                  className="creator-chat-done"
                  role="status"
                  title="Курс готов"
                  actions={
                    <>
                      <ChatButton
                        variant="primary"
                        onClick={() =>
                          navigate(`/course/${generatedCourseId}/edit`)
                        }
                      >
                        Открыть курс
                      </ChatButton>
                      <ChatButton onClick={startNewChat}>Новый чат</ChatButton>
                    </>
                  }
                >
                  <span className="tw:text-(--muted)">
                    Курс сохранён черновиком. Откройте его, чтобы проверить и
                    отредактировать, или начните новый диалог.
                  </span>
                </ChatCard>
              ) : null}
              <div
                data-help-slot="creator"
                className="tw:w-full tw:min-w-0 tw:max-w-[760px] tw:self-start tw:empty:hidden"
              />
            </div>
          </ChatThread>
          {!isGenerating && !isGenerationComplete ? (
            <div className="tw:w-full tw:px-[18px] tw:pb-[16px]">
              <input
                ref={fileInputRef}
                type="file"
                className="tw:hidden"
                multiple
                accept=".pdf,.docx,.pptx,.xlsx,.md,.html,.txt,.json"
                onChange={pickFiles}
                disabled={isGenerating || isUploadingFiles}
              />
              {fileUploadError ? (
                <ChatNotice
                  tone="error"
                  className="tw:mx-[16px] tw:mb-[4px]"
                  actions={
                    uploadedFiles.length > 0 ? (
                      <ChatButton
                        size="sm"
                        onClick={() => submitMessage()}
                        disabled={
                          isUploadingFiles || isThinking || isGenerating
                        }
                      >
                        {isUploadingFiles ? 'Загружаю…' : 'Повторить загрузку'}
                      </ChatButton>
                    ) : null
                  }
                >
                  {fileUploadError}
                </ChatNotice>
              ) : null}
              <ChatComposer
                className="creator-chat-composer tw:[&_.ai-chat-input]:text-[16px]"
                showSendLabel
                sendLabel="Отправить"
                value={inputValue}
                onChange={(value) => {
                  setInputValue(value);
                  if (fileUploadError && uploadedFiles.length === 0) {
                    setFileUploadError('');
                  }
                }}
                onSubmit={() => submitMessage()}
                canSubmit={canSend}
                busy={isThinking || isUploadingFiles}
                disabled={isGenerating}
                placeholder={
                  currentQuestion?.placeholder ||
                  'Опишите курс: тема, для кого, сколько времени'
                }
                onAttach={() => fileInputRef.current?.click()}
                attachLabel="Прикрепить файлы"
                attachDisabled={isUploadingFiles}
                files={uploadedFiles.map((file) => ({
                  id: file.id,
                  name: file.name,
                  meta: `${file.sizeKb} КБ`,
                }))}
                onRemoveFile={
                  isUploadingFiles
                    ? undefined
                    : (id) =>
                        setUploadedFiles((files) =>
                          files.filter((file) => file.id !== id),
                        )
                }
                hint="PDF, DOCX, PPTX, XLSX, MD, HTML, TXT или JSON · Enter — отправить, Shift + Enter — новая строка"
                ariaLabel="Сообщение для ИИ"
              />
            </div>
          ) : null}
        </article>
      </div>
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
          if (text !== CONFIRM_LAUNCH_MESSAGE) setInputValue('');
          await submitMessage(text);
        }}
      >
        <div className="agent-launch-summary tw:p-[12px_14px] tw:rounded-[14px] tw:max-h-[46vh] tw:overflow-y-auto tw:leading-[1.5] tw:wrap-anywhere tw:[border:1px_solid_var(--app-modal-border)] tw:[background:var(--app-modal-row)] tw:[&_p]:m-[0_0_8px] tw:[&_ul]:m-[0_0_8px] tw:[&_ul]:pl-[20px] tw:[&_ol]:m-[0_0_8px] tw:[&_ol]:pl-[20px]">
          <ChatMarkdown>{lastAssistantMessage?.text || ''}</ChatMarkdown>
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
