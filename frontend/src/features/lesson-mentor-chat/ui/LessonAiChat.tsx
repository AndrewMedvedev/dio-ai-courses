import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createAgentConversationKey,
  useAgentStore,
} from "@/entities/agent-chat";

const COMPACT_QUERY = "(max-width: 1300px)";
const QUICK_PROMPTS = [
  "Объяснить проще",
  "Привести пример",
  "Составить краткий конспект",
  "Помочь с практическим заданием",
];

function safeMarkdownUrl(url: string) {
  const value = String(url || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^(\/|\.{1,2}\/|#)/.test(value)) return value;
  return value.includes(":") ? "" : value;
}

export interface LessonAiChatProps {
  courseId: string;
  lessonId?: string;
  lessonTitle?: string;
  contentBlocks?: unknown[];
  onDownloadSummary?: () => void;
  panelId: string;
  focusOnOpen?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onAssistantResponse?: () => void;
}

/** Чат с ИИ-наставником по материалам урока: панель справа или диалог на узком экране. */
export function LessonAiChat({
  courseId,
  lessonId,
  lessonTitle,
  contentBlocks = [],
  onDownloadSummary,
  panelId,
  focusOnOpen = false,
  isOpen,
  onClose,
  onAssistantResponse,
}: LessonAiChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia(COMPACT_QUERY).matches,
  );
  const messagesRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const latestAssistantMessageRef = useRef<string | null>(null);
  const didObserveMessagesRef = useRef(false);
  const conversationKey = useMemo(
    () => createAgentConversationKey("mentor", courseId, lessonId),
    [courseId, lessonId],
  );
  const conversation = useAgentStore(
    (state) => state.conversations[conversationKey],
  );
  const initializeConversation = useAgentStore(
    (state) => state.initializeConversation,
  );
  const sendAgentMessage = useAgentStore((state) => state.sendMessage);
  const cancelRequest = useAgentStore((state) => state.cancelRequest);
  const messages = conversation?.messages || [];
  const isSending = conversation?.status === "loading";

  useEffect(() => {
    initializeConversation({
      key: conversationKey,
      agent: "mentor",
      courseId,
    });
    return () => cancelRequest(conversationKey);
  }, [cancelRequest, conversationKey, courseId, initializeConversation]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_QUERY);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsCompact(event.matches);
    setIsCompact(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    const latestAssistantMessageId = latestAssistantMessage?.id || null;

    if (!didObserveMessagesRef.current) {
      didObserveMessagesRef.current = true;
      latestAssistantMessageRef.current = latestAssistantMessageId;
      return;
    }

    if (
      latestAssistantMessageId &&
      latestAssistantMessageId !== latestAssistantMessageRef.current
    ) {
      latestAssistantMessageRef.current = latestAssistantMessageId;
      if (!isOpen) onAssistantResponse?.();
    }
  }, [isOpen, messages, onAssistantResponse]);

  useEffect(() => {
    const container = messagesRef.current;
    if (container && isOpen) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isSending, isOpen]);

  useEffect(() => {
    if (isOpen && !isCompact && focusOnOpen) {
      closeButtonRef.current?.focus();
    }
  }, [focusOnOpen, isCompact, isOpen]);

  useEffect(() => {
    if (!isOpen || !isCompact) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCompact, isOpen, onClose]);

  const sendMessage = async (value: string = inputValue) => {
    const prompt = value.trim();
    if (!prompt || isSending || !courseId) return;

    setInputValue("");
    try {
      await sendAgentMessage({
        key: conversationKey,
        agent: "mentor",
        courseId,
        content: prompt,
        contentBlocks,
      });
    } catch {
      // Публичная ошибка уже сохранена в store; технические детали не логируем.
    }
  };

  return (
    <>
      {isOpen && isCompact && (
        <button
          type="button"
          className="lesson-chat-backdrop tw:text-[0.96rem] tw:leading-[1.45] tw:max-1300:fixed tw:max-1300:z-[89] tw:max-1300:inset-[0] tw:max-1300:w-[100%] tw:max-1300:h-[100%] tw:max-1300:p-[0] tw:max-1300:cursor-pointer tw:max-1300:[border:0] tw:max-1300:[background:rgba(20,_18,_16,_0.46)] tw:max-1300:[backdrop-filter:blur(2px)]"
          onClick={onClose}
          tabIndex={-1}
          aria-label="Закрыть ИИ-чат"
        />
      )}
      <aside
        ref={panelRef}
        id={panelId}
        className="lesson-page-ai-chat tw:grid tw:sticky tw:h-[min(720px,_calc(100vh_-_104px))] tw:min-h-[min(520px,_calc(100vh_-_104px))] tw:max-h-[calc(100vh_-_88px)] tw:overflow-hidden tw:border-solid tw:border-[rgba(255,_255,_255,_0.68)] tw:rounded-[14px] tw:p-[12px] tw:grid-rows-[auto_minmax(210px,_1fr)_auto] tw:gap-[10px] tw:min-1301:top-[72px] tw:max-1300:inset-[0_0_0_auto] tw:min-1301:w-[100%] tw:max-1300:w-[min(480px,_100vw)] tw:max-760:w-[100vw] tw:[&[hidden]]:hidden tw:max-1300:fixed tw:[align-self:start] tw:max-1300:h-[100dvh] tw:max-1300:min-h-[0] tw:max-1300:max-h-[100dvh] tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.2)] tw:max-1300:rounded-[18px_0_0_18px] tw:max-760:rounded-[0] tw:[background:linear-gradient(_145deg,_rgba(255,_255,_255,_0.52),_rgba(255,_255,_255,_0.2)_)] tw:[backdrop-filter:blur(20px)_saturate(130%)] tw:[-webkit-backdrop-filter:blur(20px)_saturate(130%)] tw:max-1300:pt-[max(12px,_env(safe-area-inset-top))] tw:max-1300:pr-[max(12px,_env(safe-area-inset-right))] tw:max-1300:pb-[max(12px,_env(safe-area-inset-bottom))] tw:max-760:pl-[max(10px,_env(safe-area-inset-left))] tw:[box-shadow:0_16px_40px_rgba(79,_67,_48,_0.1),_var(--glass-inset)] tw:[transition:min-height_220ms_ease,_padding_220ms_ease,_border-radius_220ms_ease] tw:max-1300:z-[90] tw:max-760:[border-width:0] tw:dark:[background:linear-gradient(_145deg,_rgba(255,_255,_255,_0.13),_rgba(255,_255,_255,_0.055)_)] tw:dark:[box-shadow:0_16px_40px_rgba(0,_0,_0,_0.22),_var(--glass-inset)] tw:motion-reduce:[transition:none]"
        aria-labelledby={`${panelId}-title`}
        role={isCompact ? "dialog" : "complementary"}
        aria-modal={isCompact ? "true" : undefined}
        hidden={!isOpen}
      >
        <div className="lesson-ai-editor-head tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[10px] tw:[.lesson-page-ai-chat.is-collapsed_&]:hidden tw:[align-items:start] tw:min-1000:[.page_.dnd-builder_.dnd-inspector_.lesson-editor-block-row.has-ai_>_.lesson-ai-editor_&_span::after]:[content:'_·_блок_'_counter(dnd-block)]">
          <div className="lesson-page-ai-chat-title tw:min-w-[0]">
            <span
              className="tw:block tw:text-(--heading) tw:text-[0.72rem] tw:font-[900] tw:tracking-[0.07em] tw:uppercase tw:col-[1] tw:min-w-[0] tw:wrap-anywhere"
              id={`${panelId}-title`}
            >
              ИИ-чат
            </span>
            <strong className="tw:block tw:mt-[4px] tw:text-(--muted) tw:col-[1] tw:min-w-[0] tw:wrap-anywhere tw:text-[0.76rem] tw:font-[700] tw:leading-[1.35]">
              {lessonTitle ? `По уроку: ${lessonTitle}` : "По материалам урока"}
            </strong>
          </div>
          <div className="lesson-page-ai-chat-head-actions tw:col-[2] tw:row-[1_/_span_2] tw:flex tw:items-start tw:gap-[6px]">
            {onDownloadSummary && (
              <button
                type="button"
                className="lesson-page-ai-chat-download tw:[.lesson-ai-editor-head_&_span]:block tw:[.lesson-ai-editor-head_&_span]:text-[inherit] tw:[.lesson-ai-editor-head_&_span]:text-[1rem] tw:[.lesson-ai-editor-head_&_span]:leading-[1]"
                onClick={onDownloadSummary}
                aria-label="Сохранить конспект урока в PDF"
                title="Сохранить конспект в PDF"
              >
                <span aria-hidden="true">⇩</span>
              </button>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              className="lesson-page-ai-chat-toggle tw:col-[auto] tw:row-[auto] tw:w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(255,_255,_255,_0.72)] tw:rounded-[50%] tw:text-(--ink-accent) tw:p-[0] tw:cursor-pointer tw:min-w-[34px] tw:grid tw:[align-self:start] tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.2)] tw:[background:rgba(255,_255,_255,_0.34)] tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[box-shadow:0_5px_14px_rgba(var(--accent-rgb),_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.75)] tw:[transition:transform_160ms_ease,_box-shadow_160ms_ease] tw:[place-items:center] tw:hover:[background:rgba(255,_255,_255,_0.52)] tw:dark:[background:rgba(255,_255,_255,_0.08)] tw:hover:[box-shadow:0_7px_18px_rgba(var(--accent-rgb),_0.24),_inset_0_1px_0_rgba(255,_255,_255,_0.86)] tw:hover:[transform:translateY(-1px)] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px] tw:dark:hover:[background:rgba(255,_255,_255,_0.08)]"
              onClick={onClose}
              aria-label={isCompact ? "Вернуться к уроку" : "Закрыть ИИ-чат"}
              title={isCompact ? "Вернуться к уроку" : "Закрыть чат"}
            >
              <span
                className="tw:block tw:text-[inherit] tw:text-[1.25rem] tw:tracking-[normal] tw:normal-case tw:col-[1] tw:min-w-[0] tw:wrap-anywhere tw:leading-[1] tw:[font-weight:inherit]"
                aria-hidden="true"
              >
                ×
              </span>
            </button>
          </div>
        </div>

        <div
          className="lesson-page-ai-chat-messages tw:min-h-[210px] tw:overflow-y-auto tw:flex tw:flex-col tw:gap-[14px] tw:p-[8px_4px_16px] tw:[overscroll-behavior-y:contain] tw:[.lesson-page-ai-chat.is-collapsed_&]:hidden tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.58)_transparent]"
          ref={messagesRef}
          aria-live="polite"
          aria-busy={isSending}
        >
          {messages.length === 0 && !isSending && (
            <div className="lesson-chat-empty-state tw:min-h-[100%] tw:grid tw:content-center tw:gap-[16px] tw:p-[12px_4px] tw:text-center">
              <div>
                <span aria-hidden="true">✦</span>
                <h2 className="tw:m-[8px_0_6px]">Чем помочь по этому уроку?</h2>
                <p className="tw:m-[0] tw:text-(--muted)">
                  Спросите о сложном месте или выберите быстрый запрос.
                </p>
              </div>
              <div
                className="lesson-chat-quick-actions tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[8px] tw:max-760:grid-cols-[1fr]"
                aria-label="Быстрые запросы"
              >
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    className="tw:min-h-[42px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[10px] tw:text-(--heading) tw:p-[8px] tw:cursor-pointer tw:[border-width:1px] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[font:inherit] tw:[&&]:font-[750] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:disabled:cursor-not-allowed tw:disabled:opacity-[0.55] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px] tw:[&:hover:not(:disabled)]:border-[rgba(var(--accent-rgb),_0.72)] tw:[&:hover:not(:disabled)]:[background:rgba(var(--accent-rgb),_0.2)]"
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    disabled={isSending || !courseId}
                    aria-label={`${prompt} по текущему уроку`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`lesson-page-ai-chat-message tw:w-[fit-content] tw:max-w-[94%] tw:grid tw:self-start tw:gap-[8px] tw:border-solid tw:border-[rgba(255,_255,_255,_0.62)] tw:rounded-[16px_16px_16px_5px] tw:text-(--text) tw:p-[11px_12px] tw:text-[0.86rem] tw:leading-[1.58] tw:wrap-anywhere tw:[&.is-user]:max-w-[88%] tw:[&.is-user]:self-end tw:[border-width:1px] tw:[&.is-user]:border-[rgba(var(--accent-rgb),_0.58)] tw:dark:border-[rgba(255,_255,_255,_0.14)] tw:[&.is-user]:rounded-[16px_16px_5px_16px] tw:[background:rgba(255,_255,_255,_0.44)] tw:[&.is-user]:text-(--heading) tw:[box-shadow:0_8px_20px_rgba(79,_67,_48,_0.08),_inset_0_1px_0_rgba(255,_255,_255,_0.54)] tw:[&.is-thinking]:items-stretch tw:dark:[.page_&.is-user]:border-[rgba(var(--accent-rgb),_0.48)] tw:dark:[&.is-user]:border-[rgba(255,_255,_255,_0.14)] tw:[&.is-user]:[background:linear-gradient(_145deg,_rgba(var(--accent-rgb),_0.28),_rgba(var(--accent-rgb),_0.16)_)] tw:dark:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_&.is-user]:[background:linear-gradient(_145deg,_rgba(var(--accent-rgb),_0.25),_rgba(var(--accent-rgb),_0.14)_)] tw:dark:[&.is-user]:[background:rgba(255,_255,_255,_0.08)] tw:dark:[.page_&.is-user]:[&.is-user]:[&&&&]:border-[rgba(var(--accent-rgb),_0.48)] tw:dark:[.page_&.is-user]:[&.is-user]:[&&&&]:[background:linear-gradient(_145deg,_rgba(var(--accent-rgb),_0.25),_rgba(var(--accent-rgb),_0.14)_)] is-${message.role}`}
            >
              <div className="lesson-chat-message-meta tw:flex tw:items-center tw:gap-[7px] tw:text-(--muted) tw:text-[0.7rem] tw:leading-[1] tw:[.lesson-page-ai-chat-message.is-user_&]:text-(--ink-accent) tw:[.lesson-page-ai-chat-message.is-user_&]:justify-end">
                <span
                  className="lesson-chat-message-avatar tw:w-[24px] tw:h-[24px] tw:grid tw:flex-[0_0_auto] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[50%] tw:text-(--ink-accent) tw:text-[0.66rem] tw:font-[900] tw:[place-items:center] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[background:rgba(var(--accent-rgb),_0.16)] tw:[.lesson-page-ai-chat-message.is-user_&]:[background:rgba(255,_255,_255,_0.3)] tw:dark:[background:rgba(var(--accent-rgb),_0.2)] tw:[.lesson-page-ai-chat-message.is-user_&]:[order:2] tw:dark:[.lesson-page-ai-chat-message.is-user_&]:[background:rgba(var(--accent-rgb),_0.2)]"
                  aria-hidden="true"
                >
                  {message.role === "assistant" ? "✦" : "Вы"}
                </span>
                <strong className="tw:text-[inherit] tw:tracking-[0.02em] tw:text-[length:inherit]">
                  {message.role === "assistant" ? "ИИ-помощник" : "Вы"}
                </strong>
              </div>
              <div className="lesson-chat-message-body tw:min-w-[0] tw:[.lesson-page-ai-chat-message.is-thinking_&]:flex tw:[.lesson-page-ai-chat-message.is-thinking_&]:items-center tw:[.lesson-page-ai-chat-message.is-thinking_&]:gap-[8px] tw:[.lesson-page-ai-chat-message.is-thinking_&]:text-(--muted) tw:[&_>_:first-child]:mt-[0] tw:[&_p]:m-[0_0_0.75em] tw:[&_>_:last-child]:mb-[0] tw:[&_ul]:m-[0_0_0.75em] tw:[&_ul]:pl-[1.35em] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_a]:wrap-anywhere tw:[&_ol]:m-[0_0_0.75em] tw:[&_pre]:m-[0_0_0.75em] tw:[&_blockquote]:m-[0_0_0.75em] tw:[&_ol]:pl-[1.35em] tw:[&_pre]:max-w-[100%] tw:[&_pre]:overflow-x-auto tw:[&_pre]:p-[10px] tw:[&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:[&_pre]:rounded-[10px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:whitespace-pre tw:[&_blockquote]:[border-left:3px_solid_rgba(var(--accent-rgb),_0.62)] tw:[&_blockquote]:pl-[10px] tw:[&_blockquote]:text-(--muted) tw:dark:[.page_&_pre]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_&_pre]:[background:rgba(0,_0,_0,_0.28)]">
                {message.role === "assistant" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={safeMarkdownUrl}
                  >
                    {message.text}
                  </ReactMarkdown>
                ) : (
                  <span className="tw:[.lesson-page-ai-chat-message.is-user_.lesson-chat-message-body_>_&]:whitespace-pre-wrap">
                    {message.text}
                  </span>
                )}
              </div>
              {message.role === "user" && (
                <span className="chat-message-status tw:block tw:mt-[2px] tw:text-(--muted) tw:text-[0.66rem] tw:font-[700] tw:leading-[1.2] tw:text-right">
                  ✓ Отправлено
                </span>
              )}
            </article>
          ))}
          {isSending && (
            <article className="lesson-page-ai-chat-message is-assistant is-thinking tw:grid tw:items-stretch tw:gap-[8px] tw:w-[fit-content] tw:max-w-[94%] tw:self-start tw:border-solid tw:border-[rgba(255,_255,_255,_0.62)] tw:rounded-[16px_16px_16px_5px] tw:text-(--text) tw:p-[11px_12px] tw:text-[0.86rem] tw:leading-[1.58] tw:wrap-anywhere tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.14)] tw:[background:rgba(255,_255,_255,_0.44)] tw:[box-shadow:0_8px_20px_rgba(79,_67,_48,_0.08),_inset_0_1px_0_rgba(255,_255,_255,_0.54)] tw:dark:[background:rgba(255,_255,_255,_0.08)]">
              <div className="lesson-chat-message-meta tw:flex tw:items-center tw:gap-[7px] tw:text-(--muted) tw:text-[0.7rem] tw:leading-[1]">
                <span
                  className="lesson-chat-message-avatar tw:w-[24px] tw:h-[24px] tw:grid tw:flex-[0_0_auto] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[50%] tw:text-(--ink-accent) tw:text-[0.66rem] tw:font-[900] tw:[place-items:center] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.5)] tw:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[background:rgba(var(--accent-rgb),_0.2)]"
                  aria-hidden="true"
                >
                  ✦
                </span>
                <strong className="tw:text-[inherit] tw:tracking-[0.02em] tw:text-[length:inherit]">
                  ИИ-помощник
                </strong>
              </div>
              <div className="lesson-chat-message-body tw:min-w-[0] tw:flex tw:items-center tw:gap-[8px] tw:text-(--muted) tw:[&_>_:first-child]:mt-[0] tw:[&_p]:m-[0_0_0.75em] tw:[&_>_:last-child]:mb-[0] tw:[&_ul]:m-[0_0_0.75em] tw:[&_ul]:pl-[1.35em] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_a]:wrap-anywhere tw:[&_ol]:m-[0_0_0.75em] tw:[&_pre]:m-[0_0_0.75em] tw:[&_blockquote]:m-[0_0_0.75em] tw:[&_ol]:pl-[1.35em] tw:[&_pre]:max-w-[100%] tw:[&_pre]:overflow-x-auto tw:[&_pre]:p-[10px] tw:[&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.2)] tw:[&_pre]:rounded-[10px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:whitespace-pre tw:[&_blockquote]:[border-left:3px_solid_rgba(var(--accent-rgb),_0.62)] tw:[&_blockquote]:pl-[10px] tw:[&_blockquote]:text-(--muted) tw:dark:[.page_&_pre]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_&_pre]:[background:rgba(0,_0,_0,_0.28)]">
                <span
                  className="chat-thinking-dots tw:inline-flex tw:items-center tw:gap-[3px] tw:flex-[0_0_auto]"
                  aria-hidden="true"
                >
                  <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(2)]:[animation-delay:160ms] tw:[&:nth-child(3)]:[animation-delay:320ms]" />
                  <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(2)]:[animation-delay:160ms] tw:[&:nth-child(3)]:[animation-delay:320ms]" />
                  <i className="tw:w-[5px] tw:h-[5px] tw:rounded-[50%] tw:opacity-[0.35] tw:[background:currentColor] tw:motion-reduce:opacity-[0.65] tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none tw:[&:nth-child(3)]:[animation-delay:320ms] tw:[&:nth-child(2)]:[animation-delay:160ms]" />
                </span>
                <span>Готовит ответ…</span>
              </div>
            </article>
          )}
          {conversation?.error && (
            <p className="lesson-ai-error" role="alert">
              {conversation.error}
            </p>
          )}
        </div>

        <div className="lesson-ai-composer lesson-page-ai-chat-composer tw:grid tw:grid-cols-[minmax(0,_1fr)_34px] tw:gap-[7px] tw:mt-[auto] tw:p-[7px] tw:border-solid tw:border-[rgba(255,_255,_255,_0.58)] tw:rounded-[13px] tw:[.lesson-page-ai-chat.is-collapsed_&]:hidden tw:[align-items:end] tw:[border-width:1px] tw:dark:border-[rgba(255,_255,_255,_0.16)] tw:[background:rgba(255,_255,_255,_0.3)] tw:dark:[background:rgba(255,_255,_255,_0.07)]">
          <textarea
            className="tw:min-h-[52px] tw:max-h-[180px] tw:p-[8px_9px] tw:w-[100%] tw:resize-y tw:text-(--text) tw:[border:0] tw:[background:transparent] tw:[outline:none] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px]"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            maxLength={10_000}
            rows={2}
            placeholder={
              isSending ? "Дождитесь ответа ИИ" : "Напишите сообщение для ИИ"
            }
            disabled={!courseId}
            aria-label="Сообщение для ИИ"
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            type="button"
            className="lesson-ai-send tw:w-[34px] tw:h-[34px] tw:p-[0] tw:rounded-[50%] tw:text-(--ink-accent) tw:cursor-pointer tw:[border:1px_solid_rgba(var(--accent-rgb),_0.42)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:disabled:cursor-not-allowed tw:[background:rgba(var(--accent-rgb),_0.18)] tw:disabled:opacity-[0.45] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px]"
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isSending || !courseId}
            aria-label={isSending ? "ИИ готовит ответ" : "Отправить сообщение"}
            title="Отправить"
          >
            ↑
          </button>
        </div>
      </aside>
    </>
  );
}
