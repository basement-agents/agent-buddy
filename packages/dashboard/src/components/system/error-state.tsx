import { Alert } from "./alert";
import { Button } from "./button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ message, onRetry, retryLabel, className }: ErrorStateProps) {
  return (
    <Alert className={className} description={message} variant="danger">
      {onRetry && (
        <div className="mt-2">
          <Button onClick={onRetry} size="small" variant="outline">
            {retryLabel ?? "Try Again"}
          </Button>
        </div>
      )}
    </Alert>
  );
}
