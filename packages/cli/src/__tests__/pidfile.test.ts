import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writePidFile, readPidFile, clearPidFile } from "../daemon/pidfile.js";

describe("pidfile", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ab-pid-"));
    file = join(dir, "agent-buddy.pid");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes and reads back a pid", () => {
    writePidFile(file, 12345);
    expect(readPidFile(file)).toBe(12345);
  });

  it("readPidFile returns null when file missing", () => {
    expect(readPidFile(file)).toBeNull();
  });

  it("readPidFile returns null when content not a number", () => {
    writeFileSync(file, "garbage");
    expect(readPidFile(file)).toBeNull();
  });

  it("writePidFile fails if file exists (atomic)", () => {
    writePidFile(file, 12345);
    expect(() => writePidFile(file, 67890)).toThrow();
  });

  it("clearPidFile removes the file", () => {
    writePidFile(file, 12345);
    clearPidFile(file);
    expect(existsSync(file)).toBe(false);
  });

  it("clearPidFile is idempotent", () => {
    expect(() => clearPidFile(file)).not.toThrow();
  });
});
