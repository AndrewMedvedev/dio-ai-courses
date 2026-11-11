import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

export type AppModalSize = 'sm' | 'md' | 'lg' | (string & {});

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
  eyebrow = '',
  description = '',
  onClose,
  busy = false,
  size = 'md',
  className = '',
  children,
  footer = null,
  initialFocusRef = null,
}: AppModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const focusTarget =
      initialFocusRef?.current ||
      dialogRef.current?.querySelector<HTMLElement>(
        '[data-autofocus], textarea, input, button:not([disabled])',
      );
    window.requestAnimationFrame(() => focusTarget?.focus?.());
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="app-modal-backdrop tw:fixed tw:z-[1100] tw:inset-[0] tw:grid tw:p-[min(8vh,_72px)_16px_24px] tw:overflow-y-auto tw:[--app-modal-bg:rgba(250,_247,_241,_0.98)] tw:[--app-modal-row:rgba(255,_255,_255,_0.6)] tw:[--app-modal-border:rgba(43,_43,_43,_0.12)] tw:[--app-modal-danger:#b42318] tw:[place-items:start_center] tw:[background:rgba(16,_18,_24,_0.55)] tw:[-webkit-backdrop-filter:blur(6px)] tw:[backdrop-filter:blur(6px)] tw:animate-app-modal-fade tw:dark:[--app-modal-bg:rgba(40,_40,_40,_0.98)] tw:dark:[--app-modal-row:rgba(233,_222,_203,_0.05)] tw:dark:[--app-modal-border:rgba(233,_222,_203,_0.16)] tw:dark:[--app-modal-danger:#ff9a8f] tw:dark:[background:rgba(8,_9,_12,_0.66)]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`app-modal tw:w-[min(560px,_100%)] tw:max-h-[calc(100dvh_-_min(8vh,_72px)_-_24px)] tw:flex tw:flex-col tw:rounded-[22px] tw:text-(--text) tw:overflow-hidden tw:[&.app-modal--md]:w-[min(680px,_100%)] tw:[&.app-modal--sm]:w-[min(520px,_100%)] tw:[&.app-modal--lg]:w-[min(860px,_100%)] tw:[border:1px_solid_var(--glass-border,_var(--app-modal-border))] tw:[background:var(--app-modal-bg)] tw:[box-shadow:0_24px_64px_rgba(0,_0,_0,_0.28),_var(--glass-inset,_none)] tw:animate-app-modal-pop app-modal--${size} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="app-modal-head tw:flex tw:items-start tw:justify-between tw:gap-[16px] tw:p-[24px_28px_12px]">
          <div>
            {eyebrow ? (
              <span className="app-modal-eyebrow tw:block tw:mb-[6px] tw:text-[var(--eyebrow,_var(--muted))] tw:text-[0.76rem] tw:font-[800] tw:tracking-[0.1em] tw:uppercase">
                {eyebrow}
              </span>
            ) : null}
            <h2
              className="tw:text-[var(--heading,_var(--text))] tw:text-[1.45rem] tw:leading-[1.25]"
              id={titleId}
            >
              {title}
            </h2>
            {description ? (
              <p className="tw:m-[8px_0_0] tw:text-(--muted) tw:wrap-anywhere">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="app-modal-close tw:flex-[none] tw:grid tw:w-[38px] tw:h-[38px] tw:border-solid tw:border-(--app-modal-border) tw:rounded-[999px] tw:text-(--muted) tw:text-[1.4rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:[&:hover:not(:disabled)]:border-[rgba(var(--accent-rgb),_0.7)] tw:[&:hover:not(:disabled)]:text-(--text)"
            onClick={() => onClose?.()}
            disabled={busy}
            aria-label="Закрыть"
          >
            ×
          </button>
        </header>
        <div className="app-modal-body tw:grid tw:gap-[14px] tw:min-h-[0] tw:p-[4px_28px_18px] tw:overflow-y-auto">
          {children}
        </div>
        {footer ? (
          <footer className="app-modal-foot tw:flex tw:flex-wrap tw:justify-end tw:gap-[10px] tw:p-[14px_28px_22px] tw:[border-top:1px_solid_var(--app-modal-border)]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
