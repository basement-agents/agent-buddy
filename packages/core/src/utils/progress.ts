export interface ProgressUpdate {
  fraction?: number;
  stage?: string;
  detail?: string;
  model?: string;
  elapsedMs?: number;
  subStep?: string;
}

export interface ProgressReporter {
  report(update: ProgressUpdate): void;
}

export const noopReporter: ProgressReporter = {
  report(): void {},
};

const DEFAULT_HEARTBEAT_INTERVAL_MS = 1500;

export async function withHeartbeat<T>(
  reporter: ProgressReporter,
  base: ProgressUpdate,
  fn: () => Promise<T>,
  intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS
): Promise<T> {
  const start = Date.now();
  reporter.report({ ...base, elapsedMs: 0 });

  const interval = setInterval(() => {
    reporter.report({ ...base, elapsedMs: Date.now() - start });
  }, intervalMs);

  try {
    const result = await fn();
    reporter.report({ ...base, elapsedMs: Date.now() - start });
    return result;
  } finally {
    clearInterval(interval);
  }
}
