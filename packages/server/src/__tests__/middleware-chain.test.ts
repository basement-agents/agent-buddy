import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../jobs/scheduler.js", () => ({
  initializeSchedules: () => {},
  cleanupSchedules: () => {},
  checkForOpenPRs: () => {},
}));

vi.mock("../jobs/analysis.js", () => ({
  processAnalysisJob: () => {},
  processUpdateJob: () => {},
}));

vi.mock("../jobs/review.js", () => ({
  processReviewJob: () => {},
}));

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn(async () => ({
    server: { apiKey: "test-api-key" },
    repos: [],
  })),
  saveConfig: vi.fn(),
  listRepos: vi.fn(async () => []),
  BuddyFileSystemStorage: class {
    listBuddies() { return Promise.resolve([]); }
    readProfile() { return Promise.resolve(null); }
    writeProfile() { return Promise.resolve(); }
    deleteBuddy() { return Promise.resolve(); }
    exportProfile() { return Promise.resolve("{}"); }
    addMemoryEntry() { return Promise.resolve(); }
  },
  recordFeedback: vi.fn(),
  getFeedbackSummary: vi.fn(async () => ({ helpful: 0, notHelpful: 0 })),
  getRecentFeedback: vi.fn(async () => []),
  GitHubClient: vi.fn(),
  AnalysisPipeline: vi.fn(),
  AnthropicClaudeProvider: vi.fn(),
  Logger: class {
    info() {}
    error() {}
    warn() {}
  },
}));

describe("Server middleware chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies all routes are properly mounted under /api prefix", async () => {
    const { default: app } = await import("../index.js");

    const endpoints = [
      "/api/health",
      "/api/repos",
      "/api/buddies",
      "/api/reviews",
      "/api/settings",
    ];

    for (const endpoint of endpoints) {
      const res = await app.request(endpoint, {
        headers: { "x-api-key": "test-api-key" },
      });
      expect(res.status).toBe(200);
    }
  });

  it("verifies auth middleware is applied to protected routes", async () => {
    const { default: app } = await import("../index.js");
    const { loadConfig } = await import("@agent-buddy/core");

    vi.mocked(loadConfig).mockResolvedValue({
      server: { apiKey: "test-secret-key" },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const noKey = await app.request("/api/repos");
    expect(noKey.status).toBe(401);

    const wrongKey = await app.request("/api/repos", {
      headers: { "x-api-key": "wrong-key" },
    });
    expect(wrongKey.status).toBe(403);

    const correctKey = await app.request("/api/repos", {
      headers: { "x-api-key": "test-secret-key" },
    });
    expect(correctKey.status).toBe(200);

    vi.mocked(loadConfig).mockResolvedValue({
      server: { apiKey: undefined },
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("verifies rate limit middleware is applied to public routes", async () => {
    const { default: app } = await import("../index.js");

    const res = await app.request("/api/health");

    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();

    const limit = parseInt(res.headers.get("X-RateLimit-Limit")!, 10);
    expect(limit).toBeGreaterThan(0);
  });

  it("verifies request-id middleware adds X-Request-Id header", async () => {
    const { default: app } = await import("../index.js");

    const res = await app.request("/api/health");

    const requestId = res.headers.get("X-Request-Id");
    expect(requestId).toBeTruthy();
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("verifies security headers are present on responses", async () => {
    const { default: app } = await import("../index.js");

    const res = await app.request("/api/health");

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
  });
});
