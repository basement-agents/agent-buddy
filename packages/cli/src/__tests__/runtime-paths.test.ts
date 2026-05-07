import { describe, it, expect } from "vitest";
import { runtimePaths } from "../daemon/runtime-paths.js";
import path from "node:path";
import os from "node:os";

describe("runtimePaths", () => {
  it("returns paths under ~/.agent-buddy by default", () => {
    delete process.env.AGENT_BUDDY_HOME;
    const p = runtimePaths();
    const expected = path.join(os.homedir(), ".agent-buddy");
    expect(p.base).toBe(expected);
    expect(p.pidFile).toBe(path.join(expected, "runtime", "agent-buddy.pid"));
    expect(p.portFile).toBe(path.join(expected, "runtime", "agent-buddy.port"));
    expect(p.logFile).toBe(path.join(expected, "logs", "agent-buddy.log"));
    expect(p.runtimeDir).toBe(path.join(expected, "runtime"));
    expect(p.logDir).toBe(path.join(expected, "logs"));
  });

  it("honors AGENT_BUDDY_HOME env var", () => {
    process.env.AGENT_BUDDY_HOME = "/tmp/custom-home";
    const p = runtimePaths();
    expect(p.base).toBe("/tmp/custom-home");
    expect(p.pidFile).toBe("/tmp/custom-home/runtime/agent-buddy.pid");
    delete process.env.AGENT_BUDDY_HOME;
  });
});
