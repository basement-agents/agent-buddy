/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Next } from "hono";

// Create hoisted mocks for dynamic control
const mockState = vi.hoisted(() => ({
  listBuddiesFn: vi.fn().mockResolvedValue([{ id: "buddy-1", name: "Test Buddy" }]),
  readProfileFn: vi.fn().mockResolvedValue({ id: "buddy-1", soul: "test soul", user: "test user" }),
  deleteBuddyFn: vi.fn().mockResolvedValue(undefined),
  exportProfileFn: vi.fn().mockResolvedValue('{"id":"buddy-1"}'),
  importProfileFn: vi.fn().mockResolvedValue("buddy-2"),
}));

// Mock the middleware at top level before imports
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (_c: unknown, next: Next) => next(),
}));

vi.mock("../middleware/rate-limit.js", () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: Next) => next(),
  reviewRateLimitMiddleware: () => async (_c: unknown, next: Next) => next(),
  getRateLimitStatus: () => ({
    totalEntries: 0,
    windowMs: 60000,
    publicLimit: 30,
    authenticatedLimit: 100,
  }),
}));

vi.mock("../middleware/request-id.js", () => ({
  requestIdMiddleware: () => async (_c: unknown, next: Next) => next(),
}));

vi.mock("../jobs/scheduler.js", () => ({
  initializeSchedules: () => {},
  cleanupSchedules: () => {},
}));

// Mock @agent-buddy/core
vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: class {
    listBuddies = mockState.listBuddiesFn;
    readProfile = mockState.readProfileFn;
    deleteBuddy = mockState.deleteBuddyFn;
    exportProfile = mockState.exportProfileFn;
    importProfile = mockState.importProfileFn;
  },
  recordFeedback: vi.fn().mockResolvedValue(undefined),
  getFeedbackSummary: vi.fn().mockResolvedValue({ helpful: 5, notHelpful: 1, patterns: ["good-pattern"] }),
  getRecentFeedback: vi.fn().mockResolvedValue([]),
  compareBuddies: vi.fn().mockReturnValue({
    score: 0.75,
    sharedKeywords: ["typescript", "testing"],
    sharedRepos: ["owner/repo"],
    soulOverlap: 0.8,
    analysis: {
      philosophySimilarity: 0.7,
      expertiseOverlap: 0.6,
      commonPatterns: ["I prefer clean code"],
    },
  }),
  Logger: class {
    error = vi.fn();
    info = vi.fn();
    warn = vi.fn();
  },
  loadConfig: vi.fn(),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

// Mock analysis jobs
vi.mock("../jobs/analysis.js", () => ({
  processAnalysisJob: vi.fn().mockResolvedValue(undefined),
  processUpdateJob: vi.fn().mockResolvedValue(undefined),
}));

// Mock job state
vi.mock("../jobs/state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jobs/state.js")>();
  return {
    ...actual,
    analysisJobs: new Map(),
    reviewJobs: new Map(),
    schedules: new Map(),
    reviewHistory: [],
  };
});

describe("Buddies Routes", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
    // Reset mock functions to default behavior
    mockState.readProfileFn.mockResolvedValue({ id: "buddy-1", soul: "test soul", user: "test user" });
    mockState.exportProfileFn.mockResolvedValue('{"id":"buddy-1"}');
  });

  afterEach(() => {
    // Restore environment variables
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    process.env.ANTHROPIC_API_KEY = originalEnv.ANTHROPIC_API_KEY;
  });

  it("GET /api/buddies returns buddy list (200)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies");
    expect(res.status).toBe(200);
    const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(1);
    expect(data.data[0]).toMatchObject({ id: "buddy-1", name: "Test Buddy" });
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.total).toBe(1);
    expect(data.totalPages).toBe(1);
  });

  it("GET /api/buddies supports pagination params", async () => {
    mockState.listBuddiesFn.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `buddy-${i}`, name: `Buddy ${i}` }))
    );
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies?page=2&limit=2");
    expect(res.status).toBe(200);
    const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
    expect(data.page).toBe(2);
    expect(data.limit).toBe(2);
    expect(data.total).toBe(5);
    expect(data.totalPages).toBe(3);
    expect(data.data).toHaveLength(2);
    expect(data.data[0]).toMatchObject({ id: "buddy-2" });
  });

  it("GET /api/buddies returns 400 for invalid page", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies?page=-1");
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("GET /api/buddies returns 400 for invalid limit", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies?limit=0");
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("GET /api/buddies/:id returns buddy profile (200)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: "buddy-1", soul: "test soul", user: "test user" });
  });

  it("GET /api/buddies/:id returns 404 for non-existent buddy", async () => {
    mockState.readProfileFn.mockResolvedValueOnce(null);

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/non-existent");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Buddy not found" });
  });

  it("POST /api/buddies creates analysis job (202)", async () => {
    // Set the environment variables
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const { createBuddiesRoutes } = await import("../routes/buddies.js");
    const buddiesApp = createBuddiesRoutes();

    const res = await buddiesApp.request("/api/buddies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", repo: "owner/repo", maxPrs: 10 }),
    });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toHaveProperty("jobId");
    expect((data as any).status).toBe("queued");
  });

  it("POST /api/buddies returns 500 when API keys missing", async () => {
    // Delete the environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;

    // Create a fresh module import by using a dynamic import with a cache bust
    // Since the module reads env vars at load time, we need to test the route handler behavior
    const { createBuddiesRoutes } = await import("../routes/buddies.js");
    const buddiesApp = createBuddiesRoutes();

    const res = await buddiesApp.request("/api/buddies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", repo: "owner/repo" }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toMatchObject({ error: "GITHUB_TOKEN and ANTHROPIC_API_KEY must be set" });
  });

  it("DELETE /api/buddies/:id removes buddy (200)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ deleted: "buddy-1" });
  });

  it("GET /api/buddies/:id/export exports profile (200)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/export");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ id: "buddy-1" });
  });

  it("GET /api/buddies/:id/export returns 500 on storage error", async () => {
    mockState.exportProfileFn.mockRejectedValueOnce(new Error("Export failed"));

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/export");
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("GET /api/buddies/:id/export returns 404 when buddy not found", async () => {
    mockState.exportProfileFn.mockRejectedValueOnce(new Error("Buddy buddy-1 not found"));

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/export");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("POST /api/buddies/import imports profile (201)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: '{"id":"buddy-1","name":"Test"}', newId: "buddy-2" }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({ imported: true, id: "buddy-2" });
  });

  it("GET /api/buddies/:id/status returns job status", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ status: "no_jobs" });
  });

  it("POST /api/buddies/:id/feedback records feedback (201)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: "review-1",
        commentId: "comment-1",
        wasHelpful: true,
        userResponse: "Great feedback!",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({ recorded: true });
  });

  it("GET /api/buddies/:id/feedback returns feedback summary", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/feedback");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("helpfulCount");
    expect(data).toHaveProperty("notHelpfulCount");
    expect(data).toHaveProperty("recentFeedback");
    expect((data as any).helpfulCount).toBe(5);
    expect((data as any).notHelpfulCount).toBe(1);
    expect(Array.isArray((data as any).recentFeedback)).toBe(true);
  });

  it("POST /api/buddies returns 400 for invalid repo format (no slash)", async () => {
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const { createBuddiesRoutes } = await import("../routes/buddies.js");
    const buddiesApp = createBuddiesRoutes();

    const res = await buddiesApp.request("/api/buddies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", repo: "invalidformat", maxPrs: 10 }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Invalid repo format. Use owner/repo" });
  });

  it("POST /api/buddies/:id/update creates update job (202)", async () => {
    process.env.GITHUB_TOKEN = "test-github-token";
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

    const { createBuddiesRoutes } = await import("../routes/buddies.js");
    const buddiesApp = createBuddiesRoutes();

    const res = await buddiesApp.request("/api/buddies/buddy-1/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "owner/repo" }),
    });
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data).toHaveProperty("jobId");
    expect((data as any).status).toBe("queued");
  });

  it("POST /api/buddies/:id/update returns 500 when API keys missing", async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;

    const { createBuddiesRoutes } = await import("../routes/buddies.js");
    const buddiesApp = createBuddiesRoutes();

    const res = await buddiesApp.request("/api/buddies/buddy-1/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "owner/repo" }),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Missing API keys" });
  });

  it("POST /api/buddies/import returns 400 for invalid profile JSON", async () => {
    mockState.importProfileFn.mockRejectedValueOnce(new Error("Invalid profile JSON"));

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: "not valid json", newId: "buddy-new" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty("error");
  });

  it("GET /api/buddies/:id/status returns job info when analysis job exists", async () => {
    const { analysisJobs } = await import("../jobs/state.js");
    (analysisJobs as Map<string, unknown>).set("job-abc", {
      id: "job-abc",
      buddyId: "buddy-1",
      repo: "owner/repo",
      status: "running",
      createdAt: new Date(),
      progress: 50,
      progressStage: "analyzing",
      progressPercentage: 50,
    });

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/status");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect((data as any).jobId).toBe("job-abc");
    expect((data as any).status).toBe("running");
    expect((data as any).progress).toBe(50);
  });

  it("GET /api/buddies/:id/compare/:otherId returns comparison result (200)", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/compare/buddy-2");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("score");
    expect(data).toHaveProperty("sharedKeywords");
    expect(data).toHaveProperty("sharedRepos");
    expect(data).toHaveProperty("soulOverlap");
    expect(data).toHaveProperty("analysis");
    expect((data as any).score).toBe(0.75);
    expect(Array.isArray((data as any).sharedKeywords)).toBe(true);
    expect(Array.isArray((data as any).sharedRepos)).toBe(true);
  });

  it("GET /api/buddies/:id/compare/:otherId returns 404 when first buddy doesn't exist", async () => {
    mockState.readProfileFn.mockResolvedValueOnce(null);

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/non-existent/compare/buddy-2");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Buddy not found: non-existent" });
  });

  it("GET /api/buddies/:id/compare/:otherId returns 404 when second buddy doesn't exist", async () => {
    mockState.readProfileFn
      .mockResolvedValueOnce({ id: "buddy-1", soul: "test soul", user: "test user" })
      .mockResolvedValueOnce(null);

    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/compare/non-existent");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Buddy not found: non-existent" });
  });

  it("GET /api/buddies/:id/compare/:otherId returns 400 when comparing buddy with itself", async () => {
    const { default: app } = await import("../index.js");
    const res = await app.request("/api/buddies/buddy-1/compare/buddy-1");
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toMatchObject({ error: "Cannot compare a buddy with itself" });
  });
});
