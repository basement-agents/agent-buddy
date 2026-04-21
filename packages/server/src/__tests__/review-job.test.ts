/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetPR = vi.fn().mockResolvedValue({ number: 1, title: "Test PR" });
const mockGetPRDiff = vi.fn().mockResolvedValue("@@ -1,1 +1,2 @@\n-old\n+new");
const mockGetPRFiles = vi.fn().mockResolvedValue([{ filename: "src/index.ts" }]);
const mockPerformReview = vi.fn().mockResolvedValue({
  summary: "Looks good", state: "approved", comments: [],
  metadata: { llmModel: "claude-3", tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, durationMs: 1000 },
});
const mockFormatForGitHub = vi.fn().mockReturnValue({ body: "LGTM", event: "APPROVE", comments: [] });
const mockCreateReview = vi.fn().mockResolvedValue(undefined);
const mockSaveJob = vi.fn().mockResolvedValue(undefined);

vi.mock("@agent-buddy/core", () => ({
  GitHubClient: vi.fn().mockImplementation(function () {
    return { getPR: mockGetPR, getPRDiff: mockGetPRDiff, getPRFiles: mockGetPRFiles, createReview: mockCreateReview };
  }),
  BuddyFileSystemStorage: vi.fn().mockImplementation(function () {
    return { readProfile: vi.fn().mockResolvedValue({ username: "reviewer" }) };
  }),
  ReviewEngine: vi.fn().mockImplementation(function () {
    return { performReview: mockPerformReview, formatForGitHub: mockFormatForGitHub };
  }),
  AnthropicClaudeProvider: class {},
  createLLMProvider: vi.fn().mockReturnValue({}),
  Logger: class { error = vi.fn(); info = vi.fn(); warn = vi.fn(); },
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  calculateBackoffDelay: (attempt: number) => 1000 * Math.pow(2, attempt),
  loadConfig: vi.fn().mockResolvedValue({ repos: [{ id: "owner/repo", buddyId: "buddy-1" }], server: {} }),
}));

import { reviewJobs, reviewHistory } from "../jobs/state.js";

vi.mock("../jobs/persistence.js", () => ({
  saveJob: (...args: any[]) => mockSaveJob(...args),
}));

describe("Review Job Processor", () => {
  let processReviewJob: (jobId: string, repoId: string, prNumber: number, buddyId?: string, reviewType?: "low-context" | "high-context" | "auto") => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    reviewJobs.clear();
    reviewHistory.length = 0;

    const mod = await import("../jobs/review.js");
    processReviewJob = mod.processReviewJob;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("processReviewJob - success", () => {
    it("processes a successful review job", async () => {
      reviewJobs.set("job-1", {
        id: "job-1", repoId: "owner/repo", prNumber: 42, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "test-token";
      process.env.ANTHROPIC_API_KEY = "test-key";

      await processReviewJob("job-1", "owner/repo", 42, "buddy-1", "low-context");

      expect(reviewJobs.get("job-1")!.status).toBe("completed");
      expect(reviewJobs.get("job-1")!.progressPercentage).toBe(100);
      expect(reviewJobs.get("job-1")!.progressStage).toBe("completed");
      expect(mockPerformReview).toHaveBeenCalled();
      expect(mockCreateReview).toHaveBeenCalledWith("owner", "repo", 42, expect.any(Object));
      expect(reviewHistory.length).toBe(1);
    });

    it("initializes retry fields on first run", async () => {
      reviewJobs.set("job-2", {
        id: "job-2", repoId: "owner/repo", prNumber: 1, status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-2", "owner/repo", 1);

      const job = reviewJobs.get("job-2")!;
      expect(job.retryCount).toBe(0);
      expect(job.maxRetries).toBe(3);
      expect(job.errorHistory).toEqual([]);
    });
  });

  describe("processReviewJob - error handling", () => {
    it("handles missing API keys", async () => {
      reviewJobs.set("job-3", {
        id: "job-3", repoId: "owner/repo", prNumber: 1, status: "queued",
        retryCount: 0, maxRetries: 0, errorHistory: [], createdAt: new Date(),
      });

      delete process.env.GITHUB_TOKEN;
      delete process.env.ANTHROPIC_API_KEY;

      await processReviewJob("job-3", "owner/repo", 1);

      expect(reviewJobs.get("job-3")!.status).toBe("failed");
      expect(reviewJobs.get("job-3")!.error).toBe("Missing GITHUB_TOKEN");
    });

    it("handles LLM failure during review", async () => {
      mockPerformReview.mockRejectedValueOnce(new Error("ETIMEDOUT: LLM timeout"));

      reviewJobs.set("job-4", {
        id: "job-4", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-4", "owner/repo", 1, "buddy-1");

      const job = reviewJobs.get("job-4")!;
      expect(job.status).toBe("queued");
      expect(job.retryCount).toBe(1);
      expect(job.errorHistory).toHaveLength(1);
      expect(job.errorHistory![0].message).toBe("ETIMEDOUT: LLM timeout");
      expect(job.errorHistory![0].attempt).toBe(1);
    });

    it("handles GitHub API failure during PR fetch", async () => {
      mockGetPR.mockRejectedValueOnce(new Error("ECONNRESET: GitHub API connection reset"));

      reviewJobs.set("job-5", {
        id: "job-5", repoId: "owner/repo", prNumber: 999, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-5", "owner/repo", 999, "buddy-1");

      const job = reviewJobs.get("job-5")!;
      expect(job.status).toBe("queued");
      expect(job.retryCount).toBe(1);
      expect(job.error).toBe("ECONNRESET: GitHub API connection reset");
    });

    it("handles failure during review posting", async () => {
      mockCreateReview.mockRejectedValueOnce(new Error("503: GitHub API service unavailable"));

      reviewJobs.set("job-6", {
        id: "job-6", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-6", "owner/repo", 1, "buddy-1");

      const job = reviewJobs.get("job-6")!;
      expect(job.status).toBe("queued");
      expect(job.retryCount).toBe(1);
    });
  });

  describe("processReviewJob - retry logic", () => {
    it("permanently fails after max retries", async () => {
      mockPerformReview.mockRejectedValue(new Error("Persistent LLM error"));

      reviewJobs.set("job-7", {
        id: "job-7", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", retryCount: 1, maxRetries: 1,
        errorHistory: [{ message: "Previous error", timestamp: new Date(), attempt: 1 }],
        createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-7", "owner/repo", 1, "buddy-1");

      const job = reviewJobs.get("job-7")!;
      expect(job.status).toBe("failed");
      expect(job.errorHistory).toHaveLength(2);
      expect(job.progressStage).toBe("failed");
    });

    it("records error history across retries", async () => {
      mockPerformReview
        .mockRejectedValueOnce(new Error("ECONNREFUSED: Error 1"))
        .mockRejectedValueOnce(new Error("ETIMEDOUT: Error 2"))
        .mockResolvedValueOnce({
          summary: "OK", state: "approved", comments: [],
          metadata: { llmModel: "claude-3", tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, durationMs: 1000 },
        });

      reviewJobs.set("job-8", {
        id: "job-8", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", retryCount: 0, maxRetries: 3, errorHistory: [], createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-8", "owner/repo", 1, "buddy-1");

      const job = reviewJobs.get("job-8")!;
      expect(job.status).toBe("queued");
      expect(job.retryCount).toBe(1);
      expect(job.errorHistory).toHaveLength(1);
      expect(job.errorHistory![0].message).toBe("ECONNREFUSED: Error 1");
    });

    it("succeeds on final retry attempt", async () => {
      mockPerformReview.mockReset().mockResolvedValue({
        summary: "Fixed", state: "approved", comments: [],
        metadata: { llmModel: "claude-3", tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }, durationMs: 1000 },
      });

      reviewJobs.set("job-9", {
        id: "job-9", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", retryCount: 3, maxRetries: 3,
        errorHistory: [{ message: "Transient error", timestamp: new Date(), attempt: 3 }],
        createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-9", "owner/repo", 1, "buddy-1");

      expect(reviewJobs.get("job-9")!.status).toBe("completed");
    });
  });

  describe("processReviewJob - progress tracking", () => {
    it("updates progress percentage during execution", async () => {
      reviewJobs.set("job-10", {
        id: "job-10", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-10", "owner/repo", 1, "buddy-1");

      const job = reviewJobs.get("job-10")!;
      expect(job.progressPercentage).toBe(100);
      expect(job.progressStage).toBe("completed");
      expect(job.progressDetail).toBe("Review complete");
    });

    it("sets job status to running immediately when processReviewJob starts", async () => {
      reviewJobs.set("job-11", {
        id: "job-11", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      // Start processing but don't await
      const promise = processReviewJob("job-11", "owner/repo", 1, "buddy-1");

      // Job should be running immediately
      expect(reviewJobs.get("job-11")!.status).toBe("running");
      expect(reviewJobs.get("job-11")!.progressPercentage).toBe(0);
      expect(reviewJobs.get("job-11")!.progressStage).toBe("fetching_pr_data");

      await promise;
    });
  });

  describe("processReviewJob - exponential backoff", () => {
    it("uses exponential backoff for retry delays", async () => {
      const setTimeoutSpy = vi.spyOn(global, "setTimeout");

      mockPerformReview.mockRejectedValue(new Error("ECONNRESET: Transient error"));

      reviewJobs.set("job-12", {
        id: "job-12", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-12", "owner/repo", 1, "buddy-1");

      // First retry: 1000ms * 2^0 = 1000ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

      setTimeoutSpy.mockRestore();
    });

    it("calculates correct exponential backoff delays across multiple retries", async () => {
      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;

      const setTimeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation((fn, delay) => {
        if (typeof delay === "number") delays.push(delay);
        // Use original to avoid recursive mocking
        return originalSetTimeout(fn as any, delay as any) as unknown as NodeJS.Timeout;
      });

      mockPerformReview.mockRejectedValue(new Error("ETIMEDOUT: Persistent error"));

      reviewJobs.set("job-13", {
        id: "job-13", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      // Start processing
      await processReviewJob("job-13", "owner/repo", 1, "buddy-1");

      // Advance timers to trigger first retry
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      // Exponential backoff: 1000ms * 2^attempt
      // Attempt 0: 1000ms, Attempt 1: 2000ms, Attempt 2: 4000ms
      expect(delays).toEqual([1000, 2000, 4000]);

      setTimeoutSpy.mockRestore();
    });
  });

  describe("processReviewJob - job cancellation", () => {
    it("does not retry if job is cancelled before setTimeout fires", async () => {
      mockPerformReview.mockRejectedValue(new Error("ECONNREFUSED: Initial error"));

      reviewJobs.set("job-14", {
        id: "job-14", repoId: "owner/repo", prNumber: 1, buddyId: "buddy-1",
        status: "queued", createdAt: new Date(),
      });

      process.env.GITHUB_TOKEN = "t";
      process.env.ANTHROPIC_API_KEY = "k";

      await processReviewJob("job-14", "owner/repo", 1, "buddy-1");

      // Job is queued for retry
      expect(reviewJobs.get("job-14")!.status).toBe("queued");

      // Cancel the job
      reviewJobs.get("job-14")!.status = "cancelled";

      // Fast-forward past the retry delay
      await vi.advanceTimersByTimeAsync(2000);

      // Job should remain cancelled, not re-enter running state
      expect(reviewJobs.get("job-14")!.status).toBe("cancelled");
    });
  });
});
