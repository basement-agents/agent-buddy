import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentBuddyConfig } from "../config/types.js";

const TEST_DIR = path.join(os.tmpdir(), `agent-buddy-config-test-${Date.now()}`);

// Mock HOME to use temp directory
const originalHome = process.env.HOME;

describe("Config Operations", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    process.env.HOME = TEST_DIR;
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    process.env.HOME = originalHome;
    vi.resetModules();
  });

  describe("addRepo", () => {
    it("should add a new repo to config", async () => {
      const { addRepo } = await import("../config/config.js");
      const repo = await addRepo("owner", "repo");
      expect(repo.id).toBe("owner/repo");
      expect(repo.owner).toBe("owner");
      expect(repo.repo).toBe("repo");
      expect(repo.autoReview).toBe(false);
      expect(repo.triggerMode).toBe("manual");
    });

    it("should add repo with buddy assignment", async () => {
      const { addRepo } = await import("../config/config.js");
      const repo = await addRepo("owner", "repo", "buddy-123");
      expect(repo.buddyId).toBe("buddy-123");
    });

    it("should persist repo across config reloads", async () => {
      const { addRepo, loadConfig } = await import("../config/config.js");
      await addRepo("owner", "repo", "buddy-1");
      const config = await loadConfig();
      expect(config.repos).toHaveLength(1);
      expect(config.repos[0].id).toBe("owner/repo");
    });

    it("should throw error for duplicate repo", async () => {
      const { addRepo } = await import("../config/config.js");
      await addRepo("owner", "repo");
      await expect(addRepo("owner", "repo")).rejects.toThrow("already configured");
    });
  });

  describe("removeRepo", () => {
    it("should remove existing repo", async () => {
      const { addRepo, removeRepo, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo");
      expect(await listRepos()).toHaveLength(1);

      await removeRepo("owner", "repo");
      expect(await listRepos()).toHaveLength(0);
    });

    it("should persist removal across config reloads", async () => {
      const { addRepo, removeRepo, loadConfig } = await import("../config/config.js");
      await addRepo("owner", "repo");
      await removeRepo("owner", "repo");

      const config = await loadConfig();
      expect(config.repos).toHaveLength(0);
    });

    it("should throw error for non-existent repo", async () => {
      const { removeRepo } = await import("../config/config.js");
      await expect(removeRepo("owner", "nonexistent")).rejects.toThrow("not found");
    });

    it("should remove correct repo when multiple exist", async () => {
      const { addRepo, removeRepo, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo1");
      await addRepo("owner", "repo2");
      await addRepo("other", "repo3");

      await removeRepo("owner", "repo2");

      const repos = await listRepos();
      expect(repos).toHaveLength(2);
      expect(repos.map((r) => r.id)).toContain("owner/repo1");
      expect(repos.map((r) => r.id)).toContain("other/repo3");
      expect(repos.map((r) => r.id)).not.toContain("owner/repo2");
    });
  });

  describe("listRepos", () => {
    it("should return empty array when no repos configured", async () => {
      const { listRepos } = await import("../config/config.js");
      const repos = await listRepos();
      expect(repos).toEqual([]);
    });

    it("should list all configured repos", async () => {
      const { addRepo, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo1", "buddy-1");
      await addRepo("owner", "repo2", "buddy-2");
      await addRepo("other", "repo3");

      const repos = await listRepos();
      expect(repos).toHaveLength(3);
      expect(repos.map((r) => r.id)).toContain("owner/repo1");
      expect(repos.map((r) => r.id)).toContain("owner/repo2");
      expect(repos.map((r) => r.id)).toContain("other/repo3");
    });

    it("should return repos with all properties", async () => {
      const { addRepo, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo", "buddy-test");

      const repos = await listRepos();
      const repo = repos[0];

      expect(repo).toMatchObject({
        id: "owner/repo",
        owner: "owner",
        repo: "repo",
        buddyId: "buddy-test",
        autoReview: false,
        triggerMode: "manual",
      });
    });
  });

  describe("assignBuddy", () => {
    it("should assign buddy to existing repo", async () => {
      const { addRepo, assignBuddy, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo");
      await assignBuddy("owner/repo", "buddy-456");

      const repos = await listRepos();
      const repo = repos.find((r) => r.id === "owner/repo");
      expect(repo?.buddyId).toBe("buddy-456");
      expect(repo?.buddies).toEqual(["buddy-456"]);
    });

    it("should persist buddy assignment", async () => {
      const { addRepo, assignBuddy, loadConfig } = await import("../config/config.js");
      await addRepo("owner", "repo");
      await assignBuddy("owner/repo", "buddy-789");

      const config = await loadConfig();
      const repo = config.repos.find((r) => r.id === "owner/repo");
      expect(repo?.buddyId).toBe("buddy-789");
      expect(repo?.buddies).toEqual(["buddy-789"]);
    });

    it("should update buddy assignment when already assigned", async () => {
      const { addRepo, assignBuddy, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo", "buddy-1");
      await assignBuddy("owner/repo", "buddy-2");

      const repos = await listRepos();
      const repo = repos.find((r) => r.id === "owner/repo");
      expect(repo?.buddyId).toBe("buddy-2");
      expect(repo?.buddies).toEqual(["buddy-2"]);
    });

    it("should throw error for non-existent repo", async () => {
      const { assignBuddy } = await import("../config/config.js");
      await expect(assignBuddy("nonexistent/repo", "buddy-1")).rejects.toThrow("not found");
    });

    it("should not affect other repos when assigning", async () => {
      const { addRepo, assignBuddy, listRepos } = await import("../config/config.js");
      await addRepo("owner", "repo1", "buddy-1");
      await addRepo("owner", "repo2", "buddy-2");

      await assignBuddy("owner/repo1", "buddy-3");

      const repos = await listRepos();
      const repo1 = repos.find((r) => r.id === "owner/repo1");
      const repo2 = repos.find((r) => r.id === "owner/repo2");

      expect(repo1?.buddyId).toBe("buddy-3");
      expect(repo2?.buddyId).toBe("buddy-2");
    });
  });

  describe("Config persistence", () => {
    it("should save and load config correctly", async () => {
      const { saveConfig, loadConfig } = await import("../config/config.js");
      const config: AgentBuddyConfig = {
        version: "1.0.0",
        repos: [
          {
            id: "test/repo",
            owner: "test",
            repo: "repo",
            buddyId: "test-buddy",
            autoReview: true,
            triggerMode: "manual",
          },
        ],
        server: {
          port: 4000,
          host: "127.0.0.1",
          webhookSecret: "secret123",
          apiKey: "key456",
        },
        review: {
          defaultSeverity: "warning",
          maxComments: 100,
          autoApproveBelow: true,
          reviewDelaySeconds: 30,
        },
        githubToken: "test-token",
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      expect(loaded.version).toBe(config.version);
      expect(loaded.repos).toHaveLength(1);
      expect(loaded.repos[0]).toMatchObject(config.repos[0]);
      expect(loaded.server?.port).toBe(4000);
      expect(loaded.review?.defaultSeverity).toBe("warning");
    });

    it("should merge with defaults when loading partial config", async () => {
      const { loadConfig } = await import("../config/config.js");
      const partialConfig = {
        version: "1.0.0" as const,
        repos: [],
      };

      await fs.mkdir(path.join(TEST_DIR, ".agent-buddy"), { recursive: true });
      await fs.writeFile(
        path.join(TEST_DIR, ".agent-buddy", "config.json"),
        JSON.stringify(partialConfig, null, 2)
      );

      const loaded = await loadConfig();
      expect(loaded.server).toBeDefined();
      expect(loaded.review).toBeDefined();
      expect(loaded.server?.port).toBe(3000);
    });

    it("should handle missing config file gracefully", async () => {
      const { loadConfig } = await import("../config/config.js");
      const loaded = await loadConfig();
      expect(loaded.version).toBe("1.0.0");
      expect(loaded.repos).toEqual([]);
      expect(loaded.server).toBeDefined();
    });

    it("should preserve config across multiple operations", async () => {
      const { addRepo, assignBuddy, loadConfig } = await import("../config/config.js");
      await addRepo("owner", "repo1", "buddy-1");
      await addRepo("owner", "repo2", "buddy-2");
      await assignBuddy("owner/repo1", "buddy-3");

      const config = await loadConfig();
      expect(config.repos).toHaveLength(2);
      expect(config.repos.find((r) => r.id === "owner/repo1")?.buddyId).toBe("buddy-3");
      expect(config.repos.find((r) => r.id === "owner/repo2")?.buddyId).toBe("buddy-2");
    });

    it("should create config directory if missing", async () => {
      const { saveConfig } = await import("../config/config.js");
      const configDir = path.join(TEST_DIR, ".agent-buddy");
      await fs.rm(configDir, { recursive: true, force: true });

      await saveConfig({
        version: "1.0.0",
        repos: [],
      });

      const exists = await fs.access(configDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle full repo lifecycle", async () => {
      const { addRepo, listRepos, assignBuddy, removeRepo } = await import("../config/config.js");
      // Add
      await addRepo("acme", "widget-factory");
      expect(await listRepos()).toHaveLength(1);

      // Assign buddy
      await assignBuddy("acme/widget-factory", "senior-dev");
      let repos = await listRepos();
      expect(repos[0].buddyId).toBe("senior-dev");

      // Update via reassignment
      await assignBuddy("acme/widget-factory", "tech-lead");
      repos = await listRepos();
      expect(repos[0].buddyId).toBe("tech-lead");

      // Remove
      await removeRepo("acme", "widget-factory");
      expect(await listRepos()).toHaveLength(0);
    });

    it("should manage multiple repos independently", async () => {
      const { addRepo, assignBuddy, removeRepo, listRepos } = await import("../config/config.js");
      await addRepo("team", "backend", "backend-buddy");
      await addRepo("team", "frontend", "frontend-buddy");
      await addRepo("team", "docs");

      await assignBuddy("team/backend", "senior-backend");
      await removeRepo("team", "frontend");

      const repos = await listRepos();
      expect(repos).toHaveLength(2);
      expect(repos.find((r) => r.id === "team/backend")?.buddyId).toBe("senior-backend");
      expect(repos.find((r) => r.id === "team/docs")?.buddyId).toBeUndefined();
    });
  });

  describe("resetConfig", () => {
    it("should reset config to defaults", async () => {
      const { addRepo, resetConfig, loadConfig } = await import("../config/config.js");
      await addRepo("owner", "repo", "buddy-1");
      const before = await loadConfig();
      expect(before.repos).toHaveLength(1);

      const result = await resetConfig();
      expect(result.repos).toHaveLength(0);
      expect(result.server.port).toBe(3000);
      expect(result.server.host).toBe("0.0.0.0");
      expect(result.review.defaultSeverity).toBe("suggestion");
      expect(result.review.maxComments).toBe(50);

      const after = await loadConfig();
      expect(after.repos).toHaveLength(0);
      expect(after.server.port).toBe(3000);
    });

    it("should preserve version as 1.0.0", async () => {
      const { resetConfig } = await import("../config/config.js");
      const result = await resetConfig();
      expect(result.version).toBe("1.0.0");
    });

    it("should clear all repos on reset", async () => {
      const { addRepo, resetConfig, loadConfig } = await import("../config/config.js");
      await addRepo("a", "b");
      await addRepo("c", "d");
      await addRepo("e", "f");

      await resetConfig();
      const config = await loadConfig();
      expect(config.repos).toHaveLength(0);
    });
  });
});
