import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const cliDist = resolve(here, "../../dist/cli.js");
const dashboardIndex = resolve(here, "../../dist/dashboard/index.html");

describe("build output", () => {
  it("dist/cli.js exists and starts with shebang", () => {
    expect(existsSync(cliDist)).toBe(true);
    const head = readFileSync(cliDist, "utf8").slice(0, 20);
    expect(head.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("dist/dashboard/index.html exists", () => {
    expect(existsSync(dashboardIndex)).toBe(true);
  });

  it("`node dist/cli.js --version` prints 0.1.0", () => {
    const out = execFileSync(process.execPath, [cliDist, "--version"], { encoding: "utf8" });
    expect(out.trim()).toBe("0.1.0");
  });

  it("`node dist/cli.js --help` lists start, stop, status, logs", () => {
    const out = execFileSync(process.execPath, [cliDist, "--help"], { encoding: "utf8" });
    expect(out).toContain("start");
    expect(out).toContain("stop");
    expect(out).toContain("status");
    expect(out).toContain("logs");
  });
});
