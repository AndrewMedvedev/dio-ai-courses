import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, Spinner } from "./icons";
import { useDndCourseStore } from "../model/store";
import type { SaveStatus, XY } from "../model/types";

export interface PickFilesOptions {
  position?: XY | null;
  attachToLessonId?: string | null;
  replaceMaterialId?: string;
}

/** Действия страницы, которые нужны узлам холста, списку и инспектору. */
export interface DndActionsValue {
  pickFiles: (options?: PickFilesOptions) => void;
  requestDelete: (id: string) => void;
  previewLesson: (lessonId: string) => void;
}

export const DndActionsContext = createContext<DndActionsValue>({
  pickFiles: () => {},
  requestDelete: () => {},
  previewLesson: () => {},
});

export const useDndActions = () => useContext(DndActionsContext);

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Модальное окно: держит фокус внутри и возвращает его инициатору после закрытия. */
export function Modal({
  title,
  description,
  onClose,
  closeDisabled = false,
  children,
  footer,
  size = "md",
  className = "",
  initialFocusSelector,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  size?: string;
  className?: string;
  initialFocusSelector?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const first =
      (initialFocusSelector &&
        dialog?.querySelector<HTMLElement>(initialFocusSelector)) ||
      dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first || dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!closeDisabledRef.current) closeRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null,
      );
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    dialog?.addEventListener("keydown", onKeyDown);
    return () => {
      dialog?.removeEventListener("keydown", onKeyDown);
      if (returnTo && document.contains(returnTo)) returnTo.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="dnd-modal-backdrop tw:fixed tw:inset-[0] tw:z-[1000] tw:grid tw:p-[16px] tw:[place-items:center] tw:max-767:p-[0] tw:[background:rgba(20,_16,_12,_0.45)] tw:animate-dnd-fade-160 tw:max-767:[place-items:end_stretch]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className={`dnd-modal tw:flex tw:flex-col tw:w-[min(560px,_100%)] tw:max-h-[min(88dvh,_820px)] tw:rounded-[18px] tw:text-(--dnd-text) tw:max-767:w-[100%] tw:[&.dnd-modal--sm]:w-[min(440px,_100%)] tw:max-767:max-h-[92dvh] tw:max-767:rounded-[18px_18px_0_0] tw:[border:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:[box-shadow:var(--dnd-shadow-lg)] tw:animate-dnd-pop-200 tw:focus:[outline:none] tw:max-767:[&.dnd-modal--sm]:w-[100%] tw:focus:focus-visible:[&&&]:[outline:none] dnd-modal--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="dnd-modal-head tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:p-[16px_18px_6px]">
          <h2 className="tw:font-[800] tw:text-(--dnd-heading) tw:[&&&]:text-[1.1rem] tw:[&&&]:leading-[1.3] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[1.1rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.3]" id={titleId}>{title}</h2>
          <button
            type="button"
            className="dnd-icon-btn tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[36px] tw:h-[36px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-panel-2)]"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Закрыть окно"
            title="Закрыть"
          >
            <Icon name="close" />
          </button>
        </header>
        {description ? (
          <p id={descriptionId} className="dnd-modal-description tw:m-[0] tw:p-[0_18px] tw:text-(--dnd-muted) tw:[&&&]:text-[0.86rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.86rem]">
            {description}
          </p>
        ) : null}
        <div className="dnd-modal-body tw:flex-[1] tw:min-h-[0] tw:overflow-y-auto tw:p-[14px_18px]">{children}</div>
        {footer ? <footer className="dnd-modal-foot tw:flex tw:justify-end tw:flex-wrap tw:gap-[8px] tw:p-[12px_18px_16px] tw:[border-top:1px_solid_var(--dnd-border)]">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog() {
  const confirm = useDndCourseStore((state) => state.confirm);
  const closeConfirm = useDndCourseStore((state) => state.closeConfirm);
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [confirm]);

  if (!confirm) return null;

  const run = async () => {
    setBusy(true);
    try {
      const result = await confirm.onConfirm?.();
      if (result !== false) closeConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={confirm.title}
      onClose={closeConfirm}
      closeDisabled={busy}
      size="sm"
      initialFocusSelector="[data-autofocus]"
      footer={
        <>
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost"
            onClick={closeConfirm}
            disabled={busy}
            data-autofocus
          >
            Отмена
          </button>
          <button
            type="button"
            className="dnd-btn dnd-btn--danger tw:[.page_.dnd-builder_&]:border-(--dnd-error) tw:[.page_.dnd-builder_&]:text-[#fff] tw:[.page_.dnd-builder_&]:[background:var(--dnd-error)] tw:dark:[.page_.dnd-builder_&]:text-[#1d1d1d]"
            onClick={run}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <Spinner size={14} /> : <Icon name="trash" size={16} />}
            {busy ? "Удаляем…" : confirm.confirmLabel || "Удалить"}
          </button>
        </>
      }
    >
      <p className="dnd-confirm-text tw:[.page_.dnd-builder_&]:m-[0_0_8px] tw:[.page_.dnd-builder_&]:text-[0.9rem]">{confirm.message}</p>
      {confirm.consequences?.length ? (
        <ul className="dnd-confirm-list tw:[.page_.dnd-builder_&]:m-[0] tw:[.page_.dnd-builder_&]:pl-[18px] tw:[.page_.dnd-builder_&]:grid tw:[.page_.dnd-builder_&]:gap-[4px] tw:[.page_.dnd-builder_&_li]:text-(--dnd-muted) tw:[.page_.dnd-builder_&_li]:text-[0.84rem]">
          {confirm.consequences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </Modal>
  );
}

/** Кнопка-меню с клавиатурной навигацией. Используется как альтернатива перетаскиванию. */
export type MenuItem =
  | { key: string; type: "separator" }
  | { key: string; type: "label"; label: string }
  | {
      key: string;
      type?: "item";
      label: string;
      icon?: string;
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect?: () => void;
    };

export function ActionMenu({
  label,
  icon = "more",
  items,
  className = "",
  buttonClassName = "dnd-node-btn",
  showLabel = false,
  disabled = false,
  align = "start",
  iconSize = 16,
}: {
  label: string;
  icon?: string;
  /** Пункты меню или функция, которая собирает их при открытии. */
  items: MenuItem[] | (() => MenuItem[]);
  className?: string;
  buttonClassName?: string;
  showLabel?: boolean;
  disabled?: boolean;
  align?: string;
  iconSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const resolvedItems = typeof items === "function" ? (open ? items() : []) : items;

  const close = useCallback((focusButton = false) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        ?.focus(),
    );
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, close]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? []),
    ];
    const index = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options[(index + 1) % options.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      options[(index - 1 + options.length) % options.length]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close();
    }
  };

  return (
    <div className={`dnd-menu nodrag nopan tw:relative ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`tw:text-[0.96rem] tw:leading-[1.45] tw:[.page_.dnd-builder_&.dnd-node-btn]:inline-grid tw:[.page_.dnd-builder_&.dnd-icon-btn]:inline-grid tw:[.page_.dnd-builder_&.dnd-node-btn]:w-[46px] tw:[.page_.dnd-builder_.dnd-topbar_&.dnd-icon-btn]:w-[42px] tw:[.page_.dnd-builder_&.dnd-icon-btn--sm]:w-[30px] tw:[.page_.dnd-builder_&.dnd-icon-btn]:w-[36px] tw:[.page_.dnd-builder_&.dnd-node-btn]:h-[46px] tw:[.page_.dnd-builder_.dnd-topbar_&.dnd-icon-btn]:h-[42px] tw:[.page_.dnd-builder_&.dnd-icon-btn--sm]:h-[30px] tw:[.page_.dnd-builder_&.dnd-icon-btn]:h-[36px] tw:[.page_.dnd-builder_&.dnd-icon-btn]:flex-[none] tw:[.page_.dnd-builder_&.dnd-node-btn]:rounded-[12px] tw:[.page_.dnd-builder_&.dnd-icon-btn]:rounded-[9px] tw:[.page_.dnd-builder_&.dnd-icon-btn--sm]:rounded-[8px] tw:[.page_.dnd-builder_&.dnd-node-btn]:border-solid tw:[.page_.dnd-builder_&.dnd-icon-btn]:border-solid tw:[.page_.dnd-builder_&.dnd-node-btn]:border-[transparent] tw:[&.dnd-node-btn[aria-expanded=true]]:border-(--dnd-border) tw:[.page_.dnd-builder_&.dnd-icon-btn]:border-[transparent] tw:[.page_.dnd-builder_&.dnd-node-btn]:text-(--dnd-muted) tw:[&.dnd-node-btn[aria-expanded=true]]:text-(--dnd-text) tw:[.page_.dnd-builder_&.dnd-icon-btn]:text-(--dnd-text) tw:[.page_.dnd-builder_&.dnd-node-btn]:cursor-pointer tw:[.page_.dnd-builder_&.dnd-icon-btn]:cursor-pointer tw:[.page_.dnd-builder_&.dnd-node-btn]:[place-items:center] tw:[.page_.dnd-builder_&.dnd-icon-btn]:[place-items:center] tw:[.page_.dnd-builder_&.dnd-node-btn]:[border-width:1px] tw:[.page_.dnd-builder_&.dnd-icon-btn]:[border-width:1px] tw:[.page_.dnd-builder_&.dnd-node-btn]:[background:transparent] tw:[&.dnd-node-btn[aria-expanded=true]]:[background:var(--dnd-panel-2)] tw:[.page_.dnd-builder_&.dnd-icon-btn]:[background:transparent] tw:[&.dnd-icon-btn:disabled]:cursor-not-allowed tw:[&.dnd-node-btn:disabled]:cursor-not-allowed tw:[.page_.dnd-builder_&.dnd-node-btn]:[transition:background_0.15s,_color_0.15s,_border-color_0.15s] tw:[.page_.dnd-builder_&.dnd-icon-btn]:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:[&.dnd-icon-btn:disabled]:opacity-[0.4] tw:[&.dnd-node-btn:disabled]:opacity-[0.35] tw:[.page_.dnd-builder_&.dnd-node-btn:hover:not(:disabled)]:border-(--dnd-border) tw:[.page_.dnd-builder_&.dnd-node-btn:hover:not(:disabled)]:text-(--dnd-text) tw:[.page_.dnd-builder_&.dnd-icon-btn:hover:not(:disabled)]:[&&&&]:border-(--dnd-border) tw:[.page_.dnd-builder_&.dnd-node-btn:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_.dnd-builder_&.dnd-icon-btn:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-panel-2)] ${(buttonClassName) ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={showLabel ? undefined : label}
        data-tip={showLabel || open ? undefined : label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Icon name={icon} size={iconSize} />
        {showLabel ? <span>{label}</span> : null}
      </button>
      {open ? (
        <div
          id={menuId}
          className={`dnd-menu-list tw:[.page_.dnd-builder_&]:absolute tw:[.page_.dnd-builder_&]:z-[50] tw:[.page_.dnd-builder_&]:top-[calc(100%_+_6px)] tw:[.page_.dnd-builder_&]:min-w-[230px] tw:[.page_.dnd-builder_&]:max-w-[300px] tw:[.page_.dnd-builder_&]:max-h-[280px] tw:[.page_.dnd-builder_&]:overflow-y-auto tw:[.page_.dnd-builder_&]:p-[6px] tw:[.page_.dnd-builder_&]:rounded-[12px] tw:[.page_.dnd-builder_&]:[border:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&]:[background:var(--dnd-panel)] tw:[.page_.dnd-builder_&]:[box-shadow:var(--dnd-shadow-lg)] tw:[.page_.dnd-builder_&]:animate-dnd-pop-160 dnd-menu-list--${align} nowheel`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {resolvedItems.map((item) =>
            item.type === "separator" ? (
              <div key={item.key} className="dnd-menu-sep tw:[.page_.dnd-builder_&]:h-[1px] tw:[.page_.dnd-builder_&]:m-[4px_6px] tw:[.page_.dnd-builder_&]:[background:var(--dnd-border)]" role="separator" />
            ) : item.type === "label" ? (
              <div key={item.key} className="dnd-menu-label tw:[.page_.dnd-builder_&]:p-[6px_10px_2px] tw:[.page_.dnd-builder_&]:text-[0.7rem] tw:[.page_.dnd-builder_&]:font-[800] tw:[.page_.dnd-builder_&]:tracking-[0.06em] tw:[.page_.dnd-builder_&]:uppercase tw:[.page_.dnd-builder_&]:text-(--dnd-muted)">
                {item.label}
              </div>
            ) : (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`dnd-menu-item tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:flex-wrap tw:[.page_.dnd-builder_&]:gap-[8px] tw:[.page_.dnd-builder_&]:w-[100%] tw:[.page_.dnd-builder_&]:min-h-[34px] tw:[.page_.dnd-builder_&]:p-[6px_10px] tw:[.page_.dnd-builder_&]:rounded-[8px] tw:[.page_.dnd-builder_&]:text-(--dnd-text) tw:[.page_.dnd-builder_&.is-danger]:text-(--dnd-error) tw:[.page_.dnd-builder_&]:text-left tw:[.page_.dnd-builder_&]:text-[0.84rem] tw:[.page_.dnd-builder_&]:cursor-pointer tw:[.page_.dnd-builder_&]:[border:0] tw:[.page_.dnd-builder_&]:[background:transparent] tw:[.page_.dnd-builder_&:disabled]:cursor-not-allowed tw:[.page_.dnd-builder_&:disabled]:opacity-[0.5] tw:[.page_.dnd-builder_&:focus-visible]:[background:var(--dnd-panel-2)] tw:[.page_.dnd-builder_&:focus-visible]:[outline:none] tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[outline:none] tw:[.page_.dnd-builder_&_span]:flex-[1] tw:[.page_.dnd-builder_&_span]:min-w-[0] tw:[.page_.dnd-builder_&_span]:overflow-hidden tw:[.page_.dnd-builder_&_span]:text-ellipsis tw:[.page_.dnd-builder_&_span]:whitespace-nowrap tw:[.page_.dnd-builder_&_small]:w-[100%] tw:[.page_.dnd-builder_&_small]:pl-[24px] tw:[.page_.dnd-builder_&_small]:text-(--dnd-muted) tw:[.page_.dnd-builder_&_small]:text-[0.72rem] ${item.danger ? "is-danger" : ""}`}
                disabled={item.disabled}
                title={item.hint || item.label}
                onClick={(event) => {
                  event.stopPropagation();
                  close(true);
                  item.onSelect?.();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={16} /> : null}
                <span>{item.label}</span>
                {item.hint && item.disabled ? <small>{item.hint}</small> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Toasts() {
  const toasts = useDndCourseStore((state) => state.toasts);
  const dismiss = useDndCourseStore((state) => state.dismissToast);
  return (
    <div className="dnd-toasts tw:fixed tw:right-[16px] tw:bottom-[16px] tw:z-[1100] tw:grid tw:gap-[8px] tw:w-[min(400px,_calc(100vw_-_32px))] tw:pointer-events-none" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`dnd-toast tw:pointer-events-auto tw:flex tw:items-start tw:gap-[10px] tw:p-[12px_12px_12px_14px] tw:rounded-[14px] tw:border-solid tw:border-(--dnd-border) tw:[border-width:1px] tw:[border-left-width:4px] tw:[background:var(--dnd-panel)] tw:[box-shadow:var(--dnd-shadow-lg)] tw:animate-dnd-rise-toast tw:[&.dnd-toast--success]:[border-left-color:var(--dnd-ok)] tw:[&.dnd-toast--error]:[border-left-color:var(--dnd-error)] tw:[&.dnd-toast--warning]:[border-left-color:var(--dnd-warn)] tw:[&.dnd-toast--info]:[border-left-color:var(--dnd-info)] dnd-toast--${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <Icon
            name={
              toast.type === "success"
                ? "check"
                : toast.type === "error" || toast.type === "warning"
                  ? "alert"
                  : "info"
            }
            size={18}
          />
          <p className="tw:flex-[1] tw:m-[0] tw:[&&&]:text-[0.86rem] tw:[&&&]:leading-[1.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.86rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.4]">{toast.text}</p>
          {toast.retry ? (
            <button
              type="button"
              className="dnd-toast-action tw:[.page_.dnd-builder_&]:inline-flex tw:[.page_.dnd-builder_&]:items-center tw:[.page_.dnd-builder_&]:gap-[4px] tw:[.page_.dnd-builder_&]:p-[4px_8px] tw:[.page_.dnd-builder_&]:rounded-[8px] tw:[.page_.dnd-builder_&]:text-(--dnd-text) tw:[.page_.dnd-builder_&]:font-[700] tw:[.page_.dnd-builder_&]:text-[0.78rem] tw:[.page_.dnd-builder_&]:cursor-pointer tw:[.page_.dnd-builder_&]:[border:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&]:[background:var(--dnd-node)]"
              onClick={() => {
                dismiss(toast.id);
                toast.retry?.();
              }}
            >
              <Icon name="retry" size={14} />
              Повторить
            </button>
          ) : null}
          <button
            type="button"
            className="dnd-icon-btn dnd-icon-btn--sm tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[30px] tw:h-[30px] tw:flex-[none] tw:rounded-[8px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[&&&&]:[background:var(--dnd-panel-2)]"
            onClick={() => dismiss(toast.id)}
            aria-label="Скрыть уведомление"
            title="Скрыть"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function LiveRegion() {
  const announcement = useDndCourseStore((state) => state.announcement);
  return (
    <div className="dnd-visually-hidden tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]!" aria-live="polite" role="status">
      {announcement}
    </div>
  );
}

export function SaveIndicator({
  status,
  error,
}: {
  status: SaveStatus | null | undefined;
  error?: string;
}) {
  if (!status) return null;
  const map: Record<string, { text: string; icon: string | null }> = {
    dirty: { text: "Есть несохранённые изменения", icon: "edit" },
    saving: { text: "Сохраняем…", icon: null },
    saved: { text: "Сохранено", icon: "check" },
    error: { text: "Ошибка сохранения", icon: "alert" },
  };
  const item = map[status];
  if (!item) return null;
  return (
    <span
      className={`dnd-save tw:inline-flex tw:items-center tw:gap-[5px] tw:text-[0.76rem] tw:font-[650] tw:text-(--dnd-muted) tw:[.page_.dnd-builder_&.dnd-save--saved]:text-(--dnd-ok) tw:[.page_.dnd-builder_&.dnd-save--dirty]:text-(--dnd-warn) tw:[&.dnd-save--error]:text-(--dnd-error) tw:[.page_.dnd-builder_&.dnd-save--saved]:animate-dnd-pulse dnd-save--${status}`}
      role="status"
      title={status === "error" && error ? error : item.text}
    >
      {item.icon ? <Icon name={item.icon} size={14} /> : <Spinner size={12} />}
      {item.text}
    </span>
  );
}

export function StatusPill({
  tone,
  icon,
  children,
  busy = false,
}: {
  tone: string;
  icon?: string | null;
  children?: ReactNode;
  busy?: boolean;
}) {
  return (
    <span className={`dnd-pill tw:inline-flex tw:items-center tw:gap-[4px] tw:p-[2px_8px] tw:rounded-[999px] tw:text-[0.74rem] tw:font-[700] tw:whitespace-nowrap tw:[.page_.dnd-builder_.dnd-node_&]:p-[3px_10px] tw:[.page_.dnd-builder_.dnd-node_&]:text-[0.95rem] tw:[border:1px_solid_transparent] tw:[.page_.dnd-builder_&.dnd-pill--progress]:text-(--dnd-info) tw:[.page_.dnd-builder_&.dnd-pill--ok]:text-(--dnd-ok) tw:[.page_.dnd-builder_&.dnd-pill--error]:text-(--dnd-error) tw:[.page_.dnd-builder_&.dnd-pill--used]:text-(--dnd-accent-ink) tw:[.page_.dnd-builder_&.dnd-pill--warn]:text-(--dnd-warn) tw:[.page_.dnd-builder_&.dnd-pill--muted]:text-(--dnd-muted) tw:[.page_.dnd-builder_&.dnd-pill--progress]:[background:var(--dnd-info-bg)] tw:[.page_.dnd-builder_&.dnd-pill--ok]:[background:var(--dnd-ok-bg)] tw:[.page_.dnd-builder_&.dnd-pill--error]:[background:var(--dnd-error-bg)] tw:[.page_.dnd-builder_&.dnd-pill--used]:[background:var(--dnd-accent-soft)] tw:[.page_.dnd-builder_&.dnd-pill--warn]:[background:var(--dnd-warn-bg)] tw:[.page_.dnd-builder_&.dnd-pill--muted]:[background:var(--dnd-panel-2)] dnd-pill--${tone}`}>
      {busy ? <Spinner size={11} /> : icon ? <Icon name={icon} size={13} /> : null}
      {children}
    </span>
  );
}
