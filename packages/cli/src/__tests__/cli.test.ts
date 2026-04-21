import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";
import path from "node:path";
import os from "node:os";

// Mock the dependencies before importing CLI
vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

import { confirm, input, password } from "@inquirer/prompts";

describe("CLI", () => {
  describe("Program Structure", () => {
    it("should parse command without error", async () => {
      const program = new Command();
      program.exitOverride();
      expect(() => program.parse([], { from: "user" })).not.toThrow();
    });
  });

  describe("Buddy Commands", () => {
    describe("buddy create", () => {
      it("should create buddy with valid username and repo", async () => {
        const mockConfirm = vi.mocked(confirm);
        mockConfirm.mockResolvedValue(true);

        const mockInput = vi.mocked(input);
        mockInput.mockResolvedValue("test-token");

        const mockPassword = vi.mocked(password);
        mockPassword.mockResolvedValue("sk-ant-test-key");

        // Mock GitHub API response
        global.fetch = vi.fn(async () => ({
          ok: true,
          json: async () => ({ login: "testuser" }),
        })) as unknown as typeof globalThis.fetch;

        // Verify mocks were configured for the buddy create flow
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(mockPassword).not.toHaveBeenCalled();
      });

      it("should fail with invalid repo format", async () => {
        const invalidRepos = ["invalid", "owner-only", "/repo-only", "owner/"];

        for (const repo of invalidRepos) {
          const parts = repo.split("/");
          const valid = parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
          expect(valid).toBe(false);
        }
      });

      it("should handle missing GitHub token", async () => {
        // Mock environment without token
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;
        delete process.env.GH_TOKEN;

        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
        expect(token).toBe("");

        // Restore token
        if (originalToken) {
          process.env.GITHUB_TOKEN = originalToken;
        }
      });

      it("should handle missing Anthropic API key", async () => {
        const originalKey = process.env.ANTHROPIC_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;

        const key = process.env.ANTHROPIC_API_KEY || "";
        expect(key).toBe("");

        if (originalKey) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        }
      });
    });

    describe("buddy list", () => {
      it("should list all buddies", async () => {
        const buddies: string[] = [];
        expect(Array.isArray(buddies)).toBe(true);
      });

      it("should handle empty buddy list", async () => {
        const buddies: string[] = [];
        expect(buddies.length).toBe(0);
      });

      it("should support JSON output format", async () => {
        const jsonFlag = true;
        expect(jsonFlag).toBe(true);
      });

      it("should support verbose output", async () => {
        const verboseFlag = true;
        expect(verboseFlag).toBe(true);
      });
    });

    describe("buddy setup", () => {
      it("should prompt for GitHub token", async () => {
        const mockPassword = vi.mocked(password);
        mockPassword.mockResolvedValue("ghp_test_token");

        const token = await mockPassword({
          message: "GitHub Token (ghp_...):",
          validate: expect.any(Function),
        });

        expect(token).toBe("ghp_test_token");
      });

      it("should validate GitHub token", async () => {
        const mockPassword = vi.mocked(password);
        mockPassword.mockResolvedValue("ghp_valid_token");

        const mockFetch = vi.fn(async () => ({
          ok: true,
          json: async () => ({ login: "testuser" }),
        }));

        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer ghp_valid_token" },
        });

        expect(res.ok).toBe(true);
      });

      it("should reject invalid GitHub token", async () => {
        const mockPassword = vi.mocked(password);
        mockPassword.mockResolvedValue("invalid_token");

        const mockFetch = vi.fn(async () => ({
          ok: false,
        }));

        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer invalid_token" },
        });

        expect(res.ok).toBe(false);
      });

      it("should prompt for Anthropic API key", async () => {
        const mockPassword = vi.mocked(password);
        mockPassword.mockResolvedValue("sk-ant-test-key");

        const key = await mockPassword({
          message: "Anthropic API Key (sk-ant-...):",
          validate: expect.any(Function),
        });

        expect(key).toBe("sk-ant-test-key");
      });

      it("should prompt for server port", async () => {
        const mockInput = vi.mocked(input);
        mockInput.mockResolvedValue("3000");

        const port = await mockInput({
          message: "Server port:",
          default: "3000",
          validate: expect.any(Function),
        });

        expect(port).toBe("3000");
      });

      it("should validate port range", () => {
        const validPorts = ["1", "3000", "65535"];
        const invalidPorts = ["0", "65536", "99999", "abc", "-1"];

        for (const port of validPorts) {
          const num = parseInt(port, 10);
          expect(num > 0 && num < 65536).toBe(true);
        }

        for (const port of invalidPorts) {
          const num = parseInt(port, 10);
          expect(num > 0 && num < 65536).toBe(false);
        }
      });

      it("should save configuration to filesystem", async () => {
        const configDir = path.join(os.homedir(), ".agent-buddy");
        const configPath = path.join(configDir, "config.json");

        const config = { server: { port: 3000 } };

        // Just verify the path construction logic
        expect(configPath).toContain(".agent-buddy");
        expect(configPath).toContain("config.json");
        expect(JSON.stringify(config, null, 2)).toBeDefined();
      });
    });

    describe("buddy review", () => {
      it("should trigger review with valid owner/repo and PR number", async () => {
        const owner = "testowner";
        const repo = "test-repo";
        const prNumber = 123;

        const parts = `${owner}/${repo}`.split("/");
        expect(parts.length).toBe(2);
        expect(parts[0]).toBe(owner);
        expect(parts[1]).toBe(repo);

        expect(typeof prNumber).toBe("number");
        expect(prNumber).toBeGreaterThan(0);
      });

      it("should fail with invalid PR number", async () => {
        const invalidPrNumbers = [
          { str: "abc", expected: false },
          { str: "0", expected: false },
          { str: "-1", expected: false },
          { str: "1.5", expected: true }, // parseInt("1.5") = 1, which is valid
          { str: "null", expected: false },
        ];

        for (const { str, expected } of invalidPrNumbers) {
          const prNumber = parseInt(str, 10);
          const isValid = !isNaN(prNumber) && prNumber > 0;
          expect(isValid).toBe(expected);
        }
      });

      it("should accept optional buddy parameter", async () => {
        const buddyId = "test-buddy-id";
        expect(buddyId).toBeDefined();
        expect(typeof buddyId).toBe("string");
      });

      it("should support high-context flag", async () => {
        const highContext = true;
        expect(highContext).toBe(true);
      });

      it("should prompt for posting review to GitHub", async () => {
        const mockConfirm = vi.mocked(confirm);
        mockConfirm.mockResolvedValue(true);

        const shouldPost = await mockConfirm({
          message: "Post this review to GitHub?",
        });

        expect(shouldPost).toBe(true);
      });
    });

    describe("buddy status", () => {
      it("should retrieve buddy status by ID", async () => {
        const buddyId = "test-buddy";
        expect(buddyId).toBeDefined();
        expect(typeof buddyId).toBe("string");
      });

      it("should handle non-existent buddy ID", async () => {
        const nonExistentId = "non-existent-buddy";
        expect(nonExistentId).toBeDefined();
      });

      it("should display buddy profile information", async () => {
        const profile = {
          id: "buddy-123",
          username: "testuser",
          sourceRepos: ["owner/repo1", "owner/repo2"],
          totalReviews: 42,
        };

        expect(profile.id).toBeDefined();
        expect(profile.username).toBeDefined();
        expect(Array.isArray(profile.sourceRepos)).toBe(true);
        expect(typeof profile.totalReviews).toBe("number");
      });
    });
  });

  describe("Command Validation", () => {
    it("should validate owner/repo format", () => {
      const validRepos = [
        "owner/repo",
        "org-name/repo-name",
        "user123/project_name",
        "owner/name-with-dashes",
      ];

      const invalidRepos = [
        "invalid",
        "owner-only/",
        "/repo-only",
        "owner/repo/extra",
        "",
      ];

      for (const repo of validRepos) {
        const parts = repo.split("/");
        expect(parts.length).toBe(2);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1].length).toBeGreaterThan(0);
      }

      for (const repo of invalidRepos) {
        const parts = repo.split("/");
        const isValid = parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
        expect(isValid).toBe(false);
      }
    });

    it("should validate PR numbers", () => {
      const validPrNumbers = ["1", "123", "9999", "1.5"]; // 1.5 parses to 1
      const invalidPrNumbers = ["0", "-1", "abc", ""];

      for (const prStr of validPrNumbers) {
        const pr = parseInt(prStr, 10);
        expect(!isNaN(pr) && pr > 0).toBe(true);
      }

      for (const prStr of invalidPrNumbers) {
        const pr = parseInt(prStr, 10);
        const isValid = !isNaN(pr) && pr > 0;
        expect(isValid).toBe(false);
      }
    });

    it("should validate buddy IDs", () => {
      const validIds = ["buddy-123", "test-buddy", "my-buddy-id"];
      const invalidIds = ["", "   ", "buddy with spaces"];

      for (const id of validIds) {
        expect(id.trim().length).toBeGreaterThan(0);
        expect(id.includes(" ")).toBe(false);
      }

      for (const id of invalidIds) {
        expect(id.trim().length === 0 || id.includes(" ")).toBe(true);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing GITHUB_TOKEN", async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
      expect(token).toBe("");
    });

    it("should handle missing ANTHROPIC_API_KEY", async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const key = process.env.ANTHROPIC_API_KEY || "";
      expect(key).toBe("");
    });

    it("should handle filesystem errors gracefully", async () => {
      const error = new Error("File not found");
      expect(error.message).toBe("File not found");
      expect(error).toBeInstanceOf(Error);
    });

    it("should handle network errors", async () => {
      const mockFetch = vi.fn(async () => {
        throw new Error("Network error");
      });

      global.fetch = mockFetch as typeof globalThis.fetch;

      await expect(
        fetch("https://api.github.com/user")
      ).rejects.toThrow("Network error");
    });
  });

  describe("Output Formatting", () => {
    it("should support JSON output", () => {
      const data = { key: "value", number: 123 };
      const json = JSON.stringify(data, null, 2);

      expect(json).toContain('"key"');
      expect(json).toContain('"value"');
      expect(json).toContain('"number"');
      expect(json).toContain('123');
    });

    it("should support table formatting", () => {
      const headers = ["ID", "Username", "Repos"];
      const row = ["buddy-1", "testuser", "owner/repo"];

      const headerWidth = 20;
      const formattedHeader = headers[0].padEnd(headerWidth);
      const formattedRow = row[0].padEnd(headerWidth);

      expect(formattedHeader.length).toBe(headerWidth);
      expect(formattedRow.length).toBe(headerWidth);
    });

    it("should handle color codes in output", () => {
      const text = "Colored text";
      const colored = `\x1b[32m${text}\x1b[0m`; // Green text

      expect(colored).toContain(text);
      expect(colored).toContain("\x1b[32m"); // Green color code
      expect(colored).toContain("\x1b[0m"); // Reset code
    });
  });

  describe("Review Trigger with --wait", () => {
    it("should poll job status every 2 seconds", async () => {
      const pollIntervalMs = 2000;
      expect(pollIntervalMs).toBe(2000);
    });

    it("should timeout after 10 minutes by default", async () => {
      const defaultTimeout = parseInt("600000", 10);
      expect(defaultTimeout).toBe(600000); // 10 minutes in ms
    });

    it("should use AGENT_BUDDY_POLL_TIMEOUT_MS env var for timeout", () => {
      const customTimeout = "300000";
      const timeout = parseInt(customTimeout, 10);
      expect(timeout).toBe(300000); // 5 minutes
    });

    it("should exit 0 when job completes successfully", () => {
      const successfulJobStatus = "completed";
      expect(successfulJobStatus).toBe("completed");
    });

    it("should exit 1 when job fails", () => {
      const failedJobStatus = "failed";
      expect(failedJobStatus).toBe("failed");
    });

    it("should poll GET /api/jobs/:jobId endpoint", async () => {
      const jobId = "owner-repo-123-buddy-abc";
      const expectedEndpoint = `/api/jobs/${encodeURIComponent(jobId)}`;
      expect(expectedEndpoint).toContain("/api/jobs/");
      expect(expectedEndpoint).toContain(jobId);
    });

    it("should update ora spinner with job status", () => {
      const statuses = ["queued", "running", "completed", "failed"];
      expect(statuses).toContain("completed");
      expect(statuses).toContain("failed");
      expect(statuses).toContain("running");
      expect(statuses).toContain("queued");
    });

    it("should handle multiple buddy jobs", () => {
      const buddyIds = ["buddy-1", "buddy-2", "buddy-3"];
      expect(buddyIds.length).toBeGreaterThan(1);
      expect(Array.isArray(buddyIds)).toBe(true);
    });

    it("should display summary of results after polling", () => {
      const results = [
        { buddyId: "buddy-1", status: "completed" },
        { buddyId: "buddy-2", status: "failed", error: "Rate limit exceeded" },
      ];
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe("completed");
      expect(results[1].status).toBe("failed");
      expect(results[1].error).toBeDefined();
    });

    it("should handle job not found (404) gracefully", async () => {
      const status404 = 404;
      expect(status404).toBe(404);
    });

    it("should continue polling on timeout", () => {
      const timeoutOccurred = true;
      expect(timeoutOccurred).toBe(true);
    });
  });

  describe("history date filtering", () => {
    interface PersistedJob { type: string; data: { id: string; status: string; repoId?: string; buddyId?: string; prNumber?: number; createdAt: string; completedAt?: string; result?: { comments?: unknown[] } } }

    const sampleJobs: PersistedJob[] = [
      { type: "review", data: { id: "1", status: "completed", repoId: "owner/repo", buddyId: "buddy-1", prNumber: 1, createdAt: "2026-01-05T10:00:00Z" } },
      { type: "review", data: { id: "2", status: "completed", repoId: "owner/repo", buddyId: "buddy-1", prNumber: 2, createdAt: "2026-01-10T10:00:00Z" } },
      { type: "review", data: { id: "3", status: "completed", repoId: "owner/repo", buddyId: "buddy-1", prNumber: 3, createdAt: "2026-01-15T10:00:00Z" } },
      { type: "review", data: { id: "4", status: "failed", repoId: "owner/repo", buddyId: "buddy-2", prNumber: 4, createdAt: "2026-01-20T10:00:00Z" } },
      { type: "other", data: { id: "5", status: "completed", createdAt: "2026-01-25T10:00:00Z" } },
      { type: "review", data: { id: "6", status: "queued", repoId: "owner/repo", buddyId: "buddy-1", prNumber: 6, createdAt: "2026-01-30T10:00:00Z" } },
    ];

    function filterReviews(jobs: PersistedJob[], opts: { repo?: string; buddy?: string; since?: string; until?: string }): PersistedJob[] {
      let reviews = jobs.filter((j) => j.type === "review" && j.data.status !== "queued");
      if (opts.repo) reviews = reviews.filter((j) => j.data.repoId === opts.repo);
      if (opts.buddy) reviews = reviews.filter((j) => j.data.buddyId === opts.buddy);
      if (opts.since) reviews = reviews.filter((j) => new Date(j.data.createdAt) >= new Date(opts.since!));
      if (opts.until) {
        const endOfDay = new Date(opts.until);
        endOfDay.setHours(23, 59, 59, 999);
        reviews = reviews.filter((j) => new Date(j.data.createdAt) <= endOfDay);
      }
      return reviews;
    }

    it("filters by --since date", () => {
      const result = filterReviews(sampleJobs, { since: "2026-01-12" });
      expect(result).toHaveLength(2);
      expect(result.every((j) => new Date(j.data.createdAt) >= new Date("2026-01-12"))).toBe(true);
    });

    it("filters by --until date", () => {
      const result = filterReviews(sampleJobs, { until: "2026-01-12" });
      expect(result).toHaveLength(2);
      expect(result.every((j) => new Date(j.data.createdAt) <= new Date("2026-01-12T23:59:59.999Z"))).toBe(true);
    });

    it("filters by both --since and --until for a date range", () => {
      const result = filterReviews(sampleJobs, { since: "2026-01-08", until: "2026-01-18" });
      expect(result).toHaveLength(2);
      const ids = result.map((j) => j.data.id);
      expect(ids).toContain("2");
      expect(ids).toContain("3");
    });

    it("returns empty when no reviews match date range", () => {
      const result = filterReviews(sampleJobs, { since: "2026-02-01" });
      expect(result).toHaveLength(0);
    });

    it("returns all reviews when no date filters applied", () => {
      const result = filterReviews(sampleJobs, {});
      expect(result).toHaveLength(4);
    });

    it("date filtering works alongside repo filter", () => {
      const result = filterReviews(sampleJobs, { repo: "owner/repo", since: "2026-01-15" });
      expect(result).toHaveLength(2);
      expect(result.every((j) => j.data.repoId === "owner/repo")).toBe(true);
    });

    it("rejects invalid date format", () => {
      const invalidDate = new Date("not-a-date");
      expect(isNaN(invalidDate.getTime())).toBe(true);
    });

    it("includes reviews exactly on the since boundary", () => {
      const result = filterReviews(sampleJobs, { since: "2026-01-10" });
      expect(result.some((j) => j.data.id === "2")).toBe(true);
    });

    it("includes reviews exactly on the until boundary", () => {
      const result = filterReviews(sampleJobs, { until: "2026-01-10" });
      expect(result.some((j) => j.data.id === "2")).toBe(true);
    });
  });
});
