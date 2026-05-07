import { existsSync, unlinkSync } from "node:fs";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive, waitForExit } from "../daemon/process-utils.js";

export interface StopOptions {
  timeoutMs?: number;
}

export interface StopResult {
  code: number;
  message: string;
}

const DEFAULT_TIMEOUT_MS = 35_000;

export async function stopCommand(opts: StopOptions = {}): Promise<StopResult> {
  const paths = runtimePaths();
  const pid = readPidFile(paths.pidFile);
  if (pid === null) {
    return { code: 0, message: "Not running." };
  }

  if (!isAlive(pid)) {
    clearPidFile(paths.pidFile);
    if (existsSync(paths.portFile)) unlinkSync(paths.portFile);
    return { code: 0, message: "Stopped (cleaned up stale PID file)." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    return { code: 1, message: `Failed to signal PID ${pid}: ${(err as Error).message}` };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exited = await waitForExit(pid, timeoutMs);

  let warning = "";
  if (!exited) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* may have died between checks */
    }
    warning = ` (forced after ${Math.round(timeoutMs / 1000)}s timeout)`;
  }

  clearPidFile(paths.pidFile);
  if (existsSync(paths.portFile)) unlinkSync(paths.portFile);

  return { code: 0, message: `Stopped${warning}.` };
}
