import { describe, it, expect, beforeEach } from "vitest";
import { reviewJobs, analysisJobs, schedules, reviewHistory } from "../jobs/state.js";
import type { ReviewJob, AnalysisJob } from "../jobs/state.js";

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

});
