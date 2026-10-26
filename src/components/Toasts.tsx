import { useAppStore } from "../store/useAppStore";
import { Icon } from "./Icon";

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-tone={toast.tone}>
          <span className="toast-icon">
            <Icon
              name={toast.tone === "error" ? "alert" : toast.tone === "success" ? "check" : "leaf"}
              size={15}
            />
          </span>
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                dismiss(toast.id);
                void toast.action?.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            className="toast-close"
            onClick={() => dismiss(toast.id)}
            aria-label="关闭提示"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
