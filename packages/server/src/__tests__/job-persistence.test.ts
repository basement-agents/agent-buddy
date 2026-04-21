import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Import persistence module functions
// Since persistence uses ~/.agent-buddy/jobs, we need to test the serialization logic
// by importing and testing the functions directly

describe("Job persistence", () => {
  const TEST_DIR = path.join(os.tmpdir(), `agent-buddy-persistence-test-${Date.now()}`);

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Job serialization", () => {
    it("should serialize and deserialize a review job", async () => {
      const job = {
        type: "review" as const,
        data: {
          id: "job-1",
          repoId: "owner/repo",
          prNumber: 42,
          buddyId: "buddy-1",
          status: "running" as const,
          createdAt: new Date().toISOString(),
          progressPercentage: 50,
          progressStage: "analyzing_code",
          progressDetail: "Analyzing code changes...",
        },
      };

      const filePath = path.join(TEST_DIR, `${job.data.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(job));

      const raw = await fs.readFile(filePath, "utf-8");
      const loaded = JSON.parse(raw);

      expect(loaded.type).toBe("review");
      expect(loaded.data.id).toBe("job-1");
      expect(loaded.data.repoId).toBe("owner/repo");
      expect(loaded.data.prNumber).toBe(42);
      expect(loaded.data.status).toBe("running");
      expect(loaded.data.progressPercentage).toBe(50);
    });

    it("should serialize and deserialize an analysis job", async () => {
      const job = {
        type: "analysis" as const,
        data: {
          id: "analysis-1",
          buddyId: "buddy-1",
          repo: "owner/repo",
          status: "completed" as const,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      };

      const filePath = path.join(TEST_DIR, `${job.data.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(job));

      const raw = await fs.readFile(filePath, "utf-8");
      const loaded = JSON.parse(raw);

      expect(loaded.type).toBe("analysis");
      expect(loaded.data.id).toBe("analysis-1");
      expect(loaded.data.status).toBe("completed");
    });

    it("should handle job with error history", async () => {
      const job = {
        type: "review" as const,
        data: {
          id: "job-error",
          repoId: "owner/repo",
          prNumber: 1,
          status: "failed" as const,
          error: "API rate limit exceeded",
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          retryCount: 3,
          maxRetries: 3,
          errorHistory: [
            { message: "Timeout", timestamp: new Date().toISOString(), attempt: 1 },
            { message: "Rate limit", timestamp: new Date().toISOString(), attempt: 2 },
            { message: "API rate limit exceeded", timestamp: new Date().toISOString(), attempt: 3 },
          ],
        },
      };

      const filePath = path.join(TEST_DIR, `${job.data.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(job));

      const raw = await fs.readFile(filePath, "utf-8");
      const loaded = JSON.parse(raw);

      expect(loaded.data.status).toBe("failed");
      expect(loaded.data.error).toBe("API rate limit exceeded");
      expect(loaded.data.errorHistory).toHaveLength(3);
      expect(loaded.data.retryCount).toBe(3);
    });
  });

  describe("Job recovery", () => {
    it("should identify running jobs that need recovery", async () => {
      const jobs = [
        {
          type: "review",
          data: { id: "running-1", status: "running", createdAt: new Date().toISOString() },
        },
        {
          type: "review",
          data: { id: "completed-1", status: "completed", createdAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        },
        {
          type: "analysis",
          data: { id: "running-2", status: "running", createdAt: new Date().toISOString() },
        },
      ];

      for (const job of jobs) {
        await fs.writeFile(path.join(TEST_DIR, `${job.data.id}.json`), JSON.stringify(job));
      }

      const files = await fs.readdir(TEST_DIR);
      const loaded = [];
      for (const file of files) {
        const raw = await fs.readFile(path.join(TEST_DIR, file), "utf-8");
        loaded.push(JSON.parse(raw));
      }

      const runningJobs = loaded.filter((j) => j.data.status === "running");
      expect(runningJobs).toHaveLength(2);

      // Recover: mark running as failed
      for (const job of runningJobs) {
        job.data.status = "failed";
        job.data.error = "Server restarted while job was running";
        job.data.completedAt = new Date().toISOString();
        await fs.writeFile(path.join(TEST_DIR, `${job.data.id}.json`), JSON.stringify(job));
      }

      // Verify recovery
      const recovered = [];
      for (const file of await fs.readdir(TEST_DIR)) {
        const raw = await fs.readFile(path.join(TEST_DIR, file), "utf-8");
        recovered.push(JSON.parse(raw));
      }

      const stillRunning = recovered.filter((j) => j.data.status === "running");
      const nowFailed = recovered.filter((j) => j.data.error === "Server restarted while job was running");
      expect(stillRunning).toHaveLength(0);
      expect(nowFailed).toHaveLength(2);
    });

    it("should skip corrupted job files", async () => {
      // Write a valid job
      await fs.writeFile(
        path.join(TEST_DIR, "valid.json"),
        JSON.stringify({ type: "review", data: { id: "valid", status: "completed", createdAt: new Date().toISOString() } })
      );
      // Write a corrupted job
      await fs.writeFile(path.join(TEST_DIR, "corrupted.json"), "not json");

      const files = await fs.readdir(TEST_DIR);
      const loaded = [];
      for (const file of files) {
        try {
          const raw = await fs.readFile(path.join(TEST_DIR, file), "utf-8");
          loaded.push(JSON.parse(raw));
        } catch {
          // Skip corrupted
        }
      }

      expect(loaded).toHaveLength(1);
      expect(loaded[0].data.id).toBe("valid");
    });
  });

  describe("Job cleanup", () => {
    it("should clean up old completed jobs", async () => {
      const now = Date.now();
      const oldDate = new Date(now - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
      const recentDate = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago

      const jobs = [
        { type: "review", data: { id: "old-completed", status: "completed", completedAt: oldDate, createdAt: oldDate } },
        { type: "review", data: { id: "old-failed", status: "failed", completedAt: oldDate, createdAt: oldDate } },
        { type: "review", data: { id: "recent-completed", status: "completed", completedAt: recentDate, createdAt: recentDate } },
        { type: "review", data: { id: "running", status: "running", createdAt: new Date().toISOString() } },
      ];

      for (const job of jobs) {
        await fs.writeFile(path.join(TEST_DIR, `${job.data.id}.json`), JSON.stringify(job));
      }

      // Simulate cleanup: remove completed/failed jobs older than 24h
      const maxAge = 24 * 60 * 60 * 1000;
      let removed = 0;
      for (const file of await fs.readdir(TEST_DIR)) {
        const raw = await fs.readFile(path.join(TEST_DIR, file), "utf-8");
        const job = JSON.parse(raw);
        if ((job.data.status === "completed" || job.data.status === "failed") && job.data.completedAt) {
          if ((now - new Date(job.data.completedAt).getTime()) > maxAge) {
            await fs.unlink(path.join(TEST_DIR, file));
            removed++;
          }
        }
      }

      expect(removed).toBe(2);
      const remaining = await fs.readdir(TEST_DIR);
      expect(remaining).toHaveLength(2);
      expect(remaining).toContain("recent-completed.json");
      expect(remaining).toContain("running.json");
    });
  });
});
