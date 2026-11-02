import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  LessonAiChat,
  type LessonAiChatProps,
} from "@/features/lesson-mentor-chat";

const COMPACT_QUERY = "(max-width: 1300px)";
const MIN_CHAT_WIDTH = 380;
const MIN_THEORY_WIDTH = 520;
const DEFAULT_CHAT_WIDTH = 420;
const RESIZE_STEP = 16;
const WIDE_RESIZE_STEP = 48;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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

/** Раскладка урока с выдвижным ИИ-чатом: кнопка открытия и изменение ширины. */
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
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const [widthBounds, setWidthBounds] = useState({
    min: MIN_CHAT_WIDTH,
    max: DEFAULT_CHAT_WIDTH,
  });
  const [isResizing, setIsResizing] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const focusChatOnOpenRef = useRef(false);
  const dragStartRef = useRef({ x: 0, width: DEFAULT_CHAT_WIDTH });
  const chatPanelId = useId();

  const updateWidthBounds = useCallback(() => {
    const workspace = workspaceRef.current;
    if (!workspace || window.matchMedia(COMPACT_QUERY).matches) return;

    const navigationWidth =
      workspace.querySelector(".course-nav-tree")?.getBoundingClientRect()
        .width || 0;
    const styles = window.getComputedStyle(workspace);
    const columnGap = Number.parseFloat(styles.columnGap) || 14;
    const splitterWidth = 12;
    const max = Math.max(
      MIN_CHAT_WIDTH,
      workspace.clientWidth -
        navigationWidth -
        MIN_THEORY_WIDTH -
        splitterWidth -
        columnGap * 3,
    );

    setWidthBounds({ min: MIN_CHAT_WIDTH, max });
    setChatWidth((current) => clamp(current, MIN_CHAT_WIDTH, max));
  }, []);

  useEffect(() => {
    setIsChatOpen(false);
    setHasUnreadResponse(false);
    setIsResizing(false);
  }, [chatKey]);

  useEffect(() => {
    if (!chatAvailable) {
      setIsChatOpen(false);
    }
  }, [chatAvailable]);

  useEffect(() => {
    if (!isChatOpen) return undefined;

    updateWidthBounds();
    window.addEventListener("resize", updateWidthBounds);

    const workspace = workspaceRef.current;
    const resizeObserver =
      workspace && "ResizeObserver" in window
        ? new ResizeObserver(updateWidthBounds)
        : null;
    if (resizeObserver && workspace) resizeObserver.observe(workspace);

    return () => {
      window.removeEventListener("resize", updateWidthBounds);
      resizeObserver?.disconnect();
    };
  }, [isChatOpen, updateWidthBounds]);

  useEffect(() => {
    if (!isResizing) return undefined;

    document.body.classList.add("is-resizing-lesson-chat");
    const handlePointerMove = (event: PointerEvent) => {
      const delta = dragStartRef.current.x - event.clientX;
      setChatWidth(
        clamp(
          dragStartRef.current.width + delta,
          widthBounds.min,
          widthBounds.max,
        ),
      );
    };
    const stopResizing = () => setIsResizing(false);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    window.addEventListener("blur", stopResizing);
    return () => {
      document.body.classList.remove("is-resizing-lesson-chat");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      window.removeEventListener("blur", stopResizing);
    };
  }, [isResizing, widthBounds]);

  useEffect(
    () => () => {
      if (focusFrameRef.current) {
        cancelAnimationFrame(focusFrameRef.current);
      }
    },
    [],
  );

  const openChat = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    focusChatOnOpenRef.current = event.detail === 0;
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

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? WIDE_RESIZE_STEP : RESIZE_STEP;
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    setChatWidth((current) =>
      clamp(current + direction * step, widthBounds.min, widthBounds.max),
    );
  };

  return (
    <div
      ref={workspaceRef}
      className={`lesson-view-grid lesson-chat-workspace tw:mt-[16px] tw:grid tw:relative tw:[&.is-course-edit-layout]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:[&.generated-course-learning-grid]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:[&.has-lesson-chat.generated-course-learning-grid]:grid-cols-[300px_minmax(520px,_1fr)_12px_minmax(380px,_var(--lesson-chat-width,_420px))] tw:[&.is-course-edit-layout]:gap-[18px] tw:[&.generated-course-learning-grid]:gap-[18px] tw:[&.has-lesson-chat.generated-course-learning-grid]:gap-x-[10px] tw:[align-items:start] tw:between-1101-1300:[&.is-course-edit-layout]:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:[&.is-course-edit-layout]:grid-cols-[1fr] tw:between-1101-1300:[&.generated-course-learning-grid]:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:[&.generated-course-learning-grid]:grid-cols-[1fr] tw:between-1101-1300:[&.has-lesson-chat.generated-course-learning-grid]:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:[&.has-lesson-chat.generated-course-learning-grid]:grid-cols-[1fr] tw:[&.generated-course-learning-grid:has(.lesson-page-ai-chat.is-collapsed)]:grid-cols-[300px_minmax(0,_1fr)_68px] tw:max-1300:[&.has-lesson-chat.generated-course-learning-grid]:gap-[18px] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:pr-[clamp(500px,_32vw,_500px)] tw:[&:not(.has-lesson-chat)_>_.lesson-main-card]:w-[100%] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)_>_.lesson-main-card]:relative tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)_>_.lesson-main-card]:left-[clamp(10px,_0.8vw,_14px)] tw:[&.is-learning-layout_>_.lesson-main-card]:static tw:[&.generated-course-learning-grid_>_.lesson-main-card]:static tw:[&.is-learning-layout_>_.lesson-main-card]:overflow-visible tw:[&.generated-course-learning-grid_>_.lesson-main-card]:overflow-visible tw:[&.generated-course-learning-grid_.lesson-main-card]:min-w-[0] tw:[&.is-learning-layout_>_.lesson-main-card]:max-h-[none] tw:[&.generated-course-learning-grid_>_.lesson-main-card]:max-h-[none] tw:[&.generated-course-learning-grid_.lesson-mode-switch]:mb-[0] tw:[&.generated-course-learning-grid_.lesson-mode-switch]:[justify-self:start] ${className} ${
        isChatOpen ? "has-lesson-chat" : ""
      } ${isResizing ? "is-resizing" : ""}`}
      style={{ "--lesson-chat-width": `${chatWidth}px` } as CSSProperties}
    >
      {children}

      {chatEnabled && (
        <>
          {chatAvailable && !isChatOpen && (
            <button
              ref={openButtonRef}
              type="button"
              className={`lesson-chat-open-button tw:fixed tw:z-[45] tw:top-[auto] tw:right-[max(56px,_env(safe-area-inset-right))] tw:bottom-[max(56px,_env(safe-area-inset-bottom))] tw:left-[auto] tw:min-h-[44px] tw:inline-flex tw:items-center tw:gap-[8px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.92)] tw:rounded-[999px] tw:text-(--text-solid) tw:p-[10px_16px] tw:cursor-pointer tw:max-1300:right-[max(40px,_env(safe-area-inset-right))] tw:max-760:right-[max(28px,_env(safe-area-inset-right))] tw:max-760:bottom-[max(32px,_env(safe-area-inset-bottom))] tw:[border-width:1px] tw:[&.has-unread-response]:border-(--accent-soft) tw:[background:var(--cta)] tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[box-shadow:0_12px_30px_rgba(0,_0,_0,_0.28),_0_0_0_3px_rgba(var(--accent-rgb),_0.16)] tw:[transform:none] tw:[transition:transform_160ms_ease,_background_160ms_ease,_box-shadow_160ms_ease] tw:hover:[background:var(--accent)] tw:[&.has-unread-response]:[background:linear-gradient(135deg,_var(--accent-soft),_var(--cta))] tw:hover:[box-shadow:0_14px_34px_rgba(0,_0,_0,_0.34),_0_0_0_4px_rgba(var(--accent-rgb),_0.22)] tw:[&.has-unread-response]:[box-shadow:0_16px_38px_rgba(0,_0,_0,_0.34),_0_0_0_5px_rgba(var(--accent-soft-rgb),_0.24)] tw:hover:[transform:translateY(-2px)] tw:motion-reduce:[transition:none] tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px] tw:dark:hover:[background:var(--cta)] ${
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
                  className="lesson-chat-unread-dot tw:w-[10px] tw:h-[10px] tw:flex-[0_0_auto] tw:rounded-[50%] tw:[border:2px_solid_var(--text-solid)] tw:[background:var(--accent-soft)] tw:[box-shadow:0_0_0_4px_rgba(var(--accent-soft-rgb),_0.28)] tw:[animation:lesson-chat-unread-pulse_1.8s_ease-in-out_infinite] tw:motion-reduce:[animation:none]"
                  aria-hidden="true"
                />
              )}
            </button>
          )}

          {isChatOpen && (
            <div
              className="lesson-chat-resizer tw:relative tw:self-stretch tw:min-h-[min(520px,_calc(100vh_-_104px))] tw:rounded-[999px] tw:[cursor:col-resize] tw:[touch-action:none] tw:max-1300:hidden tw:focus-visible:[outline:3px_solid_rgba(var(--accent-soft-rgb),_0.86)] tw:focus-visible:[outline-offset:3px] tw:[&::before]:sticky tw:[&::before]:top-[calc(50vh_-_52px)] tw:[&::before]:block tw:[&::before]:w-[4px] tw:[&::before]:h-[104px] tw:[&::before]:m-[0_auto] tw:[&::before]:rounded-[999px] tw:[&::before]:opacity-[0.62] tw:[&::before]:[content:''] tw:hover:[&::before]:w-[6px] tw:focus-visible:[&::before]:w-[6px] tw:[.lesson-chat-workspace.is-resizing_&]:[&::before]:w-[6px] tw:[&::before]:[background:var(--line-strong)] tw:hover:[&::before]:opacity-[1] tw:focus-visible:[&::before]:opacity-[1] tw:[.lesson-chat-workspace.is-resizing_&]:[&::before]:opacity-[1] tw:[&::before]:[transition:width_140ms_ease,_background_140ms_ease,_opacity_140ms_ease] tw:hover:[&::before]:[background:var(--ink-accent)] tw:focus-visible:[&::before]:[background:var(--ink-accent)] tw:[.lesson-chat-workspace.is-resizing_&]:[&::before]:[background:var(--ink-accent)] tw:motion-reduce:[&::before]:[transition:none]"
              role="separator"
              tabIndex={0}
              aria-label="Изменить ширину ИИ-чата"
              aria-orientation="vertical"
              aria-valuemin={Math.round(widthBounds.min)}
              aria-valuemax={Math.round(widthBounds.max)}
              aria-valuenow={Math.round(chatWidth)}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                dragStartRef.current = { x: event.clientX, width: chatWidth };
                setIsResizing(true);
              }}
              onKeyDown={resizeWithKeyboard}
            >
              <span aria-hidden="true" />
            </div>
          )}

          <LessonAiChat
            key={chatKey}
            {...chatProps}
            panelId={chatPanelId}
            focusOnOpen={focusChatOnOpenRef.current}
            isOpen={isChatOpen}
            onClose={closeChat}
            onAssistantResponse={markResponseAsUnread}
          />
        </>
      )}
    </div>
  );
}
