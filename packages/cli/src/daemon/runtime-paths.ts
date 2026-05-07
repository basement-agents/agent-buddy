import path from "node:path";
import os from "node:os";

export interface RuntimePaths {
  base: string;
  runtimeDir: string;
  logDir: string;
  pidFile: string;
  portFile: string;
  logFile: string;
}

export function runtimePaths(): RuntimePaths {
  const base = process.env.AGENT_BUDDY_HOME ?? path.join(os.homedir(), ".agent-buddy");
  const runtimeDir = path.join(base, "runtime");
  const logDir = path.join(base, "logs");
  return {
    base,
    runtimeDir,
    logDir,
    pidFile: path.join(runtimeDir, "agent-buddy.pid"),
    portFile: path.join(runtimeDir, "agent-buddy.port"),
    logFile: path.join(logDir, "agent-buddy.log"),
  };
}
