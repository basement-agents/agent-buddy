import { describe, it, expect, beforeEach } from "vitest";
import { reviewJobs, analysisJobs, schedules, reviewHistory } from "../jobs/state.js";
import type { ReviewJob, AnalysisJob, ErrorEntry } from "../jobs/state.js";

describe("Job state management", () => {
  beforeEach(() => {
    reviewJobs.clear();
    analysisJobs.clear();
    schedules.clear();
    reviewHistory.length = 0;
  });

  describe("Job creation with correct initial state", () => {
    it("should create a ReviewJob with status 'queued' and all required fields", () => {
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
      const retrieved = reviewJobs.get(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("review-1");
      expect(retrieved?.repoId).toBe("repo-123");
      expect(retrieved?.prNumber).toBe(42);
      expect(retrieved?.buddyId).toBe("buddy-1");
      expect(retrieved?.reviewType).toBe("low-context");
      expect(retrieved?.status).toBe("queued");
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.result).toBeUndefined();
      expect(retrieved?.error).toBeUndefined();
      expect(retrieved?.completedAt).toBeUndefined();
    });

    it("should create an AnalysisJob with status 'queued' and all required fields", () => {
      const job: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      const retrieved = analysisJobs.get(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe("analysis-1");
      expect(retrieved?.buddyId).toBe("buddy-1");
      expect(retrieved?.repo).toBe("owner/repo");
      expect(retrieved?.status).toBe("queued");
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.error).toBeUndefined();
      expect(retrieved?.completedAt).toBeUndefined();
      expect(retrieved?.progress).toBeUndefined();
    });
  });

  describe("Job state transitions", () => {
    it("should transition ReviewJob from queued to running to completed", () => {
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
      expect(reviewJobs.get(job.id)?.completedAt).toBeInstanceOf(Date);
    });

    it("should transition ReviewJob from queued to running to failed with error message", () => {
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
      job.error = "API rate limit exceeded";
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.status).toBe("failed");
      expect(reviewJobs.get(job.id)?.error).toBe("API rate limit exceeded");
    });

    it("should transition ReviewJob from queued to cancelled", () => {
      const job: ReviewJob = {
        id: "review-cancelled",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);

      // Transition: queued -> cancelled
      job.status = "cancelled";
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.status).toBe("cancelled");
    });

    it("should transition AnalysisJob from queued to running to completed", () => {
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
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("running");

      // Transition: running -> completed
      job.status = "completed";
      job.completedAt = new Date();
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.status).toBe("completed");
    });

    it("should transition AnalysisJob from queued to running to failed with error", () => {
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
      analysisJobs.set(job.id, job);

      // Transition: running -> failed
      job.status = "failed";
      job.error = "Failed to fetch reviews";
      analysisJobs.set(job.id, job);

      expect(analysisJobs.get(job.id)?.status).toBe("failed");
      expect(analysisJobs.get(job.id)?.error).toBe("Failed to fetch reviews");
    });

    it("should transition AnalysisJob from queued to cancelled", () => {
      const job: AnalysisJob = {
        id: "analysis-cancelled",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);

      // Transition: queued -> cancelled
      job.status = "cancelled";
      analysisJobs.set(job.id, job);

      expect(analysisJobs.get(job.id)?.status).toBe("cancelled");
    });
  });

  describe("Job progress updates", () => {
    it("should set progressPercentage, progressStage, and progressDetail on a running ReviewJob", () => {
      const job: ReviewJob = {
        id: "review-progress",
        repoId: "repo-123",
        prNumber: 42,
        status: "running",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);

      // Update progress
      job.progressPercentage = 25;
      job.progressStage = "fetching";
      job.progressDetail = "Fetching PR diff";
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.progressPercentage).toBe(25);
      expect(reviewJobs.get(job.id)?.progressStage).toBe("fetching");
      expect(reviewJobs.get(job.id)?.progressDetail).toBe("Fetching PR diff");
    });

    it("should track progress through stages on a ReviewJob", () => {
      const job: ReviewJob = {
        id: "review-stages",
        repoId: "repo-123",
        prNumber: 42,
        status: "running",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);

      // Stage 1: Fetching
      job.progressPercentage = 20;
      job.progressStage = "fetching";
      job.progressDetail = "Fetching PR files";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.progressPercentage).toBe(20);
      expect(reviewJobs.get(job.id)?.progressStage).toBe("fetching");

      // Stage 2: Analyzing
      job.progressPercentage = 50;
      job.progressStage = "analyzing";
      job.progressDetail = "Analyzing code changes";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.progressPercentage).toBe(50);
      expect(reviewJobs.get(job.id)?.progressStage).toBe("analyzing");

      // Stage 3: Generating
      job.progressPercentage = 80;
      job.progressStage = "generating";
      job.progressDetail = "Generating review comments";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.progressPercentage).toBe(80);
      expect(reviewJobs.get(job.id)?.progressStage).toBe("generating");

      // Stage 4: Complete
      job.progressPercentage = 100;
      job.progressStage = "complete";
      job.progressDetail = "Review complete";
      job.status = "completed";
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)?.progressPercentage).toBe(100);
      expect(reviewJobs.get(job.id)?.progressStage).toBe("complete");
      expect(reviewJobs.get(job.id)?.status).toBe("completed");
    });

    it("should set progressPercentage, progressStage, and progressDetail on a running AnalysisJob", () => {
      const job: AnalysisJob = {
        id: "analysis-progress",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "running",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);

      // Update progress
      job.progressPercentage = 33;
      job.progressStage = "fetching_reviews";
      job.progressDetail = "Fetching historical reviews";
      analysisJobs.set(job.id, job);

      expect(analysisJobs.get(job.id)?.progressPercentage).toBe(33);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("fetching_reviews");
      expect(analysisJobs.get(job.id)?.progressDetail).toBe("Fetching historical reviews");
    });

    it("should track progress through stages on an AnalysisJob", () => {
      const job: AnalysisJob = {
        id: "analysis-stages",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "running",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);

      // Stage 1: Fetching reviews
      job.progressPercentage = 25;
      job.progressStage = "fetching_reviews";
      job.progressDetail = "Fetching review history";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("fetching_reviews");

      // Stage 2: Analyzing patterns
      job.progressPercentage = 50;
      job.progressStage = "analyzing_patterns";
      job.progressDetail = "Analyzing review patterns";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("analyzing_patterns");

      // Stage 3: Generating profile
      job.progressPercentage = 75;
      job.progressStage = "generating_profile";
      job.progressDetail = "Generating reviewer profile";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("generating_profile");

      // Stage 4: Complete
      job.progressPercentage = 100;
      job.progressStage = "completed";
      job.progressDetail = "Profile generation complete";
      job.status = "completed";
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)?.progressStage).toBe("completed");
      expect(analysisJobs.get(job.id)?.status).toBe("completed");
    });
  });

  describe("Job retrieval and listing", () => {
    it("should set ReviewJob in Map and verify get() retrieves it", () => {
      const job: ReviewJob = {
        id: "review-1",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);
      const retrieved = reviewJobs.get(job.id);

      expect(retrieved).toEqual(job);
      expect(reviewJobs.has(job.id)).toBe(true);
    });

    it("should set AnalysisJob in Map and verify get() retrieves it", () => {
      const job: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      analysisJobs.set(job.id, job);
      const retrieved = analysisJobs.get(job.id);

      expect(retrieved).toEqual(job);
      expect(analysisJobs.has(job.id)).toBe(true);
    });

    it("should list all ReviewJobs from Map using spread values()", () => {
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
        status: "running",
        createdAt: new Date(),
      };
      const job3: ReviewJob = {
        id: "review-3",
        repoId: "repo-3",
        prNumber: 3,
        status: "completed",
        createdAt: new Date(),
      };

      reviewJobs.set(job1.id, job1);
      reviewJobs.set(job2.id, job2);
      reviewJobs.set(job3.id, job3);

      const allJobs = [...reviewJobs.values()];
      expect(allJobs).toHaveLength(3);
      expect(allJobs.map((j) => j.id)).toEqual(["review-1", "review-2", "review-3"]);
    });

    it("should list all AnalysisJobs from Map using spread values()", () => {
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
        status: "running",
        createdAt: new Date(),
      };

      analysisJobs.set(job1.id, job1);
      analysisJobs.set(job2.id, job2);

      const allJobs = [...analysisJobs.values()];
      expect(allJobs).toHaveLength(2);
      expect(allJobs.map((j) => j.id)).toEqual(["analysis-1", "analysis-2"]);
    });

    it("should list jobs from both Maps", () => {
      const reviewJob: ReviewJob = {
        id: "review-1",
        repoId: "repo-1",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      };
      const analysisJob: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(reviewJob.id, reviewJob);
      analysisJobs.set(analysisJob.id, analysisJob);

      const allReviewJobs = [...reviewJobs.values()];
      const allAnalysisJobs = [...analysisJobs.values()];

      expect(allReviewJobs).toHaveLength(1);
      expect(allAnalysisJobs).toHaveLength(1);
      expect(allReviewJobs[0].id).toBe("review-1");
      expect(allAnalysisJobs[0].id).toBe("analysis-1");
    });
  });

  describe("Edge cases", () => {
    it("should overwrite duplicate job IDs in Map (ReviewJob)", () => {
      const job1: ReviewJob = {
        id: "review-duplicate",
        repoId: "repo-1",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      };

      const job2: ReviewJob = {
        id: "review-duplicate", // Same ID
        repoId: "repo-2",
        prNumber: 2,
        status: "running",
        createdAt: new Date(),
      };

      reviewJobs.set(job1.id, job1);
      expect(reviewJobs.get(job1.id)?.prNumber).toBe(1);

      reviewJobs.set(job2.id, job2);
      expect(reviewJobs.get(job2.id)?.prNumber).toBe(2); // Overwritten
      expect(reviewJobs.size).toBe(1); // Still only one entry
    });

    it("should overwrite duplicate job IDs in Map (AnalysisJob)", () => {
      const job1: AnalysisJob = {
        id: "analysis-duplicate",
        buddyId: "buddy-1",
        repo: "owner/repo1",
        status: "queued",
        createdAt: new Date(),
      };

      const job2: AnalysisJob = {
        id: "analysis-duplicate", // Same ID
        buddyId: "buddy-2",
        repo: "owner/repo2",
        status: "running",
        createdAt: new Date(),
      };

      analysisJobs.set(job1.id, job1);
      expect(analysisJobs.get(job1.id)?.repo).toBe("owner/repo1");

      analysisJobs.set(job2.id, job2);
      expect(analysisJobs.get(job2.id)?.repo).toBe("owner/repo2"); // Overwritten
      expect(analysisJobs.size).toBe(1); // Still only one entry
    });

    it("should accumulate error history with retryCount and errorHistory entries", () => {
      const job: ReviewJob = {
        id: "review-retries",
        repoId: "repo-123",
        prNumber: 42,
        status: "running",
        retryCount: 0,
        maxRetries: 3,
        errorHistory: [],
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);

      // First error
      const error1: ErrorEntry = {
        message: "Network timeout",
        timestamp: new Date(),
        attempt: 1,
      };
      job.error = "Network timeout";
      job.retryCount = 1;
      job.errorHistory = [error1];
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.retryCount).toBe(1);
      expect(reviewJobs.get(job.id)?.errorHistory).toHaveLength(1);
      expect(reviewJobs.get(job.id)?.errorHistory?.[0].message).toBe("Network timeout");

      // Second error
      const error2: ErrorEntry = {
        message: "API rate limit",
        timestamp: new Date(),
        attempt: 2,
      };
      job.error = "API rate limit";
      job.retryCount = 2;
      job.errorHistory?.push(error2);
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.retryCount).toBe(2);
      expect(reviewJobs.get(job.id)?.errorHistory).toHaveLength(2);
      expect(reviewJobs.get(job.id)?.errorHistory?.[1].message).toBe("API rate limit");
      expect(reviewJobs.get(job.id)?.errorHistory?.[1].attempt).toBe(2);

      // Third error - max retries reached
      const error3: ErrorEntry = {
        message: "API rate limit (final)",
        timestamp: new Date(),
        attempt: 3,
      };
      job.error = "API rate limit (final)";
      job.retryCount = 3;
      job.status = "failed";
      job.errorHistory?.push(error3);
      reviewJobs.set(job.id, job);

      expect(reviewJobs.get(job.id)?.retryCount).toBe(3);
      expect(reviewJobs.get(job.id)?.errorHistory).toHaveLength(3);
      expect(reviewJobs.get(job.id)?.status).toBe("failed");
    });

    it("should handle reviewHistory array operations", () => {
      expect(reviewHistory).toHaveLength(0);

      // Push entries
      reviewHistory.push({
        summary: "LGTM!",
        state: "approved",
        comments: [],
        buddyId: "buddy-1",
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "repo-1",
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
      });

      expect(reviewHistory).toHaveLength(1);

      reviewHistory.push({
        summary: "Needs changes",
        state: "changes_requested",
        comments: [],
        buddyId: "buddy-2",
        reviewedAt: new Date(),
        metadata: {
          prNumber: 2,
          repo: "repo-2",
          owner: "owner",
          reviewType: "high-context",
          llmModel: "claude-3",
          tokenUsage: {
            inputTokens: 200,
            outputTokens: 100,
            totalTokens: 300,
          },
          durationMs: 2000,
        },
      });

      expect(reviewHistory).toHaveLength(2);

      // Verify entries
      expect(reviewHistory[0].summary).toBe("LGTM!");
      expect(reviewHistory[1].summary).toBe("Needs changes");

      // Clear array
      reviewHistory.length = 0;
      expect(reviewHistory).toHaveLength(0);
    });

    it("should handle getting non-existent jobs", () => {
      expect(reviewJobs.get("non-existent")).toBeUndefined();
      expect(analysisJobs.get("non-existent")).toBeUndefined();
      expect(schedules.get("non-existent")).toBeUndefined();
    });

    it("should handle empty Maps", () => {
      expect(reviewJobs.size).toBe(0);
      expect(analysisJobs.size).toBe(0);
      expect(schedules.size).toBe(0);

      expect([...reviewJobs.values()]).toEqual([]);
      expect([...analysisJobs.values()]).toEqual([]);
      expect([...schedules.values()]).toEqual([]);
    });

    it("should handle deleting from Maps", () => {
      const job: ReviewJob = {
        id: "review-delete",
        repoId: "repo-123",
        prNumber: 42,
        status: "queued",
        createdAt: new Date(),
      };

      reviewJobs.set(job.id, job);
      expect(reviewJobs.has(job.id)).toBe(true);

      const deleted = reviewJobs.delete(job.id);
      expect(deleted).toBe(true);
      expect(reviewJobs.has(job.id)).toBe(false);
      expect(reviewJobs.get(job.id)).toBeUndefined();
    });

    it("should handle deleting non-existent entries from Maps", () => {
      const deleted = reviewJobs.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });
});
