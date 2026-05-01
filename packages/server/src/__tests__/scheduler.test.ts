/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkForOpenPRs, initializeSchedules, cleanupSchedules } from "../jobs/scheduler.js";
import { schedules, reviewJobs } from "../jobs/state.js";
import { loadConfig } from "@agent-buddy/core";

// Use vi.hoisted to share mock state between the factory and tests.
// A class-based mock is needed because vi.fn().mockImplementation()
// does not propagate across module boundaries in ESM.
const { mockGitHubClient } = vi.hoisted(() => ({
  mockGitHubClient: {
    listPRs: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../jobs/review.js", () => ({
  processReviewJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  GitHubClient: class MockGitHubClient {
    constructor() {
      return mockGitHubClient;
    }
  },
  Logger: class Logger {
    error = vi.fn();
    info = vi.fn();
    warn = vi.fn();
  },
  BuddyFileSystemStorage: class {},
  AnalysisPipeline: class {},
  ReviewEngine: class {},
  evaluateCustomRules: vi.fn(),
  AnthropicClaudeProvider: class {},
  ConfigError: class extends Error {},
  FileContextCache: class {},
  recordFeedback: vi.fn(),
  getFeedbackSummary: vi.fn().mockResolvedValue({ helpful: 0, notHelpful: 0, patterns: [] }),
  getRecentFeedback: vi.fn().mockResolvedValue([]),
  configSchema: {},
  compareBuddies: vi.fn(),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

describe("Scheduler Retry Logic", () => {
  beforeEach(() => {
    cleanupSchedules();
    vi.clearAllMocks();
    vi.clearAllTimers();
    schedules.clear();
    reviewJobs.clear();
    process.env.GITHUB_TOKEN = "test-token";
  });

  afterEach(() => {
    cleanupSchedules();
    delete process.env.GITHUB_TOKEN;
  });

  describe("retry logging", () => {
    it("should reset retry count after max retries exhausted", async () => {
      mockGitHubClient.listPRs = vi.fn().mockRejectedValue(new Error("API Error"));

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      schedules.set("owner/repo", {
        repoId: "owner/repo",
        enabled: true,
        intervalMinutes: 60,
        retryCount: 5,
      });

      await checkForOpenPRs("owner/repo");

      expect(mockGitHubClient.listPRs).toHaveBeenCalled();
      const schedule = schedules.get("owner/repo");
      expect(schedule?.retryCount).toBe(0);
      expect(schedule?.lastError).toBe("API Error");
    });
  });

  describe("integration with scheduling", () => {
    it("should not affect scheduling interval", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 1 },
          },
        ],
      } as any);

      initializeSchedules({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 1 },
          },
        ],
      });

      const schedule = schedules.get("owner/repo");
      expect(schedule?.timer).toBeDefined();
      expect(schedule?.intervalMinutes).toBe(1);
    });

    it("should update last run time on success", async () => {
      mockGitHubClient.listPRs = vi.fn().mockResolvedValue([]);

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      schedules.set("owner/repo", {
        repoId: "owner/repo",
        enabled: true,
        intervalMinutes: 60,
      });

      await checkForOpenPRs("owner/repo");

      const schedule = schedules.get("owner/repo");
      expect(schedule?.lastRun).toBeDefined();
      expect(schedule?.retryCount).toBe(0);
      expect(schedule?.lastError).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle missing schedule gracefully", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        repos: [{ id: "owner/repo" }],
      } as any);

      await expect(checkForOpenPRs("owner/repo")).resolves.toBeUndefined();
    });

    it("should handle disabled schedule", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: false, intervalMinutes: 60 },
          },
        ],
      } as any);

      await expect(checkForOpenPRs("owner/repo")).resolves.toBeUndefined();
    });

    it("should handle missing GITHUB_TOKEN", async () => {
      delete process.env.GITHUB_TOKEN;

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      await expect(checkForOpenPRs("owner/repo")).resolves.toBeUndefined();
      process.env.GITHUB_TOKEN = "test-token";
    });

    it("should handle zero PRs found", async () => {
      mockGitHubClient.listPRs = vi.fn().mockResolvedValue([]);

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      await checkForOpenPRs("owner/repo");

      expect(mockGitHubClient.listPRs).toHaveBeenCalled();
    });

    it("should handle missing repo config", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        repos: [{ id: "other/repo" }],
      } as any);

      await expect(checkForOpenPRs("owner/repo")).resolves.toBeUndefined();
    });
  });

  describe("schedule state management", () => {
    it("should store retry count in schedule", async () => {
      mockGitHubClient.listPRs = vi.fn().mockRejectedValue(new Error("Test error"));

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      schedules.set("owner/repo", {
        repoId: "owner/repo",
        enabled: true,
        intervalMinutes: 60,
        retryCount: 5,
      });

      await checkForOpenPRs("owner/repo");

      expect(mockGitHubClient.listPRs).toHaveBeenCalled();
      const schedule = schedules.get("owner/repo");
      expect(schedule?.lastError).toBe("Test error");
    });

    it("should store last error in schedule", async () => {
      mockGitHubClient.listPRs = vi.fn().mockRejectedValue(new Error("Connection failed"));

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      schedules.set("owner/repo", {
        repoId: "owner/repo",
        enabled: true,
        intervalMinutes: 60,
        retryCount: 5,
      });

      await checkForOpenPRs("owner/repo");

      expect(mockGitHubClient.listPRs).toHaveBeenCalled();
      const schedule = schedules.get("owner/repo");
      expect(schedule?.lastError).toBe("Connection failed");
    });
  });

  describe("PR discovery with buddies", () => {
    it("should create review jobs for open PRs", async () => {
      mockGitHubClient.listPRs = vi.fn().mockResolvedValue([
        { number: 123, title: "Test PR" },
      ]);

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            buddyId: "buddy-1",
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      await checkForOpenPRs("owner/repo");

      const jobs = Array.from(reviewJobs.values());
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0].prNumber).toBe(123);
      expect(jobs[0].buddyId).toBe("buddy-1");
    });

    it("should support multiple buddies per repo", async () => {
      mockGitHubClient.listPRs = vi.fn().mockResolvedValue([
        { number: 123, title: "Test PR" },
      ]);

      vi.mocked(loadConfig).mockResolvedValue({
        repos: [
          {
            id: "owner/repo",
            buddies: ["buddy-1", "buddy-2"],
            schedule: { enabled: true, intervalMinutes: 60 },
          },
        ],
      } as any);

      await checkForOpenPRs("owner/repo");

      const jobs = Array.from(reviewJobs.values());
      expect(jobs.length).toBe(2);
      expect(jobs.some((j) => j.buddyId === "buddy-1")).toBe(true);
      expect(jobs.some((j) => j.buddyId === "buddy-2")).toBe(true);
    });
  });
});
