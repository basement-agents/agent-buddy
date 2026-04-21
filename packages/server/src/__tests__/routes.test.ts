/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock("../lib/health-check.js", () => ({
  performHealthChecks: async () => ({
    anthropic: { status: "ok" },
  }),
}));

vi.mock("../middleware/rate-limit.js", () => ({
  rateLimitMiddleware: () => async (_c: any, next: () => Promise<void>) => next(),
  reviewRateLimitMiddleware: () => async (_c: any, next: () => Promise<void>) => next(),
  getRateLimitStatus: () => ({
    totalEntries: 0,
    windowMs: 60000,
    publicLimit: 30,
    authenticatedLimit: 100,
  }),
}));

vi.mock("../middleware/request-id.js", () => ({
  requestIdMiddleware: () => async (c: any, next: any) => next(),
}));

vi.mock("../jobs/scheduler.js", () => ({
  initializeSchedules: () => {},
  cleanupSchedules: () => {},
}));

vi.mock("@agent-buddy/core", async () => {
  const actual = await vi.importActual<typeof import("@agent-buddy/core")>("@agent-buddy/core");
  return {
    ...actual,
    loadConfig: vi.fn().mockResolvedValue({
      version: "1.0.0",
      repos: [],
      server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 },
    }),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    GitHubClient: vi.fn(),
    AnalysisPipeline: vi.fn(),
    ReviewEngine: vi.fn(),
    AnthropicClaudeProvider: vi.fn(),
    compareBuddies: vi.fn(),
    BuddyFileSystemStorage: vi.fn().mockImplementation(function () {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        readProfile: vi.fn().mockResolvedValue(null),
        writeProfile: vi.fn().mockResolvedValue(undefined),
        listBuddies: vi.fn().mockResolvedValue([]),
        deleteProfile: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock("../jobs/persistence.js", () => ({
  loadAllJobs: vi.fn().mockResolvedValue([]),
  cleanupCompletedJobs: vi.fn().mockResolvedValue(0),
  saveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../jobs/review.js", () => ({
  processReviewJob: vi.fn().mockResolvedValue(undefined),
}));

describe("Server Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should export default app", async () => {
    const mod = await import("../index.js");
    expect(mod.default).toBeDefined();
  });

  it("should have health endpoint", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json() as { status: string; dependencies: { anthropic: { status: string } } };
    expect(data.status).toBe("ok");
    expect(data.dependencies).toBeDefined();
    expect(data.dependencies.anthropic).toBeDefined();
    expect(data.dependencies.anthropic.status).toBe("ok");
  });

  it("should return 404 for unknown routes", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/unknown");
    expect(res.status).toBe(404);
  });

  it("should return repos list", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/repos");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it("should return buddies list", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it("should return reviews list with pagination", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/reviews");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.page).toBe(1);
    expect(data.totalPages).toBeGreaterThanOrEqual(1);
  });

  it("should return jobs list", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/jobs");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("should return 404 for non-existent job", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/jobs/non-existent-job-id");
    expect(res.status).toBe(404);
  });

  it("should return analytics data", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/analytics");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("reviewsLast7Days");
    expect(data).toHaveProperty("reviewsLast30Days");
    expect(data).toHaveProperty("perBuddyCounts");
    expect(data).toHaveProperty("perRepoCounts");
  });

  it("should return settings", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/settings");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("githubToken");
    expect(data).toHaveProperty("server");
    expect(data).toHaveProperty("review");
  });

  it("should update settings with PATCH", async () => {
    const { default: app } = await import("../index.js");
    const updateData = {
      review: {
        defaultSeverity: "warning",
        maxComments: 30,
        autoApproveBelow: true,
        reviewDelaySeconds: 5,
      },
    };
    const res = await app.request("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("githubToken");
    expect(data).toHaveProperty("review");
    expect(data.review.defaultSeverity).toBe("warning");
  });

  it("should return metrics data", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/metrics");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("totalReviews");
    expect(data).toHaveProperty("completedReviews");
    expect(data).toHaveProperty("errorCount");
    expect(data).toHaveProperty("errorRate");
    expect(data).toHaveProperty("averageDurationMs");
    expect(data).toHaveProperty("averageTokensPerReview");
    expect(data).toHaveProperty("perBuddy");
    expect(data).toHaveProperty("perRepo");
  });

  it("should return 400 for review trigger without required fields", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/reviews/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("should return 404 when cancelling non-existent job", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/jobs/non-existent-job-id/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
