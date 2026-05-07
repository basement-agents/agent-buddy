import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const cliDist = resolve(here, "../../dist/cli.js");

function runCli(args: string[], env: NodeJS.ProcessEnv): { stdout: string; status: number } {
  try {
    const out = execFileSync(process.execPath, [cliDist, ...args], { encoding: "utf8", env });
    return { stdout: out, status: 0 };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    const stdout = typeof e.stdout === "string" ? e.stdout : (e.stdout?.toString() ?? "");
    const stderr = typeof e.stderr === "string" ? e.stderr : (e.stderr?.toString() ?? "");
    return { stdout: stdout + stderr, status: e.status ?? 1 };
  }
}

async function fetchUntilReady(url: string, timeoutMs: number): Promise<Response | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return res;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

describe("daemon end-to-end", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ab-e2e-"));
  });

  afterEach(() => {
    runCli(["stop"], { ...process.env, AGENT_BUDDY_HOME: home });
    rmSync(home, { recursive: true, force: true });
  });

  it("start → / serves dashboard html → stop", async () => {
    const port = 30000 + Math.floor(Math.random() * 1000);
    const env = { ...process.env, AGENT_BUDDY_HOME: home };

    const startResult = runCli(["start", "--port", String(port)], env);
    expect(startResult.status).toBe(0);
    expect(startResult.stdout).toMatch(/Started agent-buddy/);

    const root = await fetchUntilReady(`http://localhost:${port}/`, 10000);
    expect(root).not.toBeNull();
    expect(root!.status).toBe(200);
    expect(root!.headers.get("content-type")).toContain("text/html");

    const stopResult = runCli(["stop"], env);
    expect(stopResult.status).toBe(0);
    expect(stopResult.stdout).toMatch(/Stopped/);
  }, 30000);
});
