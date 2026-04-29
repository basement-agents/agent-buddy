import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./toast.module.css";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const VARIANT_ICON: Record<ToastVariant, ComponentType<{ size?: number }>> = {
  success: IconCircleCheck,
  error: IconExclamationCircle,
  warning: IconAlertTriangle,
  info: IconInfoCircle,
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: styles.variantSuccess,
  error: styles.variantError,
  warning: styles.variantWarning,
  info: styles.variantInfo,
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const Icon = VARIANT_ICON[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => {
      setDismissed(true);
      setTimeout(() => onDismiss(toast.id), 220);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setDismissed(true);
    setTimeout(() => onDismiss(toast.id), 220);
  };

  return (
    <div
      aria-live="polite"
      className={cn(
        styles.toast,
        VARIANT_CLASS[toast.variant],
        dismissed && styles.dismissed,
      )}
      role="alert"
    >
      <span className={styles.icon}>
        <Icon size={20} />
      </span>
      <div className={styles.body}>
        <span className={styles.title}>{toast.title}</span>
        {toast.description && (
          <span className={styles.description}>{toast.description}</span>
        )}
      </div>
      <button
        aria-label="Dismiss notification"
        className={styles.close}
        onClick={handleDismiss}
        type="button"
      >
        <IconX size={14} stroke={2} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => {
      const next = [{ ...toast, id }, ...prev];
      return next.slice(0, 5);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className={styles.viewport}>
          {toasts.map((t) => (
            <ToastItem key={t.id} onDismiss={dismiss} toast={t} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
