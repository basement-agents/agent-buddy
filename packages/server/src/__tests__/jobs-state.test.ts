import { describe, it, expect, beforeEach } from "vitest";
import type {
  ReviewJob,
  AnalysisJob,
  ReviewSchedule,
} from "../jobs/state.js";
import {
  reviewHistory,
  reviewJobs,
  analysisJobs,
  schedules,
} from "../jobs/state.js";

describe("jobs/state", () => {
  beforeEach(() => {
    // Clear all Maps before each test
    reviewJobs.clear();
    analysisJobs.clear();
    schedules.clear();
    reviewHistory.length = 0;
  });

  describe("reviewHistory", () => {
    it("should be initially empty array", () => {
      expect(reviewHistory).toEqual([]);
    });
  });

  describe("reviewJobs Map", () => {
    it("should store and retrieve ReviewJob by ID", () => {
      const job: ReviewJob = {
        id: "review-1",
        repoId: "repo-123",
        prNumber: 42,
        buddyId: "buddy-1",
        reviewType: "low-context",
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)).toEqual(job);
      expect(reviewJobs.has(job.id)).toBe(true);
    });

    it("should support delete operation", () => {
      const job: ReviewJob = {
        id: "review-1",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);
      expect(reviewJobs.has(job.id)).toBe(true);

      reviewJobs.delete(job.id);
      expect(reviewJobs.has(job.id)).toBe(false);
      expect(reviewJobs.get(job.id)).toBeUndefined();
    });

    it("should track size correctly", () => {
      expect(reviewJobs.size).toBe(0);

      reviewJobs.set("review-1", {
        id: "review-1",
        repoId: "repo-1",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      });

      expect(reviewJobs.size).toBe(1);

      reviewJobs.set("review-2", {
        id: "review-2",
        repoId: "repo-2",
        prNumber: 2,
        status: "queued",
        createdAt: new Date(),
      });

      expect(reviewJobs.size).toBe(2);
    });

    it("should accept all valid ReviewJob statuses", () => {
      const statuses: Array<"queued" | "running" | "completed" | "failed"> = [
        "queued",
        "running",
        "completed",
        "failed",
      ];

      statuses.forEach((status) => {
        const job: ReviewJob = {
          id: `review-${status}`,
          repoId: "repo-123",
          prNumber: 42,
          status,
          createdAt: new Date(),
        };
        reviewJobs.set(job.id, job);
        expect(reviewJobs.get(job.id)?.status).toBe(status);
      });
    });
  });

  describe("analysisJobs Map", () => {
    it("should store and retrieve AnalysisJob by ID", () => {
      const job: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)).toEqual(job);
      expect(analysisJobs.has(job.id)).toBe(true);
    });

    it("should support delete operation", () => {
      const job: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      expect(analysisJobs.has(job.id)).toBe(true);

      analysisJobs.delete(job.id);
      expect(analysisJobs.has(job.id)).toBe(false);
      expect(analysisJobs.get(job.id)).toBeUndefined();
    });

    it("should track size correctly", () => {
      expect(analysisJobs.size).toBe(0);

      analysisJobs.set("analysis-1", {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      });

      expect(analysisJobs.size).toBe(1);

      analysisJobs.set("analysis-2", {
        id: "analysis-2",
        buddyId: "buddy-2",
        repo: "owner/repo2",
        status: "queued",
        createdAt: new Date(),
      });

      expect(analysisJobs.size).toBe(2);
    });

    it("should accept all valid AnalysisJob statuses", () => {
      const statuses: Array<"queued" | "running" | "completed" | "failed"> = [
        "queued",
        "running",
        "completed",
        "failed",
      ];

      statuses.forEach((status) => {
        const job: AnalysisJob = {
          id: `analysis-${status}`,
          buddyId: "buddy-1",
          repo: "owner/repo",
          status,
          createdAt: new Date(),
        };
        analysisJobs.set(job.id, job);
        expect(analysisJobs.get(job.id)?.status).toBe(status);
      });
    });

    it("should accept all valid AnalysisJob progressStages", () => {
      const progressStages: Array<
        | "fetching_reviews"
        | "analyzing_patterns"
        | "generating_profile"
        | "completed"
        | "failed"
      > = [
        "fetching_reviews",
        "analyzing_patterns",
        "generating_profile",
        "completed",
        "failed",
      ];

      progressStages.forEach((progressStage) => {
        const job: AnalysisJob = {
          id: `analysis-${progressStage}`,
          buddyId: "buddy-1",
          repo: "owner/repo",
          status: "running",
          progressStage,
          createdAt: new Date(),
        };
        analysisJobs.set(job.id, job);
        expect(analysisJobs.get(job.id)?.progressStage).toBe(progressStage);
      });
    });
  });

  describe("schedules Map", () => {
    it("should store and retrieve ReviewSchedule by repoId", () => {
      const schedule: ReviewSchedule = {
        repoId: "repo-123",
        enabled: true,
        intervalMinutes: 60,
      };

      schedules.set(schedule.repoId, schedule);
      expect(schedules.get(schedule.repoId)).toEqual(schedule);
      expect(schedules.has(schedule.repoId)).toBe(true);
    });

    it("should support delete operation", () => {
      const schedule: ReviewSchedule = {
        repoId: "repo-123",
        enabled: true,
        intervalMinutes: 60,
      };

      schedules.set(schedule.repoId, schedule);
      expect(schedules.has(schedule.repoId)).toBe(true);

      schedules.delete(schedule.repoId);
      expect(schedules.has(schedule.repoId)).toBe(false);
      expect(schedules.get(schedule.repoId)).toBeUndefined();
    });

    it("should track size correctly", () => {
      expect(schedules.size).toBe(0);

      schedules.set("repo-1", {
        repoId: "repo-1",
        enabled: true,
        intervalMinutes: 30,
      });

      expect(schedules.size).toBe(1);

      schedules.set("repo-2", {
        repoId: "repo-2",
        enabled: false,
        intervalMinutes: 60,
      });

      expect(schedules.size).toBe(2);
    });
  });

  describe("state transitions", () => {
    it("should allow valid ReviewJob state transitions", () => {
      const job: ReviewJob = {
        id: "review-transition",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.status).toBe("queued");

      // Transition: queued -> running
      job.status = "running";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.status).toBe("running");

      // Transition: running -> completed
      job.status = "completed";
      job.completedAt = new Date();
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.status).toBe("completed");
    });

    it("should allow valid ReviewJob failure transitions", () => {
      const job: ReviewJob = {
        id: "review-failed",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);

      // Transition: queued -> running
      job.status = "running";
      reviewJobs.set(job.id, job);

      // Transition: running -> failed
      job.status = "failed";
      job.error = "Something went wrong";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.status).toBe("failed");
      expect(reviewJobs.get(job.id)?.error).toBe("Something went wrong");
    });

    it("should allow valid AnalysisJob state transitions", () => {
      const job: AnalysisJob = {
        id: "analysis-transition",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("queued");

      // Transition: queued -> running
      job.status = "running";
      job.progressStage = "fetching_reviews";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("running");

      // Progress through stages
      job.progressStage = "analyzing_patterns";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("analyzing_patterns");

      job.progressStage = "generating_profile";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe(
        "generating_profile"
      );

      // Final transition: running -> completed
      job.status = "completed";
      job.progressStage = "completed";
      job.completedAt = new Date();
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("completed");
    });

    it("should allow valid AnalysisJob failure transitions", () => {
      const job: AnalysisJob = {
        id: "analysis-failed",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);

      // Transition: queued -> running
      job.status = "running";
      job.progressStage = "analyzing_patterns";
      analysisJobs.set(job.id, job);

      // Transition: running -> failed
      job.status = "failed";
      job.progressStage = "failed";
      job.error = "Analysis failed";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("failed");
      expect(analysisJobs.get(job.id)?.progressStage).toBe("failed");
    });
  });

  describe("Map insertion order", () => {
    it("should maintain insertion order for reviewJobs", () => {
      const job1: ReviewJob = {
        id: "review-1",
        repoId: "repo-1",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      };
      const job2: ReviewJob = {
        id: "review-2",
        repoId: "repo-2",
        prNumber: 2,
        status: "queued",
        createdAt: new Date(),
      };
      const job3: ReviewJob = {
        id: "review-3",
        repoId: "repo-3",
        prNumber: 3,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job1.id, job1);
      reviewJobs.set(job2.id, job2);
      reviewJobs.set(job3.id, job3);

      const ids = Array.from(reviewJobs.keys());
      expect(ids).toEqual(["review-1", "review-2", "review-3"]);
    });

    it("should maintain insertion order for analysisJobs", () => {
      const job1: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo1",
        status: "queued",
        createdAt: new Date(),
      };
      const job2: AnalysisJob = {
        id: "analysis-2",
        buddyId: "buddy-2",
        repo: "owner/repo2",
        status: "queued",
        createdAt: new Date(),
      };
      const job3: AnalysisJob = {
        id: "analysis-3",
        buddyId: "buddy-3",
        repo: "owner/repo3",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job1.id, job1);
      analysisJobs.set(job2.id, job2);
      analysisJobs.set(job3.id, job3);

      const ids = Array.from(analysisJobs.keys());
      expect(ids).toEqual(["analysis-1", "analysis-2", "analysis-3"]);
    });

    it("should maintain insertion order for schedules", () => {
      const schedule1: ReviewSchedule = {
        repoId: "repo-1",
        enabled: true,
        intervalMinutes: 30,
      };
      const schedule2: ReviewSchedule = {
        repoId: "repo-2",
        enabled: true,
        intervalMinutes: 60,
      };
      const schedule3: ReviewSchedule = {
        repoId: "repo-3",
        enabled: false,
        intervalMinutes: 120,
      };

      schedules.set(schedule1.repoId, schedule1);
      schedules.set(schedule2.repoId, schedule2);
      schedules.set(schedule3.repoId, schedule3);

      const repoIds = Array.from(schedules.keys());
      expect(repoIds).toEqual(["repo-1", "repo-2", "repo-3"]);
    });
  });

  describe("optional fields", () => {
    it("should allow optional ReviewJob fields", () => {
      const job: ReviewJob = {
        id: "review-optional",
        repoId: "repo-123",
        prNumber: 42,
        status: "completed",
        createdAt: new Date(),
        completedAt: new Date(),
        progressPercentage: 100,
        progressStage: "final",
        progressDetail: "Review complete",
        retryCount: 0,
        maxRetries: 3,
        errorHistory: [
          {
            message: "Previous error",
            timestamp: new Date(),
            attempt: 1,
          },
        ],
        result: {
          summary: "Great work!",
          state: "approved",
          comments: [],
          buddyId: "buddy-1",
          reviewedAt: new Date(),
          metadata: {
            prNumber: 42,
            repo: "repo-123",
            owner: "owner",
            reviewType: "low-context",
            llmModel: "claude-3",
            tokenUsage: {
              inputTokens: 100,
              outputTokens: 50,
              totalTokens: 150,
            },
            durationMs: 1000,
          },
        },
      };

      reviewJobs.set(job.id, job);
      const retrieved = reviewJobs.get(job.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.buddyId).toBeUndefined(); // Not set
      expect(retrieved?.completedAt).toBeDefined();
      expect(retrieved?.progressPercentage).toBe(100);
      expect(retrieved?.errorHistory).toHaveLength(1);
    });

    it("should allow optional AnalysisJob fields", () => {
      const job: AnalysisJob = {
        id: "analysis-optional",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "running",
        progress: "Processing...",
        progressStage: "analyzing_patterns",
        progressPercentage: 50,
        progressDetail: "Analyzing review patterns",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      const retrieved = analysisJobs.get(job.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.progress).toBe("Processing...");
      expect(retrieved?.progressStage).toBe("analyzing_patterns");
      expect(retrieved?.progressPercentage).toBe(50);
      expect(retrieved?.error).toBeUndefined(); // Not set
    });

    it("should allow optional ReviewSchedule fields", () => {
      const schedule: ReviewSchedule = {
        repoId: "repo-123",
        enabled: true,
        intervalMinutes: 60,
        lastRun: new Date().toISOString(),
        retryCount: 2,
        lastError: "Previous failure",
      };

      schedules.set(schedule.repoId, schedule);
      const retrieved = schedules.get(schedule.repoId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.lastRun).toBeDefined();
      expect(retrieved?.retryCount).toBe(2);
      expect(retrieved?.lastError).toBe("Previous failure");
      expect(retrieved?.timer).toBeUndefined(); // Not set
    });
  });
});
