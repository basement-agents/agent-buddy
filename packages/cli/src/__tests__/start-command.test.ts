import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockServe = vi.fn().mockResolvedValue(undefined);
vi.mock("@agent-buddy/server", () => ({ serve: mockServe }));

describe("start command — preflight checks", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-start-"));
    process.env.AGENT_BUDDY_HOME = home;
    mockServe.mockClear();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("rejects start when PID file exists with live process", async () => {
    const { startCommand } = await import("../commands/start.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), String(process.pid));
    const result = await startCommand({ port: 0, foreground: false });
    expect(result.code).toBe(1);
    expect(result.message).toMatch(/already running/i);
  });

  it("clears stale PID file and proceeds (foreground)", async () => {
    const { startCommand } = await import("../commands/start.js");
    mkdirSync(join(home, "runtime"), { recursive: true });
    writeFileSync(join(home, "runtime", "agent-buddy.pid"), "99999999");
    const result = await startCommand({ port: 0, foreground: true });
    expect(result.code).toBe(0);
    expect(mockServe).toHaveBeenCalledTimes(1);
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });

  it("foreground mode calls serve and does not write PID file", async () => {
    const { startCommand } = await import("../commands/start.js");
    const result = await startCommand({ port: 0, foreground: true });
    expect(result.code).toBe(0);
    expect(mockServe).toHaveBeenCalledWith({
      port: undefined,
      dashboardDir: expect.any(String),
    });
    expect(existsSync(join(home, "runtime", "agent-buddy.pid"))).toBe(false);
  });
});
