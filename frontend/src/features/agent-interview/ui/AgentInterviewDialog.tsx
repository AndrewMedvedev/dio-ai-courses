import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppModal } from "@/shared/ui/app-modal";
import { FloatingWindow } from "@/shared/ui/floating-window";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
  AgentMarkdown,
  CONFIRM_LAUNCH_MESSAGE,
  extractTaskId,
  getLastAssistantMessage,
  getResponseText,
  isAwaitingLaunchConfirmation,
  looksLikeLaunchConfirmation,
  createAgentConversationKey,
  useAgentStore,
  type AgentType,
} from "@/entities/agent-chat";
import { autosizeTextarea } from "@/shared/lib/dom";
import { isAgentMockEnabled } from "@/shared/lib/agent-mock";
import {
  generationJobKey,
  useGenerationJobsStore,
  type GenerationJob,
  type GenerationJobKind,
} from "@/entities/generation-job";

interface InterviewTexts {
  agent: AgentType;
  eyebrow: string;
  title: string;
  intro: string;
  placeholder: string;
  started: string;
  confirmTitle: string;
  running: (job: GenerationJob) => string;
  done: (job: GenerationJob) => string;
  open: string;
  another: string;
  anotherHint: string;
}

const TEXTS: Record<GenerationJobKind, InterviewTexts> = {
  module: {
    agent: "module_interviewer",
    eyebrow: "ИИ-генерация модуля",
    title: "Новый модуль с ИИ",
    intro:
      "Расскажите, какой модуль нужен: тема, для кого он и что студент должен уметь после него. Агент задаст пару уточняющих вопросов, покажет структуру и стоимость и попросит подтвердить запуск.",
    placeholder:
      "Например: модуль про расчёт отпускных для бухгалтеров-новичков",
    started: "Генерация модуля запущена.",
    confirmTitle: "Запустить генерацию модуля?",
    running: (job) =>
      job.resultId
        ? `Модуль «${job.resultTitle || "без названия"}» создаётся. Готово уроков: ${job.lessonsCount}.`
        : "Модуль генерируется. Это может занять несколько минут — окно можно закрыть.",
    done: (job) =>
      `Модуль «${job.resultTitle || "без названия"}» готов: ${job.lessonsCount} урок(ов).`,
    open: "Открыть модуль",
    another: "Сгенерировать ещё модуль",
    anotherHint:
      "Новый модуль встанет сразу после этого. Другое место можно выбрать в списке модулей — кнопка «Сгенерировать модуль здесь».",
  },
  lesson: {
    agent: "lesson_interviewer",
    eyebrow: "ИИ-генерация урока",
    title: "Новый урок с ИИ",
    intro:
      "Опишите урок: какую тему он раскрывает, что студент уже знает и чему должен научиться. Агент уточнит детали, покажет структуру и попросит подтвердить запуск.",
    placeholder: "Например: урок о том, как считать НДФЛ с премии",
    started: "Генерация урока запущена.",
    confirmTitle: "Запустить генерацию урока?",
    running: () =>
      "Урок генерируется. Это может занять несколько минут — окно можно закрыть.",
    done: (job) => `Урок «${job.resultTitle || "без названия"}» готов.`,
    open: "Открыть урок",
    another: "Сгенерировать ещё урок",
    anotherHint:
      "Новый урок встанет сразу после этого. Другое место можно выбрать в списке уроков — кнопка «Сгенерировать урок здесь».",
  },
};

const conversationKeyFor = (
  kind: GenerationJobKind,
  courseId: string,
  moduleId = "",
) =>
  createAgentConversationKey(
    (TEXTS[kind] || TEXTS.module).agent,
    courseId,
    kind === "lesson" ? moduleId : "new-module",
  );

const jobKeyFor = (kind: GenerationJobKind, courseId: string, moduleId = "") =>
  generationJobKey(kind, courseId, kind === "lesson" ? moduleId : "");

/**
 * Начинает генерацию заново: удаляет переписку (следующий запрос уйдёт с новым chat_id)
 * и завершённую или упавшую генерацию. Окно чата при этом остаётся открытым.
 */
export function resetAgentInterview({
  kind,
  courseId,
  moduleId = "",
}: {
  kind: GenerationJobKind;
  courseId: string;
  moduleId?: string;
}) {
  const key = conversationKeyFor(kind, courseId, moduleId);
  const agentState = useAgentStore.getState();
  agentState.cancelRequest(key);
  agentState.clearConversation(key);
  useGenerationJobsStore
    .getState()
    .removeJob(jobKeyFor(kind, courseId, moduleId));
}

export interface AgentInterviewDialogProps {
  open: boolean;
  onClose: () => void;
  kind: GenerationJobKind;
  courseId: string;
  moduleId?: string;
  order?: number;
  knownIds?: string[];
  contextTitle?: string;
  onOpenResult?: (job: GenerationJob) => void;
  onStartAnother?: (job: GenerationJob | null) => void;
  variant?: "modal" | "floating";
}

/**
 * Диалог с ИИ-интервьюером модуля или урока.
 * chat_id хранится в agentStore (вместе с историей) и передаётся повторно,
 * пока пользователь не начнёт новый диалог.
 */
export function AgentInterviewDialog({
  open,
  onClose,
  kind,
  courseId,
  moduleId = "",
  order,
  knownIds = [],
  contextTitle = "",
  onOpenResult,
  // Вызывается по кнопке «Сгенерировать ещё»: родитель выбирает место для следующего.
  onStartAnother,
  // "modal" — модальное окно, "floating" — плавающее окно, которое можно
  // перетаскивать и растягивать, не закрывая доступ к редактору.
  variant = "modal",
}: AgentInterviewDialogProps) {
  const texts = TEXTS[kind] || TEXTS.module;
  const conversationKey = useMemo(
    () => conversationKeyFor(kind, courseId, moduleId),
    [courseId, kind, moduleId],
  );
  const jobKey = jobKeyFor(kind, courseId, moduleId);

  const conversation = useAgentStore(
    (state) => state.conversations[conversationKey],
  );
  const initializeConversation = useAgentStore(
    (state) => state.initializeConversation,
  );
  const sendAgentMessage = useAgentStore((state) => state.sendMessage);
  const appendMessage = useAgentStore((state) => state.appendMessage);
  const removeLastMessage = useAgentStore((state) => state.removeLastMessage);
  const clearConversation = useAgentStore((state) => state.clearConversation);
  const cancelRequest = useAgentStore((state) => state.cancelRequest);
  const job = useGenerationJobsStore((state) => state.jobs[jobKey] || null);
  const startJob = useGenerationJobsStore((state) => state.startJob);
  const removeJob = useGenerationJobsStore((state) => state.removeJob);

  const [input, setInput] = useState("");
  const [lastSent, setLastSent] = useState("");
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isFloating = variant === "floating";

  const messages = conversation?.messages || [];
  const isThinking = conversation?.status === "loading";
  const error = conversation?.status === "error" ? conversation.error : "";
  const isRunning = job?.status === "running";
  const isDone = job?.status === "done";
  const isFailed = job?.status === "error";
  const awaitingConfirmation =
    !job && !isThinking && isAwaitingLaunchConfirmation(messages);
  const lastAssistant = getLastAssistantMessage(messages);
  const canWrite =
    Boolean(courseId) && (kind !== "lesson" || Boolean(moduleId));

  useEffect(() => {
    if (!open || !courseId) return;
    initializeConversation({
      key: conversationKey,
      agent: texts.agent,
      courseId,
    });
  }, [conversationKey, courseId, initializeConversation, open, texts.agent]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages.length, isThinking, open, job?.status]);

  useEffect(() => {
    if (!open || !isFloating) return;
    window.requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
  }, [isFloating, open]);

  useEffect(() => {
    autosizeTextarea(inputRef.current, 180);
  }, [input, open]);

  const send = async (text: string) => {
    const content = String(text || "").trim();
    if (!content || isThinking || job || !canWrite) return;
    setLastSent(content);
    setInput("");
    try {
      const response = await sendAgentMessage({
        key: conversationKey,
        agent: texts.agent,
        courseId,
        content,
        editorPayload: {
          order,
          ...(kind === "lesson" ? { module_id: moduleId } : {}),
        },
        emptyResponseMessage:
          "Агент вернул пустой ответ. Попробуйте переформулировать.",
        responseDisplayMessage: (result) =>
          getResponseText(result, texts.started),
      });
      if (!response) return;
      const taskId = extractTaskId(response);
      if (taskId) {
        startJob({
          key: jobKey,
          kind,
          courseId,
          moduleId,
          order,
          taskId,
          chatKey: conversationKey,
          knownIds,
        });
      }
    } catch {
      // Ошибка показывается из agentStore; текст можно отправить повторно.
    }
  };

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault?.();
    const text = input.trim();
    if (!text) return;
    // Согласие на запуск сначала показываем в окне подтверждения.
    if (awaitingConfirmation && looksLikeLaunchConfirmation(text)) {
      setConfirmText(text);
      return;
    }
    send(text);
  };

  const retry = () => {
    if (!lastSent) return;
    removeLastMessage(conversationKey, "user");
    send(lastSent);
  };

  const resetDialog = () => {
    cancelRequest(conversationKey);
    clearConversation(conversationKey);
    removeJob(jobKey);
    initializeConversation({
      key: conversationKey,
      agent: texts.agent,
      courseId,
    });
    setInput("");
    setLastSent("");
    setIsResetOpen(false);
  };

  // Готовый результат остаётся в редакторе, а чат сразу готов к следующей генерации.
  const startAnother = () => {
    const result = job;
    resetDialog();
    onStartAnother?.(result);
  };

  const finishAndOpen = () => {
    if (!job) return;
    const result = job;
    // Диалог завершён: следующий запуск начнётся с нового chat_id.
    clearConversation(conversationKey);
    removeJob(jobKey);
    onOpenResult?.(result);
  };

  const chatBody = (
    <div className="agent-chat tw:flex tw:gap-[12px] tw:flex-[1_1_auto] tw:min-h-[0] tw:flex-col">
      {isAgentMockEnabled() ? (
        <p className="agent-mock-badge tw:m-[0_0_12px] tw:p-[8px_12px] tw:rounded-[12px] tw:text-(--text) tw:text-[0.86rem] tw:font-[700] tw:[border:1px_dashed_rgba(212,_150,_30,_0.6)] tw:[background:rgba(212,_150,_30,_0.12)]">
          Демо-режим: ответы ИИ имитируются, модель не вызывается. Модуль и
          уроки создаются настоящими запросами к backend.
        </p>
      ) : null}
      <div
        className="agent-chat-messages tw:grid tw:gap-[10px] tw:max-h-[none] tw:min-h-[80px] tw:p-[4px_2px] tw:overflow-y-auto tw:flex-[1_1_auto]"
        ref={messagesRef}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <p className="agent-chat-empty tw:text-(--muted) tw:text-[0.92rem]">
            {texts.intro}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`agent-chat-message tw:max-w-[88%] tw:p-[10px_14px] tw:rounded-[16px] tw:leading-[1.5] tw:wrap-anywhere tw:[&.is-system]:max-w-[100%] tw:[&.is-system]:justify-self-center tw:[&.is-system]:text-(--text) tw:[&.is-system]:font-[700] tw:[&.is-system]:text-center tw:[&.is-user]:[justify-self:end] tw:[&.is-assistant]:[justify-self:start] tw:[&.is-user]:[background:rgba(var(--accent-rgb),_0.22)] tw:[&.is-assistant]:[background:var(--app-modal-row)] tw:[&.is-system]:[background:rgba(47,_125,_79,_0.12)] tw:[&.is-assistant]:[border:1px_solid_var(--app-modal-border)] tw:[&_p]:m-[0_0_8px] tw:[&_p:last-child]:mb-[0] tw:[&_ul]:m-[0_0_8px] tw:[&_ul]:pl-[20px] tw:[&_ul:last-child]:mb-[0] tw:[&_ol:last-child]:mb-[0] tw:[&_ol]:m-[0_0_8px] tw:[&_ol]:pl-[20px] is-${message.role}`}
            >
              {message.role === "assistant" ? (
                <AgentMarkdown>{message.text}</AgentMarkdown>
              ) : (
                message.text
              )}
            </div>
          ))
        )}
        {isThinking ? (
          <span className="agent-chat-thinking tw:text-(--muted) tw:text-[0.92rem] tw:inline-flex tw:items-center tw:gap-[8px] tw:[&::before]:w-[14px] tw:[&::before]:h-[14px] tw:[&::before]:border-solid tw:[&::before]:border-[rgba(var(--accent-rgb),_0.35)] tw:[&::before]:rounded-[50%] tw:[&::before]:[content:''] tw:[&::before]:[border-width:2px] tw:[&::before]:[border-top-color:rgba(var(--accent-rgb),_0.95)] tw:[&::before]:animate-app-modal-spin">
            Агент думает...
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          className="agent-chat-status is-error tw:grid tw:gap-[4px] tw:p-[10px_14px] tw:rounded-[14px] tw:text-[0.92rem] tw:text-(--app-modal-danger) tw:[background:rgba(180,_35,_24,_0.1)] tw:[&.is-done_>_span]:text-(--muted) tw:[&.is-done_>_span]:text-[0.84rem] tw:[&_>_div]:flex tw:[&_>_div]:flex-wrap tw:[&_>_div]:gap-[8px] tw:[&_>_div]:mt-[6px]"
          role="alert"
        >
          <span>{error}</span>
          {lastSent ? (
            <div>
              <button
                type="button"
                className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={retry}
              >
                Отправить ещё раз
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {awaitingConfirmation ? (
        <div className="agent-chat-launch tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[10px] tw:p-[10px_14px] tw:rounded-[14px] tw:[border:1px_solid_rgba(47,_125,_79,_0.35)] tw:[background:rgba(47,_125,_79,_0.08)]">
          <span className="tw:text-(--muted) tw:text-[0.88rem]">
            Агент подготовил описание и цели. Проверьте их перед запуском —
            после запуска генерацию нельзя отменить.
          </span>
          <button
            type="button"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            onClick={() => setConfirmText(CONFIRM_LAUNCH_MESSAGE)}
          >
            Проверить и запустить
          </button>
        </div>
      ) : null}

      {isRunning ? (
        <div
          className="agent-chat-status tw:grid tw:gap-[4px] tw:p-[10px_14px] tw:rounded-[14px] tw:text-[0.92rem] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[&.is-done_>_span]:text-(--muted) tw:[&.is-done_>_span]:text-[0.84rem] tw:[&_>_div]:flex tw:[&_>_div]:flex-wrap tw:[&_>_div]:gap-[8px] tw:[&_>_div]:mt-[6px]"
          role="status"
        >
          <strong>{texts.running(job)}</strong>
          <span>Новые данные появятся в редакторе автоматически.</span>
        </div>
      ) : null}
      {isDone ? (
        <div
          className="agent-chat-status is-done tw:grid tw:gap-[4px] tw:p-[10px_14px] tw:rounded-[14px] tw:text-[0.92rem] tw:[background:rgba(47,_125,_79,_0.12)] tw:[&.is-done_>_span]:text-(--muted) tw:[&.is-done_>_span]:text-[0.84rem] tw:[&_>_div]:flex tw:[&_>_div]:flex-wrap tw:[&_>_div]:gap-[8px] tw:[&_>_div]:mt-[6px]"
          role="status"
        >
          <strong>{texts.done(job)}</strong>
          <span>{texts.anotherHint}</span>
          <div>
            <button
              type="button"
              className="btn btn-solid tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
              onClick={startAnother}
            >
              {texts.another}
            </button>
            <button
              type="button"
              className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
              onClick={finishAndOpen}
            >
              {texts.open}
            </button>
          </div>
        </div>
      ) : null}
      {isFailed ? (
        <div
          className="agent-chat-status is-error tw:grid tw:gap-[4px] tw:p-[10px_14px] tw:rounded-[14px] tw:text-[0.92rem] tw:text-(--app-modal-danger) tw:[background:rgba(180,_35,_24,_0.1)] tw:[&.is-done_>_span]:text-(--muted) tw:[&.is-done_>_span]:text-[0.84rem] tw:[&_>_div]:flex tw:[&_>_div]:flex-wrap tw:[&_>_div]:gap-[8px] tw:[&_>_div]:mt-[6px]"
          role="alert"
        >
          <span>{job.error || "Генерация не завершилась."}</span>
          <div>
            <button
              type="button"
              className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
              onClick={resetDialog}
            >
              Начать заново
            </button>
          </div>
        </div>
      ) : null}

      {!job ? (
        <form
          className="agent-chat-form tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[10px] tw:[align-items:end]"
          onSubmit={submit}
        >
          <textarea
            className="tw:min-h-[44px] tw:max-h-[180px] tw:resize-none tw:p-[10px_12px] tw:rounded-[14px] tw:text-(--text) tw:[font:inherit] tw:[border:1px_solid_var(--app-modal-border)] tw:[background:var(--app-modal-row)] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.9]"
            ref={(element) => {
              inputRef.current = element;
              autosizeTextarea(element, 180);
            }}
            rows={1}
            value={input}
            placeholder={texts.placeholder}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            disabled={isThinking || !canWrite}
            maxLength={10000}
            aria-label="Сообщение агенту"
          />
          <button
            type="submit"
            className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
            disabled={isThinking || !input.trim() || !canWrite}
          >
            {isThinking ? "Ждём ответ..." : "Отправить"}
          </button>
        </form>
      ) : null}
    </div>
  );

  const resetButton =
    messages.length > 0 || job ? (
      <button
        type="button"
        className="btn btn-outline tw:min-h-[32px] tw:text-[0.8rem] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[&&&&]:p-[3px_12px] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
        onClick={() => setIsResetOpen(true)}
        disabled={isThinking}
      >
        Начать новый диалог
      </button>
    ) : null;

  if (isFloating && !open) return null;

  return (
    <>
      {isFloating ? (
        <FloatingWindow
          open={open}
          onClose={onClose}
          eyebrow={texts.eyebrow}
          title={texts.title}
          subtitle={contextTitle}
          storageKey={`agent-${kind}`}
          defaultSize={{ width: 460, height: 620 }}
          headerActions={resetButton}
        >
          {chatBody}
        </FloatingWindow>
      ) : (
        <AppModal
          open={open}
          onClose={onClose}
          size="lg"
          eyebrow={texts.eyebrow}
          title={texts.title}
          description={contextTitle}
          footer={
            <>
              {resetButton}
              <button
                type="button"
                className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={onClose}
              >
                Закрыть
              </button>
            </>
          }
        >
          {chatBody}
        </AppModal>
      )}

      <ConfirmDialog
        open={confirmText !== null}
        title={texts.confirmTitle}
        eyebrow="Проверьте перед запуском"
        description="Описание и цели обучения, которые подготовил агент. Если что-то не так — нажмите «Отмена» и напишите правки в чат."
        confirmLabel="Подтвердить и запустить"
        busyLabel="Отправляем..."
        size="lg"
        onCancel={() => setConfirmText(null)}
        onConfirm={async () => {
          const text = confirmText || CONFIRM_LAUNCH_MESSAGE;
          setConfirmText(null);
          await send(text);
        }}
      >
        <div className="agent-launch-summary tw:p-[12px_14px] tw:rounded-[14px] tw:max-h-[46vh] tw:overflow-y-auto tw:leading-[1.5] tw:wrap-anywhere tw:[border:1px_solid_var(--app-modal-border)] tw:[background:var(--app-modal-row)] tw:[&_p]:m-[0_0_8px] tw:[&_ul]:m-[0_0_8px] tw:[&_ul]:pl-[20px] tw:[&_ol]:m-[0_0_8px] tw:[&_ol]:pl-[20px]">
          <AgentMarkdown>{lastAssistant?.text || ""}</AgentMarkdown>
        </div>
        <p className="app-modal-note tw:m-[0] tw:text-(--muted) tw:text-[0.9rem]">
          После подтверждения агент поставит генерацию в очередь. Готовый
          результат появится в редакторе — следить за ним можно в этом окне.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={isResetOpen}
        title="Начать новый диалог?"
        description={
          isRunning
            ? "Текущая переписка удалится. Уже запущенная генерация продолжится на сервере, но окно перестанет за ней следить."
            : "Текущая переписка с агентом удалится, следующий диалог начнётся с нуля."
        }
        confirmLabel="Начать заново"
        danger
        onCancel={() => setIsResetOpen(false)}
        onConfirm={resetDialog}
      />
    </>
  );
}
