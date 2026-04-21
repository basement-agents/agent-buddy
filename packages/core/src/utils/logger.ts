export type LogLevel = "debug" | "info" | "warn" | "error";

const VALID_LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

function parseLogLevel(value: string | undefined): LogLevel {
  if (value && (VALID_LOG_LEVELS as readonly string[]).includes(value)) return value as LogLevel;
  return "info";
}

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix = "agent-buddy", level?: LogLevel) {
    this.prefix = prefix;
    this.level = level || parseLogLevel(process.env.LOG_LEVEL);
  }

  debug(message: string, data?: Record<string, unknown>) {
    if (this.shouldLog("debug")) this.log("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>) {
    if (this.shouldLog("info")) this.log("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>) {
    if (this.shouldLog("warn")) this.log("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>) {
    if (this.shouldLog("error")) this.log("error", message, data);
  }

  child(prefix: string): Logger {
    return new Logger(`${this.prefix}:${prefix}`, this.level);
  }

  structured(): Record<string, unknown> {
    return { level: this.level, timestamp: new Date().toISOString(), prefix: this.prefix };
  }

  private static readonly LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

  private shouldLog(level: LogLevel): boolean {
    return Logger.LEVELS.indexOf(level) >= Logger.LEVELS.indexOf(this.level);
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry = { level, timestamp: new Date().toISOString(), prefix: this.prefix, message, ...data };
    const target = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    target(JSON.stringify(entry));
  }
}
