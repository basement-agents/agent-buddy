import { cn } from "~/lib/utils";

interface ProgressBarProps {
  percentage?: number;
  label?: string;
  statusText?: string;
  variant?: "default" | "success" | "error";
  indeterminate?: boolean;
  className?: string;
}

const variantStyles = {
  default: "bg-blue-500 dark:bg-blue-400",
  success: "bg-green-500 dark:bg-green-400",
  error: "bg-red-500 dark:bg-red-400",
};

const trackStyles = {
  default: "bg-blue-100 dark:bg-blue-900/30",
  success: "bg-green-100 dark:bg-green-900/30",
  error: "bg-red-100 dark:bg-red-900/30",
};

export function ProgressBar({
  percentage,
  label,
  statusText,
  variant = "default",
  indeterminate = false,
  className,
}: ProgressBarProps) {
  const pct = percentage != null ? Math.min(100, Math.max(0, percentage)) : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || (pct != null && !indeterminate)) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>}
          {pct != null && !indeterminate && (
            <span className="text-zinc-500">{Math.round(pct)}%</span>
          )}
        </div>
      )}
      <div className={cn("h-2 w-full overflow-hidden rounded-full", trackStyles[variant])}>
        {indeterminate ? (
          <div className={cn("h-full w-1/3 animate-pulse rounded-full", variantStyles[variant])} style={{ animationDuration: "1.5s" }} />
        ) : (
          <div
            className={cn("h-full rounded-full transition-all duration-300", variantStyles[variant])}
            style={{ width: `${pct ?? 0}%` }}
          />
        )}
      </div>
      {statusText && (
        <p className="text-xs text-zinc-500">{statusText}</p>
      )}
    </div>
  );
}
