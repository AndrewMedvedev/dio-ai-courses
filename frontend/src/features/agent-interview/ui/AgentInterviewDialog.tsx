import { useEffect, useMemo, useRef, useState } from "react";
import { AppModal } from "@/shared/ui/app-modal";
import {
  AiChatPanel,
  ChatButton,
  ChatCard,
  ChatComposer,
  ChatEmpty,
  ChatIconButton,
  ChatMarkdown,
  ChatMessage,
  ChatNotice,
  ChatThread,
  ChatTyping,
  IconNewChat,
  IconRetry,
} from "@/shared/ui/ai-chat";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import {
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

  const submit = () => {
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

  const panelTag = kind === "lesson" ? "Новый урок" : "Новый модуль";

  const thread = (
    <ChatThread
      busy={isThinking}
      scrollKey={`${messages.length}:${isThinking}:${open}:${job?.status || ""}:${error}`}
      centered={messages.length === 0 && !isThinking}
      label="Переписка с агентом"
    >
      {isAgentMockEnabled() ? (
        <ChatNotice tone="info" className="agent-mock-badge">
          Демо-режим: ответы ИИ имитируются, модель не вызывается. Модуль и
          уроки создаются настоящими запросами к backend.
        </ChatNotice>
      ) : null}
      {messages.length === 0 && !isThinking ? (
        <ChatEmpty title={texts.title} text={texts.intro} />
      ) : null}
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          role={message.role}
          text={message.text}
          className="agent-chat-message"
        />
      ))}
      {isThinking ? <ChatTyping label="Агент думает…" /> : null}
      {error ? (
        <ChatNotice
          tone="error"
          actions={
            lastSent ? (
              <ChatButton size="sm" onClick={retry}>
                <IconRetry size={14} />
                Отправить ещё раз
              </ChatButton>
            ) : null
          }
        >
          {error}
        </ChatNotice>
      ) : null}
      {awaitingConfirmation ? (
        <ChatCard
          className="agent-chat-launch"
          title="Проверьте перед запуском"
          actions={
            <ChatButton
              variant="primary"
              onClick={() => setConfirmText(CONFIRM_LAUNCH_MESSAGE)}
            >
              Проверить и запустить
            </ChatButton>
          }
        >
          <span className="tw:text-(--muted)">
            Агент подготовил описание и цели. После запуска генерацию нельзя
            отменить.
          </span>
        </ChatCard>
      ) : null}
      {isRunning ? (
        <ChatCard
          className="agent-chat-status"
          role="status"
          title={texts.running(job)}
        >
          <ChatTyping label="Генерация идёт" />
          <span className="tw:text-(--muted)">
            Новые данные появятся в редакторе автоматически.
          </span>
        </ChatCard>
      ) : null}
      {isDone ? (
        <ChatCard
          className="agent-chat-status is-done"
          role="status"
          title={texts.done(job)}
          actions={
            <>
              <ChatButton variant="primary" onClick={finishAndOpen}>
                {texts.open}
              </ChatButton>
              <ChatButton onClick={startAnother}>{texts.another}</ChatButton>
            </>
          }
        >
          <span className="tw:text-(--muted)">{texts.anotherHint}</span>
        </ChatCard>
      ) : null}
      {isFailed ? (
        <ChatNotice
          tone="error"
          className="agent-chat-status is-error"
          actions={
            <ChatButton size="sm" onClick={resetDialog}>
              Начать заново
            </ChatButton>
          }
        >
          {job.error || "Генерация не завершилась."}
        </ChatNotice>
      ) : null}
    </ChatThread>
  );

  const composer = !job ? (
    <ChatComposer
      className="agent-chat-form"
      value={input}
      onChange={setInput}
      onSubmit={submit}
      busy={isThinking}
      onStop={() => cancelRequest(conversationKey)}
      disabled={!canWrite}
      placeholder={texts.placeholder}
      textareaRef={inputRef}
      ariaLabel="Сообщение агенту"
      sendLabel="Отправить агенту"
    />
  ) : null;

  const canReset = messages.length > 0 || Boolean(job);

  return (
    <>
      {isFloating ? (
        <AiChatPanel
          open={open}
          onClose={onClose}
          tag={panelTag}
          title={contextTitle || texts.title}
          initialFocusRef={inputRef}
          className="agent-chat"
          headerActions={
            canReset ? (
              <ChatIconButton
                label="Начать новый диалог"
                onClick={() => setIsResetOpen(true)}
                disabled={isThinking}
              >
                <IconNewChat />
              </ChatIconButton>
            ) : null
          }
        >
          {thread}
          {composer}
        </AiChatPanel>
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
              {canReset ? (
                <ChatButton
                  onClick={() => setIsResetOpen(true)}
                  disabled={isThinking}
                >
                  Начать новый диалог
                </ChatButton>
              ) : null}
              <ChatButton variant="primary" onClick={onClose}>
                Закрыть
              </ChatButton>
            </>
          }
        >
          <div className="agent-chat tw:flex tw:flex-col tw:h-[min(64vh,620px)] tw:min-h-[360px] tw:-mx-[16px]">
            {thread}
            {composer}
          </div>
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
          <ChatMarkdown>{lastAssistant?.text || ""}</ChatMarkdown>
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
