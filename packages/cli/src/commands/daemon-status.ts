import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive } from "../daemon/process-utils.js";

export interface DaemonStatus {
  running: boolean;
  pid: number | null;
  port: number | null;
  uptimeMs: number | null;
  health: unknown | null;
}

export interface DaemonStatusOptions {
  skipHealthCheck?: boolean;
}

export async function daemonStatus(opts: DaemonStatusOptions = {}): Promise<DaemonStatus> {
  const paths = runtimePaths();
  const pid = readPidFile(paths.pidFile);
  if (pid === null) {
    return { running: false, pid: null, port: null, uptimeMs: null, health: null };
  }
  if (!isAlive(pid)) {
    clearPidFile(paths.pidFile);
    if (existsSync(paths.portFile)) unlinkSync(paths.portFile);
    return { running: false, pid: null, port: null, uptimeMs: null, health: null };
  }

  let port: number | null = null;
  if (existsSync(paths.portFile)) {
    const raw = readFileSync(paths.portFile, "utf8").trim();
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n > 0) port = n;
  }

  let uptimeMs: number | null = null;
  try {
    const st = statSync(paths.pidFile);
    uptimeMs = Date.now() - st.mtimeMs;
  } catch { /* ignore */ }

  let health: unknown = null;
  if (!opts.skipHealthCheck && port !== null) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) health = await res.json();
    } catch { /* daemon may be starting */ }
  }

  return { running: true, pid, port, uptimeMs, health };
}

export function formatUptime(ms: number | null): string {
  if (ms == null) return "?";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
