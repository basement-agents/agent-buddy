const RETRYABLE_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "socket hang up",
  "socket timeout",
  "rate limit",
  "429",
  "502",
  "503",
  "504",
];

export function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()));
}

export const DEFAULT_MAX_RETRIES = 3;
