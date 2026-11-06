import { create } from "zustand";

// Короткие всплывающие уведомления («Приглашение отправлено» и т.п.).
export type ToastTone = "success" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastOptions {
  tone?: ToastTone;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, options?: ToastOptions) => number | null;
  dismiss: (id: number) => void;
}

let nextToastId = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (message, { tone = "success", duration = 4500 } = {}) => {
    if (!message) return null;
    nextToastId += 1;
    const id = nextToastId;
    set({ toasts: [...get().toasts, { id, message, tone }].slice(-3) });
    if (duration > 0) {
      window.setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },

  dismiss: (id) =>
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export const notify = (message: string, options?: ToastOptions) =>
  useToastStore.getState().show(message, options);
