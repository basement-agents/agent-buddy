import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Test config functions by using a temp directory
const TEST_DIR = path.join(os.tmpdir(), `agent-buddy-test-${Date.now()}`);

describe("Config", () => {
  const originalEnv = process.env.HOME;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    // Mock HOME to use temp directory
    process.env.HOME = TEST_DIR;
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    process.env.HOME = originalEnv;
    // Clear module cache to reload config with original HOME
    vi.resetModules();
  });

  it("should return defaults when no config exists", async () => {
    const { loadConfig } = await import("../config/config.js");
    const config = await loadConfig();
    expect(config.version).toBe("1.0.0");
    expect(config.repos).toEqual([]);
    expect(config.review).toBeDefined();
  });

  it("should save and load config", async () => {
    const { loadConfig, saveConfig } = await import("../config/config.js");
    const config = await loadConfig();
    config.repos.push({
      id: "test/repo",
      owner: "test",
      repo: "repo",
      autoReview: false,
      triggerMode: "manual",
    });
    await saveConfig(config);
    const loaded = await loadConfig();
    expect(loaded.repos).toHaveLength(1);
    expect(loaded.repos[0].id).toBe("test/repo");
  });
});
