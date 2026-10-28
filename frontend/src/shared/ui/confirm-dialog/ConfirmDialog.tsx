import { useState, type ReactNode } from "react";
import { AppModal, type AppModalSize } from "@/shared/ui/app-modal";
import { getErrorMessage } from "@/shared/lib/errors";

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
  description = "",
  eyebrow = "Подтверждение",
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  busyLabel = "Сохраняем...",
  danger = false,
  onConfirm,
  onCancel,
  children,
  size = "sm",
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (busy) return;
    setError("");
    onCancel?.();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await onConfirm?.();
      if (result === false) return;
    } catch (confirmError) {
      setError(
        getErrorMessage(
          confirmError,
          "Не удалось выполнить действие. Попробуйте ещё раз.",
        ) ?? "",
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
      className={danger ? "is-danger" : ""}
      footer={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={close}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-solid ${danger ? "app-modal-danger-btn" : ""}`}
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
        <p className="app-modal-error" role="alert">
          {error}
        </p>
      ) : null}
    </AppModal>
  );
}
