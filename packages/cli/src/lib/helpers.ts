import pc from "picocolors";
import type { AgentBuddyConfig } from "@agent-buddy/core";

export function getApiBaseUrl(config: AgentBuddyConfig): string {
  const host = config.server?.host === "0.0.0.0" ? "localhost" : (config.server?.host ?? "localhost");
  const port = config.server?.port ?? 3000;
  return `http://${host}:${port}`;
}

type ColorFn = (text: string) => string;

export function formatStatus(
  status: string,
  colorMap: Record<string, ColorFn>,
  defaultColor: ColorFn = pc.dim
): string {
  return (colorMap[status] ?? defaultColor)(status);
}
