import { useToastStore } from "./toast-store";

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="toaster tw:fixed tw:z-[1100] tw:right-[24px] tw:bottom-[24px] tw:grid tw:gap-[10px] tw:w-[min(460px,_calc(100vw_-_32px))] tw:pointer-events-none tw:max-640:right-[16px] tw:max-640:bottom-[16px]"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast tw:grid tw:grid-cols-[auto_1fr_auto] tw:items-center tw:gap-[14px] tw:p-[16px_14px_16px_18px] tw:rounded-[18px] tw:pointer-events-auto tw:[border:1px_solid_var(--glass-border)] tw:[background:rgba(250,_247,_241,_0.97)] tw:[-webkit-backdrop-filter:blur(8px)] tw:[backdrop-filter:blur(8px)] tw:[box-shadow:0_16px_40px_rgba(0,_0,_0,_0.18),_var(--glass-inset)] tw:animate-toast-in tw:dark:[background:rgba(40,_40,_40,_0.97)] tw:motion-reduce:animate-none is-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span
            className="toast-icon tw:grid tw:w-[36px] tw:h-[36px] tw:rounded-[999px] tw:text-[1.1rem] tw:text-(--success-text) tw:font-[800] tw:[place-items:center] tw:[background:rgba(var(--accent-rgb),_0.22)] tw:[.toast.is-error_&]:text-[#b42318] tw:[.toast.is-error_&]:[background:rgba(199,_82,_74,_0.16)] tw:dark:[.page_.toast.is-error_&]:text-[#f0a39c]"
            aria-hidden="true"
          >
            {toast.tone === "error" ? "!" : "✓"}
          </span>
          <p className="tw:m-[0] tw:text-(--text) tw:text-[1.04rem] tw:font-[700] tw:leading-[1.45] tw:wrap-anywhere">
            {toast.message}
          </p>
          <button
            type="button"
            className="toast-close tw:grid tw:w-[32px] tw:h-[32px] tw:rounded-[999px] tw:text-(--muted) tw:text-[1.35rem] tw:leading-[1] tw:cursor-pointer tw:[place-items:center] tw:[border:0] tw:[background:transparent] tw:hover:text-(--text)"
            onClick={() => dismiss(toast.id)}
            aria-label="Закрыть уведомление"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
