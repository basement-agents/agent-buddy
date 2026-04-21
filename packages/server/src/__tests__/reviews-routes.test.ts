import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { CodeReview } from "@agent-buddy/core";

// Mock state module at top level before imports
vi.mock("../jobs/state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jobs/state.js")>();
  return {
    ...actual,
    reviewHistory: [],
    reviewJobs: new Map(),
    analysisJobs: new Map(),
  };
});

import { reviewHistory, reviewJobs, analysisJobs } from "../jobs/state.js";
import type { ReviewJob, AnalysisJob } from "../jobs/state.js";
import { createReviewsRoutes } from "../routes/reviews.js";

describe("Reviews Routes", () => {
  const mockReview1: CodeReview = {
    summary: "Add error handling for API calls",
    state: "changes_requested",
    comments: [
      {
        id: "1",
        path: "src/api.ts",
        line: 42,
        body: "Add try-catch for error handling",
        severity: "warning",
        category: "error-handling",
      },
    ],
    buddyId: "buddy-1",
    reviewedAt: new Date("2024-01-15T10:30:00Z"),
    metadata: {
      prNumber: 123,
      repo: "test-repo",
      owner: "test-owner",
      reviewType: "low-context",
      llmModel: "claude-3-opus",
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      durationMs: 5000,
    },
  };

  const mockReview2: CodeReview = {
    summary: "Improve type safety",
    state: "approved",
    comments: [
      {
        id: "2",
        path: "src/types.ts",
        line: 15,
        body: "Add stricter types",
        severity: "suggestion",
        category: "type-safety",
      },
    ],
    buddyId: "buddy-2",
    reviewedAt: new Date("2024-01-16T14:20:00Z"),
    metadata: {
      prNumber: 124,
      repo: "another-repo",
      owner: "test-owner",
      reviewType: "high-context",
      llmModel: "claude-3-opus",
      tokenUsage: { inputTokens: 2000, outputTokens: 800, totalTokens: 2800 },
      durationMs: 8000,
    },
  };

  const mockReview3: CodeReview = {
    summary: "Add tests for utils",
    state: "commented",
    comments: [
      {
        id: "3",
        path: "src/utils.ts",
        line: 30,
        body: "Consider adding unit tests",
        severity: "info",
        category: "testing",
      },
    ],
    buddyId: "buddy-1",
    reviewedAt: new Date("2024-01-17T09:00:00Z"),
    metadata: {
      prNumber: 125,
      repo: "test-repo",
      owner: "test-owner",
      reviewType: "low-context",
      llmModel: "claude-3-sonnet",
      tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      durationMs: 2000,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear arrays and maps
    reviewHistory.length = 0;
    reviewJobs.clear();
    analysisJobs.clear();
  });

  describe("GET /api/reviews", () => {
    it("should return empty list when no reviews", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews");

      expect(res.status).toBe(200);
      const data = await res.json() as { data: CodeReview[]; reviews: CodeReview[]; total: number; page: number; limit: number; totalPages: number };
      expect(data).toEqual({
        data: [],
        reviews: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it("should return all reviews", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(3);
      expect(data.reviews).toHaveLength(3);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });

    it("should filter by repo", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?repo=test-repo");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(2);
      expect(data.reviews).toHaveLength(2);
      expect(data.reviews[0].metadata.repo).toBe("test-repo");
      expect(data.reviews[1].metadata.repo).toBe("test-repo");
    });

    it("should filter by buddyId", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?buddy=buddy-1");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(2);
      expect(data.reviews).toHaveLength(2);
      expect(data.reviews[0].buddyId).toBe("buddy-1");
      expect(data.reviews[1].buddyId).toBe("buddy-1");
    });

    it("should filter by status", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?status=approved");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(1);
      expect(data.reviews[0].state).toBe("approved");
    });

    it("should support combined filters", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?repo=test-repo&buddy=buddy-1");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(2);
      expect(data.reviews.every((r: CodeReview) => r.metadata.repo === "test-repo" && r.buddyId === "buddy-1")).toBe(true);
    });

    it("should paginate results", async () => {
      // Add 5 reviews to test pagination
      for (let i = 0; i < 5; i++) {
        reviewHistory.push({
          ...mockReview1,
          metadata: { ...mockReview1.metadata, prNumber: 100 + i },
        });
      }
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?page=2&limit=2");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(5);
      expect(data.page).toBe(2);
      expect(data.limit).toBe(2);
      expect(data.reviews).toHaveLength(2);
    });

    it("should handle page beyond available data", async () => {
      reviewHistory.push(mockReview1);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?page=10&limit=20");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.reviews).toHaveLength(0);
      expect(data.total).toBe(1);
    });

    it("should use default page=1 and limit=20", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
    });

    it("should return 400 for invalid page parameter", async () => {
      reviewHistory.push(mockReview1);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?page=invalid");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Validation error");
    });

    it("should return 400 for invalid limit parameter", async () => {
      reviewHistory.push(mockReview1);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?limit=invalid");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Validation error");
    });

    it("should return 400 for negative page parameter", async () => {
      reviewHistory.push(mockReview1);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?page=-1");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Validation error");
    });

    it("should return 400 for zero limit parameter", async () => {
      reviewHistory.push(mockReview1);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?limit=0");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Validation error");
    });

    it("should filter by status with case sensitivity", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews?status=Approved");

      expect(res.status).toBe(200);
      const data = await res.json() as { reviews: CodeReview[]; total: number; page: number; limit: number };
      expect(data.total).toBe(0);
    });
  });

  describe("GET /api/jobs/:jobId", () => {
    it("should return review job from reviewJobs map", async () => {
      const mockJob: ReviewJob = {
        id: "job-123",
        repoId: "test-repo",
        prNumber: 42,
        buddyId: "buddy-1",
        reviewType: "low-context",
        status: "running",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      reviewJobs.set("job-123", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-123");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob | AnalysisJob;
      expect(data.id).toBe("job-123");
      expect(data.status).toBe("running");
    });

    it("should return analysis job from analysisJobs map", async () => {
      const mockJob: AnalysisJob = {
        id: "analysis-456",
        buddyId: "buddy-2",
        repo: "test-repo",
        status: "completed",
        createdAt: new Date("2024-01-15T11:00:00Z"),
      };
      analysisJobs.set("analysis-456", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/analysis-456");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob | AnalysisJob;
      expect(data.id).toBe("analysis-456");
      expect(data.status).toBe("completed");
    });

    it("should prefer reviewJobs over analysisJobs for same ID", async () => {
      const reviewJob: ReviewJob = {
        id: "job-789",
        repoId: "test-repo",
        prNumber: 42,
        status: "completed",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      const analysisJob: AnalysisJob = {
        id: "job-789",
        buddyId: "buddy-1",
        repo: "another-repo",
        status: "running",
        createdAt: new Date("2024-01-15T11:00:00Z"),
      };
      reviewJobs.set("job-789", reviewJob);
      analysisJobs.set("job-789", analysisJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-789");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob | AnalysisJob;
      expect(data.id).toBe("job-789");
      expect(data.status).toBe("completed"); // from reviewJob
    });

    it("should return 404 for unknown job", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/unknown-job");

      expect(res.status).toBe(404);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Job not found");
    });

    it("should return job with result", async () => {
      const mockJob: ReviewJob = {
        id: "job-result",
        repoId: "test-repo",
        prNumber: 42,
        buddyId: "buddy-1",
        reviewType: "high-context",
        status: "completed",
        result: mockReview1,
        createdAt: new Date("2024-01-15T10:00:00Z"),
        completedAt: new Date("2024-01-15T10:05:00Z"),
      };
      reviewJobs.set("job-result", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-result");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob;
      expect(data.result).toBeDefined();
      if (data.result) {
        expect(data.result.summary).toBe("Add error handling for API calls");
      }
    });

    it("should return job with error", async () => {
      const mockJob: ReviewJob = {
        id: "job-error",
        repoId: "test-repo",
        prNumber: 42,
        status: "failed",
        error: "API rate limit exceeded",
        createdAt: new Date("2024-01-15T10:00:00Z"),
        completedAt: new Date("2024-01-15T10:02:00Z"),
      };
      reviewJobs.set("job-error", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-error");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob;
      expect(data.error).toBe("API rate limit exceeded");
    });

    it("should return job with progress information", async () => {
      const mockJob: ReviewJob = {
        id: "job-progress",
        repoId: "test-repo",
        prNumber: 42,
        buddyId: "buddy-1",
        reviewType: "low-context",
        status: "running",
        progressPercentage: 65,
        progressStage: "analyzing",
        progressDetail: "Processing file 15 of 23",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      reviewJobs.set("job-progress", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-progress");

      expect(res.status).toBe(200);
      const data = await res.json() as ReviewJob;
      expect(data.progressPercentage).toBe(65);
      expect(data.progressStage).toBe("analyzing");
      expect(data.progressDetail).toBe("Processing file 15 of 23");
    });

    it("should return analysis job with progress", async () => {
      const mockJob: AnalysisJob = {
        id: "analysis-progress",
        buddyId: "buddy-1",
        repo: "test-repo",
        status: "running",
        progressStage: "analyzing_patterns",
        progressPercentage: 45,
        progressDetail: "Analyzing review patterns",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      analysisJobs.set("analysis-progress", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/analysis-progress");

      expect(res.status).toBe(200);
      const data = await res.json() as AnalysisJob;
      expect(data.progressStage).toBe("analyzing_patterns");
      expect(data.progressPercentage).toBe(45);
    });
  });

  describe("GET /api/jobs/:jobId/progress", () => {
    it("should return SSE stream for review job", async () => {
      const mockJob: ReviewJob = {
        id: "job-sse",
        repoId: "test-repo",
        prNumber: 42,
        status: "running",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      reviewJobs.set("job-sse", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-sse/progress");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
      expect(res.headers.get("Connection")).toBe("keep-alive");
    });

    it("should return SSE stream for analysis job", async () => {
      const mockJob: AnalysisJob = {
        id: "analysis-sse",
        buddyId: "buddy-1",
        repo: "test-repo",
        status: "running",
        createdAt: new Date("2024-01-15T10:00:00Z"),
      };
      analysisJobs.set("analysis-sse", mockJob);

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/analysis-sse/progress");

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("should return 404 for unknown job on progress endpoint", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/unknown-job/progress");

      expect(res.status).toBe(404);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Job not found");
    });
  });

  describe("POST /api/reviews/trigger", () => {
    it("should create a new review job with valid parameters", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.1",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 123,
          buddyId: "buddy-1",
          reviewType: "low-context",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as {
        success: boolean;
        jobId: string;
        message: string;
      };
      expect(data.success).toBe(true);
      expect(data.jobId).toBeDefined();
      expect(data.message).toBe("Review job created successfully");

      // Verify job was stored
      expect(reviewJobs.has(data.jobId)).toBe(true);
      const job = reviewJobs.get(data.jobId);
      expect(job?.repoId).toBe("test-repo");
      expect(job?.prNumber).toBe(123);
      expect(job?.buddyId).toBe("buddy-1");
      expect(job?.status).toBe("queued");
    });

    it("should default reviewType to low-context when not provided", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.2",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 456,
          buddyId: "buddy-2",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { jobId: string };
      const job = reviewJobs.get(data.jobId);
      expect(job?.reviewType).toBe("low-context");
    });

    it("should return 400 when repoId is missing", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.3",
        },
        body: JSON.stringify({
          prNumber: 123,
          buddyId: "buddy-1",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when prNumber is missing", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.4",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          buddyId: "buddy-1",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when buddyId is missing", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.5",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 123,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 when request body is invalid JSON", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.6",
        },
        body: "invalid json",
      });

      expect(res.status).toBe(400);
    });

    it("should accept high-context review type", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.7",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 789,
          buddyId: "buddy-3",
          reviewType: "high-context",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { jobId: string };
      const job = reviewJobs.get(data.jobId);
      expect(job?.reviewType).toBe("high-context");
    });

    it("should generate unique job IDs for each request", async () => {
      const app = createReviewsRoutes();
      const res1 = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.8",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 100,
          buddyId: "buddy-1",
        }),
      });

      const res2 = await app.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.50.9",
        },
        body: JSON.stringify({
          repoId: "test-repo",
          prNumber: 101,
          buddyId: "buddy-1",
        }),
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const data1 = await res1.json() as { jobId: string };
      const data2 = await res2.json() as { jobId: string };

      expect(data1.jobId).not.toBe(data2.jobId);
    });
  });

  describe("Review trigger rate limiting", () => {
    it("should enforce 10 requests per hour limit for review triggers", async () => {
      // Import the actual rate limiter
      const { reviewRateLimitMiddleware } = await import("../middleware/rate-limit.js");

      // Create a test app with real rate limiting
      const testApp = new Hono();
      testApp.use("/api/reviews/trigger", reviewRateLimitMiddleware());
      testApp.post("/api/reviews/trigger", async (c) => {
        await c.req.json();
        const jobId = `review-${Date.now()}`;
        return c.json({ success: true, jobId });
      });

      const ip = "192.168.100.1";

      // Make 10 successful requests (at the limit)
      const successfulRequests = [];
      for (let i = 0; i < 10; i++) {
        successfulRequests.push(
          testApp.request("/api/reviews/trigger", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": ip,
            },
            body: JSON.stringify({ repoId: "test", prNumber: i, buddyId: "buddy-1" }),
          })
        );
      }

      const successfulResponses = await Promise.all(successfulRequests);
      for (const res of successfulResponses) {
        expect(res.status).toBe(200);
      }

      // 11th request should be rate limited
      const rateLimitedRes = await testApp.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ repoId: "test", prNumber: 10, buddyId: "buddy-1" }),
      });

      expect(rateLimitedRes.status).toBe(429);
      const data = await rateLimitedRes.json() as {
        error: string;
        retryAfter: number;
      };
      expect(data.error).toBe("Rate limit exceeded");
      expect(data.retryAfter).toBeDefined();
      expect(typeof data.retryAfter).toBe("number");
      expect(data.retryAfter).toBeGreaterThan(0);
    });

    it("should set Retry-After header when rate limit exceeded", async () => {
      const { reviewRateLimitMiddleware } = await import("../middleware/rate-limit.js");

      const testApp = new Hono();
      testApp.use("/api/reviews/trigger", reviewRateLimitMiddleware());
      testApp.post("/api/reviews/trigger", async (c) => {
        return c.json({ success: true });
      });

      const ip = "192.168.100.2";

      // Make 11 requests to exceed limit
      const requests = [];
      for (let i = 0; i < 11; i++) {
        requests.push(
          testApp.request("/api/reviews/trigger", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": ip,
            },
            body: JSON.stringify({ repoId: "test", prNumber: i, buddyId: "buddy-1" }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses[10];

      expect(rateLimitedResponse.status).toBe(429);
      const retryAfter = rateLimitedResponse.headers.get("Retry-After");
      expect(retryAfter).not.toBeNull();
      const retryAfterSeconds = parseInt(retryAfter!, 10);
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(3600); // Max 1 hour
    });

    it("should track rate limits independently per IP", async () => {
      const { reviewRateLimitMiddleware } = await import("../middleware/rate-limit.js");

      const testApp = new Hono();
      testApp.use("/api/reviews/trigger", reviewRateLimitMiddleware());
      testApp.post("/api/reviews/trigger", async (c) => {
        return c.json({ success: true });
      });

      // IP1 makes 10 requests (at limit)
      const ip1Requests = [];
      for (let i = 0; i < 10; i++) {
        ip1Requests.push(
          testApp.request("/api/reviews/trigger", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-forwarded-for": "192.168.100.3",
            },
            body: JSON.stringify({ repoId: "test", prNumber: i, buddyId: "buddy-1" }),
          })
        );
      }

      const ip1Responses = await Promise.all(ip1Requests);
      for (const res of ip1Responses) {
        expect(res.status).toBe(200);
      }

      // IP2 should still be able to make requests
      const ip2Response = await testApp.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "192.168.100.4",
        },
        body: JSON.stringify({ repoId: "test", prNumber: 100, buddyId: "buddy-1" }),
      });

      expect(ip2Response.status).toBe(200);
    });

    it("should set X-RateLimit headers on successful requests", async () => {
      const { reviewRateLimitMiddleware } = await import("../middleware/rate-limit.js");

      const testApp = new Hono();
      testApp.use("/api/reviews/trigger", reviewRateLimitMiddleware());
      testApp.post("/api/reviews/trigger", async (c) => {
        return c.json({ success: true });
      });

      const ip = "192.168.100.8";

      const res = await testApp.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ repoId: "test", prNumber: 1, buddyId: "buddy-1" }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
      expect(res.headers.get("X-RateLimit-Reset")).not.toBeNull();
    });

    it("should decrement X-RateLimit-Remaining with each request", async () => {
      const { reviewRateLimitMiddleware } = await import("../middleware/rate-limit.js");

      const testApp = new Hono();
      testApp.use("/api/reviews/trigger", reviewRateLimitMiddleware());
      testApp.post("/api/reviews/trigger", async (c) => {
        return c.json({ success: true });
      });

      const ip = "192.168.100.9";

      const res1 = await testApp.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ repoId: "test", prNumber: 1, buddyId: "buddy-1" }),
      });

      const res2 = await testApp.request("/api/reviews/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ip,
        },
        body: JSON.stringify({ repoId: "test", prNumber: 2, buddyId: "buddy-1" }),
      });

      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("9");
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("8");
    });
  });

  describe("GET /api/analytics", () => {
    it("should return zero counts for empty reviewHistory", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.totalReviews).toBe(0);
      expect(data.reviewsLast7Days).toBe(0);
      expect(data.reviewsLast30Days).toBe(0);
      expect(data.averageTurnaroundTimeMs).toBe(0);
      expect(data.averageTurnaroundTimeSeconds).toBe(0);
      expect(data.perBuddyCounts).toEqual({});
      expect(data.perRepoCounts).toEqual({});
      expect(data.reviewStates).toEqual({});
    });

    it("should count reviews from last 7 days", async () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      reviewHistory.push(
        { ...mockReview1, reviewedAt: threeDaysAgo },
        { ...mockReview2, reviewedAt: threeDaysAgo },
        { ...mockReview3, reviewedAt: tenDaysAgo },
      );

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.reviewsLast7Days).toBe(2);
      expect(data.reviewsLast30Days).toBe(3);
      expect(data.totalReviews).toBe(3);
    });

    it("should count reviews from last 30 days", async () => {
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);

      reviewHistory.push(
        { ...mockReview1, reviewedAt: fiveDaysAgo },
        { ...mockReview2, reviewedAt: fortyDaysAgo },
      );

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.reviewsLast7Days).toBe(1);
      expect(data.reviewsLast30Days).toBe(1);
      expect(data.totalReviews).toBe(2);
    });

    it("should calculate average turnaround time", async () => {
      reviewHistory.push(
        { ...mockReview1, metadata: { ...mockReview1.metadata, durationMs: 4000 } },
        { ...mockReview2, metadata: { ...mockReview2.metadata, durationMs: 8000 } },
      );

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.averageTurnaroundTimeMs).toBe(6000);
      expect(data.averageTurnaroundTimeSeconds).toBe(6);
    });

    it("should group reviews by buddyId in perBuddyCounts", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      const perBuddy = data.perBuddyCounts as Record<string, number>;
      expect(perBuddy["buddy-1"]).toBe(2);
      expect(perBuddy["buddy-2"]).toBe(1);
    });

    it("should group reviews by owner/repo in perRepoCounts", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      const perRepo = data.perRepoCounts as Record<string, number>;
      expect(perRepo["test-owner/test-repo"]).toBe(2);
      expect(perRepo["test-owner/another-repo"]).toBe(1);
    });

    it("should count reviews by state in reviewStates", async () => {
      reviewHistory.push(mockReview1, mockReview2, mockReview3);

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      const states = data.reviewStates as Record<string, number>;
      expect(states["changes_requested"]).toBe(1);
      expect(states["approved"]).toBe(1);
      expect(states["commented"]).toBe(1);
    });

    it("should return totalReviews equal to reviewHistory length", async () => {
      for (let i = 0; i < 5; i++) {
        reviewHistory.push({ ...mockReview1, metadata: { ...mockReview1.metadata, prNumber: 200 + i } });
      }

      const app = createReviewsRoutes();
      const res = await app.request("/api/analytics");

      expect(res.status).toBe(200);
      const data = await res.json() as Record<string, unknown>;
      expect(data.totalReviews).toBe(5);
    });
  });

  describe("GET /api/jobs", () => {
    it("should return empty paginated list when no jobs", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs");

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(0);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(data.totalPages).toBe(1);
    });

    it("should return merged jobs sorted by createdAt desc", async () => {
      reviewJobs.set("review-1", {
        id: "review-1", repoId: "r1", prNumber: 1, buddyId: "b1",
        status: "completed", createdAt: new Date("2024-01-15T10:00:00Z"),
      });
      analysisJobs.set("analysis-1", {
        id: "analysis-1", buddyId: "b2", repo: "r2",
        status: "running", createdAt: new Date("2024-01-16T10:00:00Z"),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs");

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as { data: any[]; total: number };
      expect(data.total).toBe(2);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].id).toBe("analysis-1");
      expect(data.data[1].id).toBe("review-1");
    });

    it("should support pagination for jobs", async () => {
      for (let i = 0; i < 5; i++) {
        reviewJobs.set(`job-${i}`, {
          id: `job-${i}`, repoId: "r1", prNumber: i, buddyId: "b1",
          status: "completed", createdAt: new Date(`2024-01-${10 + i}T10:00:00Z`),
        });
      }

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs?page=2&limit=2");

      expect(res.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
      expect(data.page).toBe(2);
      expect(data.limit).toBe(2);
      expect(data.total).toBe(5);
      expect(data.totalPages).toBe(3);
      expect(data.data).toHaveLength(2);
    });

    it("should return 400 for invalid page on jobs", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs?page=-1");
      expect(res.status).toBe(400);
    });

    it("should include type field on each job", async () => {
      reviewJobs.set("rj-1", {
        id: "rj-1", repoId: "r1", prNumber: 1, buddyId: "b1",
        status: "completed", createdAt: new Date("2024-01-15T10:00:00Z"),
      });
      analysisJobs.set("aj-1", {
        id: "aj-1", buddyId: "b2", repo: "r2",
        status: "running", createdAt: new Date("2024-01-16T10:00:00Z"),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs");

      expect(res.status).toBe(200);
      const data = await res.json() as { data: { id: string; type: string }[] };
      const reviewJob = data.data.find((j) => j.id === "rj-1");
      const analysisJob = data.data.find((j) => j.id === "aj-1");
      expect(reviewJob?.type).toBe("review");
      expect(analysisJob?.type).toBe("analysis");
    });
  });

  describe("POST /api/jobs/:jobId/cancel", () => {
    it("should cancel a queued review job", async () => {
      reviewJobs.set("job-queued", {
        id: "job-queued",
        repoId: "owner/repo",
        prNumber: 1,
        status: "queued",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-queued/cancel", { method: "POST" });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; jobId: string; status: string };
      expect(data.success).toBe(true);
      expect(data.status).toBe("cancelled");
      expect(reviewJobs.get("job-queued")?.status).toBe("cancelled");
    });

    it("should cancel a running review job", async () => {
      reviewJobs.set("job-running", {
        id: "job-running",
        repoId: "owner/repo",
        prNumber: 2,
        status: "running",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-running/cancel", { method: "POST" });

      expect(res.status).toBe(200);
      const data = await res.json() as { status: string };
      expect(data.status).toBe("cancelled");
    });

    it("should cancel a queued analysis job", async () => {
      analysisJobs.set("analysis-queued", {
        id: "analysis-queued",
        buddyId: "buddy-1",
        repo: "owner/repo",
        status: "queued",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/analysis-queued/cancel", { method: "POST" });

      expect(res.status).toBe(200);
      const data = await res.json() as { success: boolean; status: string };
      expect(data.success).toBe(true);
      expect(data.status).toBe("cancelled");
    });

    it("should return 400 for completed job", async () => {
      reviewJobs.set("job-done", {
        id: "job-done",
        repoId: "owner/repo",
        prNumber: 3,
        status: "completed",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-done/cancel", { method: "POST" });

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain("Cannot cancel");
    });

    it("should return 400 for failed job", async () => {
      reviewJobs.set("job-failed", {
        id: "job-failed",
        repoId: "owner/repo",
        prNumber: 4,
        status: "failed",
        error: "timeout",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-failed/cancel", { method: "POST" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for already cancelled job", async () => {
      reviewJobs.set("job-cancelled", {
        id: "job-cancelled",
        repoId: "owner/repo",
        prNumber: 5,
        status: "cancelled",
        createdAt: new Date(),
      });

      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/job-cancelled/cancel", { method: "POST" });

      expect(res.status).toBe(400);
    });

    it("should return 404 for unknown job", async () => {
      const app = createReviewsRoutes();
      const res = await app.request("/api/jobs/nonexistent/cancel", { method: "POST" });

      expect(res.status).toBe(404);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Job not found");
    });
  });
});
