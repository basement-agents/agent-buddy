import { cn } from "~/lib/utils";
import { Button } from "./button";
import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ message, onRetry, retryLabel, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-[var(--ds-color-feedback-danger-border)] bg-[var(--ds-color-feedback-danger-subtle)] p-4",
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ds-color-feedback-danger)]" />
      <div className="flex-1">
        <p className="text-sm text-[var(--ds-color-feedback-danger-text)]">{message}</p>
        {onRetry && (
          <div className="mt-2">
            <Button onClick={onRetry} size="small" variant="outline">
              {retryLabel ?? "Try Again"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
