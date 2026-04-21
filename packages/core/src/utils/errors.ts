export class ConfigError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
