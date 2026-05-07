import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("stop command", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-stop-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns 'Not running' when no PID file", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    const result = await stopCommand();
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/not running/i);
  });

  it("clears stale PID file and reports stopped", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const result = await stopCommand();
    expect(result.code).toBe(0);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });

  it("sends SIGTERM and waits for exit (using a real spawned sleeper)", async () => {
    const { stopCommand } = await import("../commands/stop.js");
    const { spawn } = await import("node:child_process");
    const sleeper = spawn(process.execPath, ["-e", "setTimeout(()=>{}, 60000)"], {
      detached: true,
      stdio: "ignore",
    });
    sleeper.unref();
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(sleeper.pid));
    const result = await stopCommand({ timeoutMs: 5000 });
    expect(result.code).toBe(0);
    expect(result.message).toMatch(/stopped/i);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
