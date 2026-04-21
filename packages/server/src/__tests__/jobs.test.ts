import { describe, it, expect, beforeEach } from "vitest";
import { reviewJobs, analysisJobs } from "../jobs/state.js";
import type { ReviewJob, AnalysisJob } from "../jobs/state.js";

describe("Job State Management", () => {
  beforeEach(() => {
    reviewJobs.clear();
    analysisJobs.clear();
  });

  describe("ReviewJob", () => {
    it("should create and store a review job", () => {
      const job: ReviewJob = {
        id: "review-1",
        repoId: "owner/repo",
        prNumber: 123,
        buddyId: "buddy-1",
        status: "queued",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      expect(reviewJobs.get(job.id)).toEqual(job);
    });

    it("should update review job status", () => {
      const job: ReviewJob = {
        id: "review-2",
        repoId: "owner/repo",
        prNumber: 456,
        status: "queued",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      job.status = "running";
      job.progressPercentage = 50;
      job.progressStage = "analyzing_code";
      reviewJobs.set(job.id, job);
      const updated = reviewJobs.get(job.id);
      expect(updated?.status).toBe("running");
      expect(updated?.progressPercentage).toBe(50);
      expect(updated?.progressStage).toBe("analyzing_code");
    });

    it("should complete review job with result", () => {
      const job: ReviewJob = {
        id: "review-3",
        repoId: "owner/repo",
        prNumber: 789,
        status: "running",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      job.status = "completed";
      job.completedAt = new Date();
      job.result = {
        summary: "LGTM",
        state: "approved",
        comments: [],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 789,
          repo: "repo",
          owner: "owner",
          reviewType: "low-context",
          llmModel: "claude-3-5-sonnet",
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
          },
          durationMs: 5000,
        },
      };
      reviewJobs.set(job.id, job);
      const completed = reviewJobs.get(job.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.result).toBeDefined();
      expect(completed?.result?.summary).toBe("LGTM");
      expect(completed?.completedAt).toBeDefined();
    });

    it("should fail review job with error", () => {
      const job: ReviewJob = {
        id: "review-4",
        repoId: "owner/repo",
        prNumber: 101,
        status: "running",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      job.status = "failed";
      job.error = "GitHub API error";
      job.completedAt = new Date();
      job.progressStage = "failed";
      reviewJobs.set(job.id, job);
      const failed = reviewJobs.get(job.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("GitHub API error");
      expect(failed?.progressStage).toBe("failed");
    });

    it("should track progress details", () => {
      const job: ReviewJob = {
        id: "review-5",
        repoId: "owner/repo",
        prNumber: 202,
        status: "running",
        progressPercentage: 25,
        progressStage: "fetching_pr_data",
        progressDetail: "Fetching PR diff...",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      const withProgress = reviewJobs.get(job.id);
      expect(withProgress?.progressPercentage).toBe(25);
      expect(withProgress?.progressStage).toBe("fetching_pr_data");
      expect(withProgress?.progressDetail).toBe("Fetching PR diff...");
    });
  });

  describe("AnalysisJob", () => {
    it("should create and store an analysis job", () => {
      const job: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };
      analysisJobs.set(job.id, job);
      expect(analysisJobs.get(job.id)).toEqual(job);
    });

    it("should update analysis job progress", () => {
      const job: AnalysisJob = {
        id: "analysis-2",
        buddyId: "buddy-2",
        repo: "owner/repo",
        status: "running",
        progress: "Fetching reviews...",
        progressStage: "fetching_reviews",
        progressPercentage: 30,
        progressDetail: "Fetching PRs reviewed by user...",
        createdAt: new Date(),
      };
      analysisJobs.set(job.id, job);
      const updated = analysisJobs.get(job.id);
      expect(updated?.status).toBe("running");
      expect(updated?.progress).toBe("Fetching reviews...");
      expect(updated?.progressStage).toBe("fetching_reviews");
      expect(updated?.progressPercentage).toBe(30);
      expect(updated?.progressDetail).toBe("Fetching PRs reviewed by user...");
    });

    it("should complete analysis job", () => {
      const job: AnalysisJob = {
        id: "analysis-3",
        buddyId: "buddy-3",
        repo: "owner/repo",
        status: "running",
        createdAt: new Date(),
      };
      analysisJobs.set(job.id, job);
      job.status = "completed";
      job.progressStage = "completed";
      job.progressPercentage = 100;
      job.progress = "Done";
      job.progressDetail = "Buddy profile created successfully";
      job.completedAt = new Date();
      analysisJobs.set(job.id, job);
      const completed = analysisJobs.get(job.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.progressStage).toBe("completed");
      expect(completed?.progressPercentage).toBe(100);
      expect(completed?.completedAt).toBeDefined();
    });

    it("should fail analysis job with error", () => {
      const job: AnalysisJob = {
        id: "analysis-4",
        buddyId: "buddy-4",
        repo: "owner/repo",
        status: "running",
        createdAt: new Date(),
      };
      analysisJobs.set(job.id, job);
      job.status = "failed";
      job.error = "No reviews found for this user";
      job.progressStage = "failed";
      job.progressDetail = "Failed: No reviews found";
      job.completedAt = new Date();
      analysisJobs.set(job.id, job);
      const failed = analysisJobs.get(job.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe("No reviews found for this user");
      expect(failed?.progressStage).toBe("failed");
      expect(failed?.progressDetail).toBe("Failed: No reviews found");
    });

    it("should handle all progress stages", () => {
      const stages: Array<AnalysisJob["progressStage"]> = [
        "fetching_reviews",
        "analyzing_patterns",
        "generating_profile",
        "completed",
        "failed",
      ];
      stages.forEach((stage) => {
        const job: AnalysisJob = {
          id: `analysis-${stage}`,
          buddyId: "buddy-test",
          repo: "owner/repo",
          status: "running",
          progressStage: stage,
          createdAt: new Date(),
        };
        analysisJobs.set(job.id, job);
        expect(analysisJobs.get(job.id)?.progressStage).toBe(stage);
      });
    });
  });

  describe("Job Store Operations", () => {
    it("should list all review jobs", () => {
      const job1: ReviewJob = {
        id: "review-1",
        repoId: "owner/repo",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      };
      const job2: ReviewJob = {
        id: "review-2",
        repoId: "owner/repo",
        prNumber: 2,
        status: "completed",
        createdAt: new Date(),
      };
      reviewJobs.set(job1.id, job1);
      reviewJobs.set(job2.id, job2);
      expect(reviewJobs.size).toBe(2);
      expect(Array.from(reviewJobs.values())).toHaveLength(2);
    });

    it("should list all analysis jobs", () => {
      const job1: AnalysisJob = {
        id: "analysis-1",
        buddyId: "buddy-1",
        repo: "owner/repo",
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
      expect(analysisJobs.size).toBe(2);
      expect(Array.from(analysisJobs.values())).toHaveLength(2);
    });

    it("should delete review job", () => {
      const job: ReviewJob = {
        id: "review-delete",
        repoId: "owner/repo",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      };
      reviewJobs.set(job.id, job);
      expect(reviewJobs.has(job.id)).toBe(true);
      reviewJobs.delete(job.id);
      expect(reviewJobs.has(job.id)).toBe(false);
    });

    it("should delete analysis job", () => {
      const job: AnalysisJob = {
        id: "analysis-delete",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      };
      analysisJobs.set(job.id, job);
      expect(analysisJobs.has(job.id)).toBe(true);
      analysisJobs.delete(job.id);
      expect(analysisJobs.has(job.id)).toBe(false);
    });

    it("should filter jobs by status", () => {
      const jobs: ReviewJob[] = [
        {
          id: "review-1",
          repoId: "owner/repo",
          prNumber: 1,
          status: "queued",
          createdAt: new Date(),
        },
        {
          id: "review-2",
          repoId: "owner/repo",
          prNumber: 2,
          status: "running",
          createdAt: new Date(),
        },
        {
          id: "review-3",
          repoId: "owner/repo",
          prNumber: 3,
          status: "queued",
          createdAt: new Date(),
        },
      ];
      jobs.forEach((job) => reviewJobs.set(job.id, job));
      const queuedJobs = Array.from(reviewJobs.values()).filter((j) => j.status === "queued");
      expect(queuedJobs).toHaveLength(2);
    });
  });
});
