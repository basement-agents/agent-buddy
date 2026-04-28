import { cn } from "~/lib/utils";
import { Button } from "~/components/system/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ message, onRetry, retryLabel, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn("rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/30 dark:bg-red-900/10", className)}>
      <p className="text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {retryLabel ?? "Try Again"}
        </Button>
      )}
    </div>
  );
}
