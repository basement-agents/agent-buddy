import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { useConnectionStatus, type ConnectionState } from "~/lib/use-connection-status";

const LABEL: Record<ConnectionState, string> = {
  connected: "Connected",
  polling: "Polling",
  disconnected: "Disconnected",
};

const TONE_CLASS: Record<ConnectionState, string> = {
  connected: "text-[var(--ds-color-feedback-success-text)]",
  polling: "text-[var(--ds-color-feedback-warning-text)]",
  disconnected: "text-[var(--ds-color-feedback-danger-text)]",
};

function formatAgo(date: Date | null, now: number): string {
  if (!date) return "—";
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * StatusBar — quiet inline connection indicator.
 *
 * Renders as a single line of 10px monospace text with no fixed positioning,
 * no dot animations, and no borders. Intended to be placed inline at the end
 * of a PageColumn or omitted on pages where connection status is irrelevant.
 */
export function StatusBar() {
  const { state, latencyMs, lastSuccessAt } = useConnectionStatus();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const latency = latencyMs == null ? "—" : `${latencyMs}ms`;
  const snapshot = formatAgo(lastSuccessAt, now);

  return (
    <footer
      role="status"
      aria-label="Connection status"
      className={cn(
        "font-mono text-[10px] leading-none text-[var(--ds-color-text-tertiary)]",
        "flex items-center gap-2"
      )}
    >
      <span className={cn(TONE_CLASS[state])}>{LABEL[state]}</span>
      <span aria-hidden="true" className="text-[var(--ds-color-border-primary)]">·</span>
      <span>{latency}</span>
      <span aria-hidden="true" className="text-[var(--ds-color-border-primary)]">·</span>
      <span>{snapshot}</span>
    </footer>
  );
}
