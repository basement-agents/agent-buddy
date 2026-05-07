import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runtimePaths } from "../daemon/runtime-paths.js";
import { writePidFile, readPidFile, clearPidFile } from "../daemon/pidfile.js";
import { isAlive } from "../daemon/process-utils.js";
import { isPortAvailable } from "../daemon/port-utils.js";

export interface StartOptions {
  port: number;
  foreground: boolean;
}

export interface StartResult {
  code: number;
  message: string;
}

const SPAWN_VERIFY_MS = 1000;

export async function startCommand(opts: StartOptions): Promise<StartResult> {
  const paths = runtimePaths();
  mkdirSync(paths.runtimeDir, { recursive: true });
  mkdirSync(paths.logDir, { recursive: true });

  const existingPid = readPidFile(paths.pidFile);
  if (existingPid !== null) {
    if (isAlive(existingPid)) {
      return {
        code: 1,
        message: `Already running (PID ${existingPid}). Use 'agent-buddy stop' first.`,
      };
    }
    clearPidFile(paths.pidFile);
  }

  const port = opts.port > 0 ? opts.port : 0;
  if (port > 0) {
    const available = await isPortAvailable(port);
    if (!available) {
      return {
        code: 1,
        message: `Port ${port} is in use. Use --port or stop the conflicting process.`,
      };
    }
  }

  if (opts.foreground) {
    const { runDaemon } = await import("../daemon/run.js");
    if (port > 0) process.env.AGENT_BUDDY_PORT = String(port);
    await runDaemon();
    return { code: 0, message: "Daemon exited (foreground)." };
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const entry = process.argv[1] ?? path.join(here, "cli.js");
  const logFd = openSync(paths.logFile, "a");

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (port > 0) env.AGENT_BUDDY_PORT = String(port);

  const child: ChildProcess = spawn(process.execPath, [entry, "__daemon__"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });

  let exitedEarly = false;
  let earlyExitCode: number | null = null;
  child.on("exit", (code) => {
    exitedEarly = true;
    earlyExitCode = code;
  });

  await new Promise<void>((resolve) => setTimeout(resolve, SPAWN_VERIFY_MS));

  if (exitedEarly) {
    return {
      code: 1,
      message: `Daemon failed to start (exit ${earlyExitCode}). Check ${paths.logFile}`,
    };
  }

  const childPid = child.pid;
  if (typeof childPid !== "number") {
    return { code: 1, message: "Failed to obtain daemon PID." };
  }

  try {
    writePidFile(paths.pidFile, childPid);
  } catch (err) {
    return { code: 1, message: `Failed to write PID file: ${(err as Error).message}` };
  }
  if (port > 0) writeFileSync(paths.portFile, String(port));
  child.unref();

  return {
    code: 0,
    message: `Started agent-buddy${port > 0 ? ` on http://localhost:${port}` : ""} (PID ${childPid})`,
  };
}
