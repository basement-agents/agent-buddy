import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("daemonStatus", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-status-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns not-running when no PID file", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    const s = await daemonStatus();
    expect(s.running).toBe(false);
    expect(s.pid).toBeNull();
  });

  it("returns running with current pid when PID file is alive", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(process.pid));
    writeFileSync(join(home, "runtime", "agent-buddy.port"), "3456");
    const s = await daemonStatus({ skipHealthCheck: true });
    expect(s.running).toBe(true);
    expect(s.pid).toBe(process.pid);
    expect(s.port).toBe(3456);
  });

  it("cleans up stale PID file and reports not-running", async () => {
    const { daemonStatus } = await import("../commands/daemon-status.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const s = await daemonStatus();
    expect(s.running).toBe(false);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
