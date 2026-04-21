import { useState, useCallback, createContext, useContext, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

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

const TOAST_STYLES: Record<ToastVariant, { bg: string; icon: typeof Info; iconColor: string }> = {
  success: {
    bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900",
    icon: CheckCircle,
    iconColor: "text-green-600 dark:text-green-400",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900",
    icon: AlertCircle,
    iconColor: "text-red-600 dark:text-red-400",
  },
  warning: {
    bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900",
    icon: AlertTriangle,
    iconColor: "text-yellow-600 dark:text-yellow-400",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900",
    icon: Info,
    iconColor: "text-blue-600 dark:text-blue-400",
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);
  const style = TOAST_STYLES[toast.variant];
  const Icon = style.icon;

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    // Auto-dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(toast.id), 300); // Wait for exit animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      className={cn(
        "relative flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 ease-out",
        "translate-x-0 opacity-100",
        !isVisible && "translate-x-full opacity-0",
        style.bg
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", style.iconColor)} />
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-900 dark:text-white">{toast.title}</div>
        {toast.description && (
          <div className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{toast.description}</div>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 rounded-md p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    setToasts((prev) => {
      const newToasts = [{ ...toast, id }, ...prev];
      // Keep only the 5 most recent toasts
      return newToasts.slice(0, 5);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
