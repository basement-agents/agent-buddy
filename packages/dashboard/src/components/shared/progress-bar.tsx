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
  default: "bg-[var(--ds-color-feedback-info)]",
  success: "bg-[var(--ds-color-feedback-success)]",
  error: "bg-[var(--ds-color-feedback-danger)]",
};

const trackStyles = {
  default: "bg-[var(--ds-color-feedback-info-subtle)]",
  success: "bg-[var(--ds-color-feedback-success-subtle)]",
  error: "bg-[var(--ds-color-feedback-danger-subtle)]",
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
          {label && <span className="font-medium text-[var(--ds-color-text-secondary)]">{label}</span>}
          {pct != null && !indeterminate && (
            <span className="text-[var(--ds-color-text-primary)]">{Math.round(pct)}%</span>
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
        <p className="text-xs text-[var(--ds-color-text-primary)]">{statusText}</p>
      )}
    </div>
  );
}
