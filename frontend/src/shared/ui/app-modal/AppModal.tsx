import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import "./app-modal.css";

export type AppModalSize = "sm" | "md" | "lg" | (string & {});

export interface AppModalProps {
  open: boolean;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  busy?: boolean;
  size?: AppModalSize;
  className?: string;
  children?: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null> | null;
}

/**
 * Базовое модальное окно в стиле карточек курса.
 * Закрывается по Esc и клику по фону, пока не заблокировано (busy).
 */
export function AppModal({
  open,
  title,
  eyebrow = "",
  description = "",
  onClose,
  busy = false,
  size = "md",
  className = "",
  children,
  footer = null,
  initialFocusRef = null,
}: AppModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const focusTarget =
      initialFocusRef?.current ||
      dialogRef.current?.querySelector<HTMLElement>(
        "[data-autofocus], textarea, input, button:not([disabled])",
      );
    window.requestAnimationFrame(() => focusTarget?.focus?.());
    return () => {
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`app-modal app-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="app-modal-head">
          <div>
            {eyebrow ? (
              <span className="app-modal-eyebrow">{eyebrow}</span>
            ) : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={() => onClose?.()}
            disabled={busy}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        <div className="app-modal-body">{children}</div>
        {footer ? <footer className="app-modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
