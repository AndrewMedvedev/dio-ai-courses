import { useState, type ReactNode } from 'react';
import { AppModal, type AppModalSize } from '@/shared/ui/app-modal';
import { getErrorMessage } from '@/shared/lib/errors';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  busyLabel?: ReactNode;
  danger?: boolean;
  /** Вернёт false — окно останется открытым. */
  onConfirm?: () => unknown;
  onCancel?: () => void;
  children?: ReactNode;
  size?: AppModalSize;
}

/**
 * Диалог подтверждения: «Подтвердить» выполняет onConfirm, «Отмена» ничего не меняет.
 * Если onConfirm вернул false или бросил ошибку — окно остаётся открытым.
 */
export function ConfirmDialog({
  open,
  title,
  description = '',
  eyebrow = 'Подтверждение',
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  busyLabel = 'Сохраняем...',
  danger = false,
  onConfirm,
  onCancel,
  children,
  size = 'sm',
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setError('');
    onCancel?.();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await onConfirm?.();
      if (result === false) return;
    } catch (confirmError) {
      setError(
        getErrorMessage(
          confirmError,
          'Не удалось выполнить действие. Попробуйте ещё раз.',
        ) ?? '',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={open}
      title={title}
      eyebrow={eyebrow}
      description={description}
      onClose={close}
      busy={busy}
      size={size}
      className={danger ? 'is-danger' : ''}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
            onClick={close}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:[text-decoration:none] tw:[border-width:1px] tw:[&.app-modal-danger-btn]:border-(--app-modal-danger)! tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[&.app-modal-danger-btn]:text-[#fff]! tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)] tw:dark:[&.app-modal-danger-btn]:text-[#1d1d1d]! tw:[&.app-modal-danger-btn]:[background:var(--app-modal-danger)]! tw:dark:[&.app-modal-danger-btn]:[&&]:text-[#fff]! tw:dark:[&.app-modal-danger-btn]:[&&&]:text-[#1d1d1d]! tw:dark:[&.app-modal-danger-btn]:[&&&&]:text-[#fff]! ${danger ? 'app-modal-danger-btn' : ''}`}
            onClick={confirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error ? (
        <p
          className="app-modal-error tw:m-[0] tw:p-[10px_12px] tw:rounded-[12px] tw:text-(--app-modal-danger) tw:font-[700] tw:[background:rgba(180,_35,_24,_0.1)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </AppModal>
  );
}
