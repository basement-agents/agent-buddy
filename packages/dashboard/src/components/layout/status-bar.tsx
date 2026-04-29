import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { useConnectionStatus, type ConnectionState } from "~/lib/use-connection-status";

interface ToneClasses {
  dot: string;
  text: string;
}

const TONE: Record<ConnectionState, ToneClasses> = {
  connected: {
    dot: "bg-[var(--ds-color-feedback-success)]",
    text: "text-[var(--ds-color-feedback-success-text)]",
  },
  polling: {
    dot: "bg-[var(--ds-color-feedback-warning)]",
    text: "text-[var(--ds-color-feedback-warning-text)]",
  },
  disconnected: {
    dot: "bg-[var(--ds-color-feedback-danger)]",
    text: "text-[var(--ds-color-feedback-danger-text)]",
  },
};

const LABEL: Record<ConnectionState, string> = {
  connected: "Connected",
  polling: "Polling",
  disconnected: "Disconnected",
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

function Sep() {
  return (
    <span aria-hidden="true" className="text-[var(--ds-color-text-tertiary)]">
      ·
    </span>
  );
}

export function StatusBar() {
  const { state, latencyMs, lastSuccessAt } = useConnectionStatus();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const tone = TONE[state];

  return (
    <footer
      role="status"
      aria-label="Connection status"
      className="flex shrink-0 items-center gap-x-3 border-t border-[var(--ds-color-border-secondary)] px-5 pt-1 pb-2 font-mono text-[10px]"
    >
      <span
        aria-hidden="true"
        className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)}
      />
      <span className={cn("ml-0.5", tone.text)}>{LABEL[state]}</span>
      <Sep />
      <span className="text-[var(--ds-color-text-secondary)]">REST</span>
      <Sep />
      <span className="text-[var(--ds-color-text-secondary)]">
        Latency{" "}
        <span className="text-[var(--ds-color-text-primary)]">
          {latencyMs == null ? "—" : `${latencyMs}ms`}
        </span>
      </span>
      <span className="ml-auto text-[var(--ds-color-text-secondary)]">
        Snapshot{" "}
        <span className="text-[var(--ds-color-text-primary)]">
          {formatAgo(lastSuccessAt, now)}
        </span>
      </span>
    </footer>
  );
}
