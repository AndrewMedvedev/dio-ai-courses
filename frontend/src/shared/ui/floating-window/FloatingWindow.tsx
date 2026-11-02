import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getLocalStorage } from "@/shared/lib/storage";

export interface FloatingWindowSize {
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type GestureMode = "move" | "e" | "w" | "s" | "se" | "sw";

interface Gesture {
  mode: GestureMode;
  startX: number;
  startY: number;
  start: Rect;
}

const MARGIN = 12;
const MIN_VISIBLE = 120;
const MOBILE_QUERY = "(max-width: 720px)";

function readRect(storageKey: string): Rect | null {
  if (!storageKey) return null;
  try {
    const value = JSON.parse(
      getLocalStorage()?.getItem(`floating-window:${storageKey}`) || "null",
    );
    return value && Number.isFinite(value.x) && Number.isFinite(value.w)
      ? value
      : null;
  } catch {
    return null;
  }
}

function writeRect(storageKey: string, rect: Rect): void {
  if (!storageKey) return;
  try {
    getLocalStorage()?.setItem(
      `floating-window:${storageKey}`,
      JSON.stringify(rect),
    );
  } catch {
    // Позиция окна — удобство: без localStorage просто не запоминаем.
  }
}

function clampRect(rect: Rect, minSize: FloatingWindowSize): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(rect.w, minSize.width), vw - MARGIN * 2);
  const h = Math.min(Math.max(rect.h, minSize.height), vh - MARGIN * 2);
  // Окно можно утащить частично за край, но шапка всегда остаётся доступной.
  const x = Math.min(Math.max(rect.x, MIN_VISIBLE - w), vw - MIN_VISIBLE);
  const y = Math.min(Math.max(rect.y, MARGIN), vh - 56);
  return { x, y, w, h };
}

function defaultRect(defaultSize: FloatingWindowSize): Rect {
  const w = Math.min(defaultSize.width, window.innerWidth - MARGIN * 2);
  const h = Math.min(defaultSize.height, window.innerHeight - MARGIN * 2);
  return {
    x: window.innerWidth - w - 24,
    y: Math.max(MARGIN, window.innerHeight - h - 24),
    w,
    h,
  };
}

/**
 * Плавающее окно: перетаскивается за шапку, растягивается за края и угол,
 * сворачивается в шапку. Положение и размер запоминаются по storageKey.
 * На узком экране открывается снизу на всю ширину без перетаскивания.
 */
export interface FloatingWindowProps {
  open: boolean;
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
  storageKey?: string;
  defaultSize?: FloatingWindowSize;
  minSize?: FloatingWindowSize;
  headerActions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function FloatingWindow({
  open,
  title,
  eyebrow = "",
  subtitle = "",
  onClose,
  storageKey = "",
  defaultSize = { width: 460, height: 600 },
  minSize = { width: 320, height: 260 },
  headerActions = null,
  className = "",
  children,
}: FloatingWindowProps) {
  const titleId = useId();
  const [rect, setRect] = useState<Rect | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches,
  );
  const gestureRef = useRef<Gesture | null>(null);
  const rectRef = useRef<Rect | null>(null);
  rectRef.current = rect;

  useEffect(() => {
    if (!open) return;
    setRect(
      clampRect(readRect(storageKey) || defaultRect(defaultSize), minSize),
    );
    setMinimized(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageKey]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(media.matches);
    media.addEventListener("change", onChange);
    const onResize = () =>
      setRect((current) => (current ? clampRect(current, minSize) : current));
    window.addEventListener("resize", onResize);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>, mode: GestureMode) => {
      if (isMobile || event.button !== 0 || !rectRef.current) return;
      if (
        mode === "move" &&
        (event.target as Element).closest("button, a, input, textarea")
      ) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      gestureRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        start: rectRef.current,
      };
    },
    [isMobile],
  );

  const moveGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const { start, mode } = gesture;
      let next = { ...start };
      if (mode === "move") {
        next = { ...start, x: start.x + dx, y: start.y + dy };
      } else {
        if (mode.includes("e")) next.w = start.w + dx;
        if (mode.includes("s")) next.h = start.h + dy;
        if (mode.includes("w")) {
          next.w = start.w - dx;
          next.x = start.x + dx;
        }
      }
      const clamped = clampRect(next, minSize);
      // При растягивании влево фиксируем правый край окна.
      if (mode.includes("w") && clamped.w !== next.w) {
        clamped.x = start.x + start.w - clamped.w;
      }
      setRect(clamped);
    },
    [minSize],
  );

  const endGesture = useCallback(() => {
    if (!gestureRef.current) return;
    gestureRef.current = null;
    if (rectRef.current) writeRect(storageKey, rectRef.current);
  }, [storageKey]);

  if (!open || !rect) return null;

  const style: CSSProperties | undefined = isMobile
    ? undefined
    : {
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: minimized ? "auto" : rect.h,
      };

  return createPortal(
    <section
      className={`floating-window tw:fixed tw:z-[1050] tw:flex tw:flex-col tw:min-w-[0] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.45)] tw:rounded-[18px] tw:text-(--text) tw:overflow-hidden tw:[--app-modal-row:rgba(255,_255,_255,_0.6)] tw:[--app-modal-border:rgba(43,_43,_43,_0.12)] tw:[--app-modal-danger:#b42318] tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.24)] tw:[background:#faf7f1] tw:[box-shadow:0_22px_60px_rgba(0,_0,_0,_0.26),_0_2px_6px_rgba(0,_0,_0,_0.08)] tw:animate-floating-window-in tw:[&.is-minimized]:h-[auto] tw:[&.is-mobile]:h-[min(72vh,_620px)]! tw:[&.is-mobile.is-minimized]:h-[auto]! tw:[&.is-mobile]:left-[8px]! tw:[&.is-mobile]:right-[8px] tw:[&.is-mobile]:bottom-[8px] tw:[&.is-mobile]:top-[auto]! tw:[&.is-mobile]:w-[auto]! tw:dark:[--app-modal-row:rgba(233,_222,_203,_0.05)] tw:dark:[--app-modal-border:rgba(233,_222,_203,_0.16)] tw:dark:[--app-modal-danger:#ff9a8f] tw:dark:[background:#262626] tw:[&_input::placeholder]:text-(--muted) tw:[&_input::placeholder]:opacity-[0.9] ${minimized ? "is-minimized" : ""} ${isMobile ? "is-mobile" : ""} ${className}`.trim()}
      style={style}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onPointerMove={moveGesture}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <header
        className="floating-window-head tw:flex tw:items-start tw:gap-[10px] tw:p-[12px_12px_10px_16px] tw:cursor-grab tw:[border-bottom:1px_solid_var(--app-modal-border)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:active:cursor-grabbing tw:[.floating-window.is-mobile_&]:cursor-default tw:[user-select:none] tw:[touch-action:none] tw:[.floating-window.is-minimized_&]:[border-bottom:0]"
        onPointerDown={(event) => startGesture(event, "move")}
        onDoubleClick={(event) => {
          if (!(event.target as Element).closest("button"))
            setMinimized((value) => !value);
        }}
        title={isMobile ? undefined : "Перетащите, чтобы переместить окно"}
      >
        <div className="floating-window-titles tw:flex-[1_1_auto] tw:min-w-[0]">
          {eyebrow ? (
            <span className="floating-window-eyebrow tw:block tw:text-[var(--eyebrow,_var(--muted))] tw:text-[0.7rem] tw:font-[800] tw:tracking-[0.08em] tw:uppercase">
              {eyebrow}
            </span>
          ) : null}
          <h3
            className="tw:m-[2px_0_0] tw:text-[var(--heading,_var(--text))] tw:text-[1rem] tw:leading-[1.25]"
            id={titleId}
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="tw:m-[4px_0_0] tw:text-(--muted) tw:text-[0.82rem] tw:wrap-anywhere">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="floating-window-actions tw:flex-[none] tw:flex tw:flex-wrap tw:justify-end tw:items-center tw:gap-[6px] tw:[&_.btn]:min-h-[32px] tw:[&_.btn]:p-[3px_12px] tw:[&_.btn]:text-[0.8rem]">
          {!minimized ? headerActions : null}
          <button
            type="button"
            className="floating-window-btn tw:grid tw:w-[32px] tw:h-[32px] tw:border-solid tw:border-(--app-modal-border) tw:rounded-[999px] tw:text-(--muted) tw:text-[1.05rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.7)] tw:[background:transparent] tw:hover:text-(--text)"
            onClick={() => setMinimized((value) => !value)}
            aria-label={minimized ? "Развернуть окно" : "Свернуть окно"}
            title={minimized ? "Развернуть" : "Свернуть"}
          >
            {minimized ? "▢" : "–"}
          </button>
          <button
            type="button"
            className="floating-window-btn tw:grid tw:w-[32px] tw:h-[32px] tw:border-solid tw:border-(--app-modal-border) tw:rounded-[999px] tw:text-(--muted) tw:text-[1.05rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.7)] tw:[background:transparent] tw:hover:text-(--text)"
            onClick={() => onClose?.()}
            aria-label="Закрыть окно"
            title="Закрыть"
          >
            ×
          </button>
        </div>
      </header>
      {!minimized ? (
        <div className="floating-window-body tw:flex-[1_1_auto] tw:min-h-[0] tw:flex tw:flex-col tw:p-[12px_14px_14px] tw:overflow-auto">
          {children}
        </div>
      ) : null}
      {!minimized && !isMobile ? (
        <>
          <span
            className="floating-window-resize is-e tw:absolute tw:z-[2] tw:top-[16px] tw:right-[-3px] tw:bottom-[16px] tw:w-[8px] tw:[touch-action:none] tw:[cursor:ew-resize]"
            onPointerDown={(event) => startGesture(event, "e")}
            aria-hidden="true"
          />
          <span
            className="floating-window-resize is-w tw:absolute tw:z-[2] tw:top-[16px] tw:left-[-3px] tw:bottom-[16px] tw:w-[8px] tw:[touch-action:none] tw:[cursor:ew-resize]"
            onPointerDown={(event) => startGesture(event, "w")}
            aria-hidden="true"
          />
          <span
            className="floating-window-resize is-s tw:absolute tw:z-[2] tw:left-[16px] tw:right-[16px] tw:bottom-[-3px] tw:h-[8px] tw:[touch-action:none] tw:[cursor:ns-resize]"
            onPointerDown={(event) => startGesture(event, "s")}
            aria-hidden="true"
          />
          <span
            className="floating-window-resize is-se tw:absolute tw:z-[2] tw:bottom-[-2px] tw:w-[18px] tw:h-[18px] tw:right-[-2px] tw:[touch-action:none] tw:[cursor:nwse-resize] tw:[background:linear-gradient(_135deg,_transparent_55%,_rgba(var(--accent-rgb),_0.55)_55%,_rgba(var(--accent-rgb),_0.55)_62%,_transparent_62%,_transparent_72%,_rgba(var(--accent-rgb),_0.55)_72%,_rgba(var(--accent-rgb),_0.55)_79%,_transparent_79%_)]"
            onPointerDown={(event) => startGesture(event, "se")}
            aria-hidden="true"
            title="Потяните, чтобы изменить размер"
          />
          <span
            className="floating-window-resize is-sw tw:absolute tw:z-[2] tw:bottom-[-2px] tw:w-[18px] tw:h-[18px] tw:left-[-2px] tw:[touch-action:none] tw:[cursor:nesw-resize]"
            onPointerDown={(event) => startGesture(event, "sw")}
            aria-hidden="true"
          />
        </>
      ) : null}
    </section>,
    // Внутрь .page, как и модальные окна: там действуют цвета и стили темы
    // (.page[data-theme="dark"] …) — иначе поле ввода в тёмной теме было нечитаемым.
    document.querySelector(".page") || document.body,
  );
}
