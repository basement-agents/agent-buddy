export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  isRetryable?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

export const DEFAULT_BASE_DELAY_MS = 1000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function calculateBackoffDelay(attempt: number, baseDelayMs = DEFAULT_BASE_DELAY_MS): number {
  return baseDelayMs * Math.pow(2, attempt);
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const { maxRetries, baseDelayMs = DEFAULT_BASE_DELAY_MS, isRetryable, onRetry } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const canRetry = isRetryable ? isRetryable(lastError) : true;
      if (!canRetry || attempt === maxRetries) {
        throw lastError;
      }

      const delayMs = calculateBackoffDelay(attempt, baseDelayMs);
      onRetry?.(lastError, attempt, delayMs);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Max retries exceeded");
}
