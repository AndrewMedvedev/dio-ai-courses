import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LessonAiChat,
  type LessonAiChatProps,
} from "@/features/lesson-mentor-chat";

/** Свойства чата, которые задаёт страница; остальное управляется раскладкой. */
export type LessonChatProps = Omit<
  LessonAiChatProps,
  "panelId" | "focusOnOpen" | "isOpen" | "onClose" | "onAssistantResponse"
>;

export interface LessonChatWorkspaceProps {
  className?: string;
  children?: ReactNode;
  chatEnabled?: boolean;
  chatAvailable?: boolean;
  chatKey?: string;
  chatProps: LessonChatProps;
}

/** Раскладка урока с кнопкой «Спросить ИИ»; сам чат открывается в общей панели справа. */
export function LessonChatWorkspace({
  className = "",
  children,
  chatEnabled,
  chatAvailable,
  chatKey,
  chatProps,
}: LessonChatWorkspaceProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnreadResponse, setHasUnreadResponse] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const chatPanelId = useId();

  useEffect(() => {
    setIsChatOpen(false);
    setHasUnreadResponse(false);
  }, [chatKey]);

  useEffect(() => {
    if (!chatAvailable) {
      setIsChatOpen(false);
    }
  }, [chatAvailable]);

  useEffect(
    () => () => {
      if (focusFrameRef.current) {
        cancelAnimationFrame(focusFrameRef.current);
      }
    },
    [],
  );

  const openChat = useCallback(() => {
    setHasUnreadResponse(false);
    setIsChatOpen(true);
  }, []);
  const markResponseAsUnread = useCallback(() => {
    setHasUnreadResponse(true);
  }, []);
  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    focusFrameRef.current = requestAnimationFrame(() =>
      openButtonRef.current?.focus(),
    );
  }, []);

  return (
    <div
      className={`lesson-view-grid lesson-chat-workspace tw:mt-[16px] tw:grid tw:grid-cols-[340px_minmax(0,_1fr)] tw:gap-[14px] tw:relative tw:[&.is-course-edit-layout]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:[&.generated-course-learning-grid]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:[&.is-learning-layout]:grid-cols-[320px_minmax(0,_1fr)] tw:max-1100:grid-cols-[1fr] tw:[&.is-course-edit-layout]:gap-[18px] tw:[&.generated-course-learning-grid]:gap-[18px] tw:[align-items:start] tw:between-1101-1300:[&.is-course-edit-layout]:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:[&.is-course-edit-layout]:grid-cols-[1fr] tw:between-1101-1300:[&.generated-course-learning-grid]:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:[&.generated-course-learning-grid]:grid-cols-[1fr] tw:between-1101-1300:[&.is-learning-layout]:grid-cols-[300px_minmax(0,_1fr)] tw:max-1100:[&.is-learning-layout]:grid-cols-[1fr] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:pr-[clamp(500px,_32vw,_500px)] tw:[&:not(.has-lesson-chat)_>_.lesson-main-card]:w-[100%] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)_>_.lesson-main-card]:relative tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)_>_.lesson-main-card]:left-[clamp(10px,_0.8vw,_14px)] tw:[&.is-learning-layout_>_.lesson-main-card]:static tw:[&.generated-course-learning-grid_>_.lesson-main-card]:static tw:[&.is-learning-layout_>_.lesson-main-card]:overflow-visible tw:[&.generated-course-learning-grid_>_.lesson-main-card]:overflow-visible tw:[&.generated-course-learning-grid_.lesson-main-card]:min-w-[0] tw:[&.generated-course-learning-grid_.lesson-main-card]:w-[100%] tw:[&.is-learning-layout_>_.lesson-main-card]:max-h-[none] tw:[&.generated-course-learning-grid_>_.lesson-main-card]:max-h-[none] tw:[&.generated-course-learning-grid_.lesson-mode-switch]:mb-[0] tw:[&.generated-course-learning-grid_.lesson-mode-switch]:[justify-self:start] tw:[&_>_*]:min-w-[0] ${className}`}
    >
      {children}

      {chatEnabled && (
        <>
          {chatAvailable && !isChatOpen && (
            <button
              ref={openButtonRef}
              type="button"
              className={`lesson-chat-open-button tw:fixed tw:z-[45] tw:top-[auto] tw:right-[max(56px,_env(safe-area-inset-right))] tw:bottom-[max(56px,_env(safe-area-inset-bottom))] tw:left-[auto] tw:min-h-[44px] tw:inline-flex tw:items-center tw:gap-[8px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.92)] tw:rounded-[999px] tw:text-(--text-solid) tw:p-[10px_16px] tw:cursor-pointer tw:max-1300:right-[max(40px,_env(safe-area-inset-right))] tw:max-760:right-[max(28px,_env(safe-area-inset-right))] tw:max-760:bottom-[max(32px,_env(safe-area-inset-bottom))] tw:[border-width:1px] tw:[&.has-unread-response]:border-(--accent-soft) tw:[background:var(--cta)] tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[box-shadow:0_12px_30px_rgba(0,_0,_0,_0.28),_0_0_0_3px_rgba(var(--accent-rgb),_0.16)] tw:[transform:none] tw:[transition:transform_160ms_ease,_background_160ms_ease,_box-shadow_160ms_ease] tw:dark:[.page_&.has-unread-response]:border-(--accent-soft) tw:dark:[&.has-unread-response]:border-[rgba(var(--accent-rgb),_0.92)] tw:hover:[background:var(--accent)] tw:[&.has-unread-response]:[background:linear-gradient(135deg,_var(--accent-soft),_var(--cta))] tw:hover:[box-shadow:0_14px_34px_rgba(0,_0,_0,_0.34),_0_0_0_4px_rgba(var(--accent-rgb),_0.22)] tw:[&.has-unread-response]:[box-shadow:0_16px_38px_rgba(0,_0,_0,_0.34),_0_0_0_5px_rgba(var(--accent-soft-rgb),_0.24)] tw:hover:[transform:translateY(-2px)] tw:motion-reduce:[transition:none] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px] tw:dark:[.page_&.has-unread-response]:[background:linear-gradient(135deg,_var(--accent-soft),_var(--cta))] tw:dark:hover:[background:var(--cta)] tw:dark:[&.has-unread-response]:[background:var(--cta)] tw:dark:[.page_&.has-unread-response]:[&.has-unread-response]:[&&&&]:border-(--accent-soft) tw:dark:[.page_&.has-unread-response]:[&.has-unread-response]:[&&&&]:[background:linear-gradient(135deg,_var(--accent-soft),_var(--cta))] tw:dark:[.page_&.has-unread-response]:hover:[&&&&]:[background:linear-gradient(135deg,_var(--accent-soft),_var(--cta))] ${
                hasUnreadResponse ? "has-unread-response" : ""
              }`}
              onClick={openChat}
              aria-haspopup="dialog"
              aria-controls={chatPanelId}
              aria-expanded="false"
              aria-label={
                hasUnreadResponse ? "Открыть новый ответ ИИ" : "Открыть ИИ-чат"
              }
            >
              <span
                className="lesson-chat-open-icon tw:grid tw:w-[22px] tw:h-[22px] tw:rounded-[50%] tw:[place-items:center] tw:[background:rgba(255,_255,_255,_0.48)]"
                aria-hidden="true"
              >
                ✦
              </span>
              <span
                className="lesson-chat-open-label tw:whitespace-nowrap"
                aria-live="polite"
              >
                {hasUnreadResponse ? "Ответ ИИ готов" : "Спросить ИИ"}
              </span>
              {hasUnreadResponse && (
                <span
                  className="lesson-chat-unread-dot tw:w-[10px] tw:h-[10px] tw:flex-[0_0_auto] tw:rounded-[50%] tw:[border:2px_solid_var(--text-solid)] tw:[background:var(--accent-soft)] tw:[box-shadow:0_0_0_4px_rgba(var(--accent-soft-rgb),_0.28)] tw:animate-lesson-chat-unread-pulse tw:motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
            </button>
          )}

          <LessonAiChat
            key={chatKey}
            {...chatProps}
            panelId={chatPanelId}
            isOpen={isChatOpen}
            onClose={closeChat}
            onAssistantResponse={markResponseAsUnread}
          />
        </>
      )}
    </div>
  );
}
