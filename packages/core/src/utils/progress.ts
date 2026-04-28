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
const DEFAULT_HEARTBEAT_TIME_CONSTANT_MS = 30_000;

export interface HeartbeatOptions {
  intervalMs?: number;
  fractionRange?: [number, number];
  timeConstantMs?: number;
}

function asymptoticFraction(elapsedMs: number, range: [number, number], timeConstantMs: number): number {
  const [base, end] = range;
  const span = Math.max(0, end - base);
  const t = Math.max(0, elapsedMs);
  return base + span * (1 - Math.exp(-t / timeConstantMs));
}

export async function withHeartbeat<T>(
  reporter: ProgressReporter,
  base: ProgressUpdate,
  fn: () => Promise<T>,
  optionsOrInterval: HeartbeatOptions | number = {}
): Promise<T> {
  const options: HeartbeatOptions = typeof optionsOrInterval === "number"
    ? { intervalMs: optionsOrInterval }
    : optionsOrInterval;
  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const timeConstantMs = options.timeConstantMs ?? DEFAULT_HEARTBEAT_TIME_CONSTANT_MS;
  const range = options.fractionRange;

  const start = Date.now();
  reporter.report({
    ...base,
    elapsedMs: 0,
    ...(range ? { fraction: range[0] } : {}),
  });

  const interval = setInterval(() => {
    const elapsed = Date.now() - start;
    reporter.report({
      ...base,
      elapsedMs: elapsed,
      ...(range ? { fraction: asymptoticFraction(elapsed, range, timeConstantMs) } : {}),
    });
  }, intervalMs);

  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    reporter.report({
      ...base,
      elapsedMs: elapsed,
      ...(range ? { fraction: range[1] } : {}),
    });
    return result;
  } finally {
    clearInterval(interval);
  }
}

export function bandReporter(parent: ProgressReporter, range: [number, number]): ProgressReporter {
  const [base, end] = range;
  const span = Math.max(0, end - base);
  return {
    report(u) {
      if (u.fraction === undefined) {
        parent.report(u);
        return;
      }
      const clamped = Math.min(1, Math.max(0, u.fraction));
      parent.report({ ...u, fraction: base + span * clamped });
    },
  };
}
