import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export type ConnectionState = "connected" | "polling" | "disconnected";

export interface ConnectionStatus {
  state: ConnectionState;
  latencyMs: number | null;
  lastSuccessAt: Date | null;
}

const POLL_INTERVAL_MS = 10_000;
const SLOW_LATENCY_MS = 800;
const STALE_THRESHOLD_MS = 30_000;

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>({
    state: "polling",
    latencyMs: null,
    lastSuccessAt: null,
  });
  const lastSuccessRef = useRef<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abortController: AbortController | null = null;

    async function tick() {
      if (cancelled) return;
      abortController = new AbortController();
      const startedAt = performance.now();
      try {
        await api.health(abortController.signal);
        if (cancelled) return;
        const latency = Math.max(0, Math.round(performance.now() - startedAt));
        const now = new Date();
        lastSuccessRef.current = now;
        setStatus({
          state: latency > SLOW_LATENCY_MS ? "polling" : "connected",
          latencyMs: latency,
          lastSuccessAt: now,
        });
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        const last = lastSuccessRef.current;
        const stale = !last || Date.now() - last.getTime() > STALE_THRESHOLD_MS;
        setStatus((prev) => ({
          state: stale ? "disconnected" : "polling",
          latencyMs: prev.latencyMs,
          lastSuccessAt: last,
        }));
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (abortController) abortController.abort();
    };
  }, []);

  return status;
}
