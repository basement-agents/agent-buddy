import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("logsCommand", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-logs-"));
    process.env.AGENT_BUDDY_HOME = home;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    delete process.env.AGENT_BUDDY_HOME;
  });

  it("returns no-logs message when file missing", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    const out = await tailLogFile({ tail: 200 });
    expect(out).toMatch(/no logs yet/i);
  });

  it("returns last N lines", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    mkdirSync(join(home, "logs"), { recursive: true });
    const lines = Array.from({ length: 10 }, (_, i) => `line-${i + 1}`).join("\n") + "\n";
    writeFileSync(join(home, "logs", "agent-buddy.log"), lines);
    const out = await tailLogFile({ tail: 3 });
    expect(out).toContain("line-8");
    expect(out).toContain("line-9");
    expect(out).toContain("line-10");
    expect(out).not.toContain("line-7");
  });

  it("returns full content when tail > total lines", async () => {
    const { tailLogFile } = await import("../commands/logs.js");
    mkdirSync(join(home, "logs"), { recursive: true });
    writeFileSync(join(home, "logs", "agent-buddy.log"), "a\nb\nc\n");
    const out = await tailLogFile({ tail: 100 });
    expect(out).toContain("a");
    expect(out).toContain("b");
    expect(out).toContain("c");
  });
});
