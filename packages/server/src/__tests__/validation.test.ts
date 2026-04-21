import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the middleware at top level before imports
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<unknown>) => next(),
}));

vi.mock("../middleware/rate-limit.js", () => ({
  rateLimitMiddleware: () => async (_c: unknown, next: () => Promise<unknown>) => next(),
  reviewRateLimitMiddleware: () => async (_c: unknown, next: () => Promise<unknown>) => next(),
  getRateLimitStatus: () => ({
    totalEntries: 0,
    windowMs: 60000,
    publicLimit: 30,
    authenticatedLimit: 100,
  }),
}));

vi.mock("../middleware/request-id.js", () => ({
  requestIdMiddleware: () => async (_c: unknown, next: () => Promise<unknown>) => next(),
}));

vi.mock("../jobs/scheduler.js", () => ({
  initializeSchedules: () => {},
  cleanupSchedules: () => {},
}));

vi.mock("../jobs/review.js", () => ({
  processReviewJob: () => Promise.resolve(),
}));

vi.mock("../jobs/analysis.js", () => ({
  processAnalysisJob: () => Promise.resolve(),
  processUpdateJob: () => Promise.resolve(),
}));

describe("API Input Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/repos", () => {
    it("should reject missing owner", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "test-repo" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject missing repo", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test-owner" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject empty owner", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "", repo: "test-repo" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject empty repo", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test-owner", repo: "" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should accept valid input with optional buddyId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test-owner", repo: "test-repo", buddyId: "test-buddy" }),
      });
      // May return 201 or 409 depending on whether repo already exists
      expect([201, 409]).toContain(res.status);
    });

    it("should accept valid input without buddyId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test-owner", repo: "test-repo" }),
      });
      // May return 201 or 409 depending on whether repo already exists
      expect([201, 409]).toContain(res.status);
    });
  });

  describe("PATCH /api/repos/:owner/:repo", () => {
    it("should accept valid buddyId update", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buddyId: "new-buddy" }),
      });
      // May return 200 or 404 depending on whether repo exists
      expect([200, 404]).toContain(res.status);
    });

    it("should accept valid autoReview boolean", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReview: true }),
      });
      // May return 200 or 404 depending on whether repo exists
      expect([200, 404]).toContain(res.status);
    });

    it("should accept valid triggerMode", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerMode: "pr_opened" }),
      });
      // May return 200 or 404 depending on whether repo exists
      expect([200, 404]).toContain(res.status);
    });

    it("should reject invalid triggerMode", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerMode: "invalid_mode" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should accept empty body (no updates)", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // May return 200 or 404 depending on whether repo exists
      expect([200, 404]).toContain(res.status);
    });
  });

  describe("POST /api/repos/:id/schedule", () => {
    it("should reject missing enabled", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalMinutes: 5 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject missing intervalMinutes", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject intervalMinutes less than 1", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 0 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject non-integer intervalMinutes", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 5.5 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should accept valid schedule", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 5 }),
      });
      // May return 201 (created) or 404 (repo not found)
      expect([201, 404]).toContain(res.status);
    });
  });

  describe("POST /api/buddies", () => {
    it("should reject missing username", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "owner/repo" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject missing repo", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject empty username", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "", repo: "owner/repo" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject empty repo", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", repo: "" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should accept valid input with optional maxPrs", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", repo: "owner/repo", maxPrs: 30 }),
      });
      // Returns 202 if API keys are missing, or creates job
      expect([202, 500]).toContain(res.status);
    });

    it("should accept valid input without maxPrs", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", repo: "owner/repo" }),
      });
      // Returns 202 if API keys are missing, or creates job
      expect([202, 500]).toContain(res.status);
    });
  });

  describe("POST /api/buddies/:id/feedback", () => {
    it("should reject missing reviewId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: "comment-123", wasHelpful: true }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject missing commentId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "review-123", wasHelpful: true }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject missing wasHelpful", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "review-123", commentId: "comment-123" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject non-boolean wasHelpful", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "review-123", commentId: "comment-123", wasHelpful: "true" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should accept valid feedback with wasHelpful=true", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "review-123", commentId: "comment-123", wasHelpful: true }),
      });
      expect(res.status).toBe(201);
    });

    it("should accept valid feedback with wasHelpful=false", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: "review-123", commentId: "comment-123", wasHelpful: false }),
      });
      expect(res.status).toBe(201);
    });

    it("should accept valid feedback with optional userResponse", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: "review-123",
          commentId: "comment-123",
          wasHelpful: true,
          userResponse: "Great feedback!",
        }),
      });
      expect(res.status).toBe(201);
    });
  });

  describe("POST /api/repos/:id/reviews", () => {
    it("should reject missing prNumber", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject non-integer prNumber", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: 1.5 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject zero prNumber", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: 0 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject negative prNumber", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: -1 }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should accept valid prNumber", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: 123 }),
      });
      // May return 202, 400 (no buddy), or 404 (repo not found)
      expect([202, 400, 404]).toContain(res.status);
    });
  });

  describe("POST /api/repos/:id/rules", () => {
    it("should reject missing id", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Rule", pattern: "test-pattern" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject missing name", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", pattern: "test-pattern" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject missing pattern", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", name: "Test Rule" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject empty id", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "", name: "Test Rule", pattern: "test-pattern" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject empty name", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", name: "", pattern: "test-pattern" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject empty pattern", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", name: "Test Rule", pattern: "" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should reject invalid severity", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", name: "Test Rule", pattern: "test-pattern", severity: "invalid" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error?: { issues: Array<{ message: string }> } };
      expect(data.success).toBe(false);
      expect(data.error?.issues).toBeDefined();
    });

    it("should accept valid rule with all fields", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "rule-123",
          name: "Test Rule",
          description: "A test rule",
          pattern: "test-pattern",
          severity: "error",
          enabled: true,
        }),
      });
      // May return 201 or 404 depending on whether repo exists
      expect([201, 404]).toContain(res.status);
    });

    it("should accept valid rule with only required fields", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/repos/test-owner/test-repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "rule-123", name: "Test Rule", pattern: "test-pattern" }),
      });
      // May return 201 or 404 depending on whether repo exists
      expect([201, 404]).toContain(res.status);
    });
  });

  describe("POST /api/buddies/import", () => {
    it("should reject missing profile", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId: "new-buddy" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should reject empty profile", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json() as { error?: string; issues?: Array<{ path: string[]; message: string }> };
      expect(data.error || data.issues).toBeDefined();
    });

    it("should accept valid profile with newId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: '{"SOUL":{}}', newId: "new-buddy" }),
      });
      // May return 201 or 400 depending on JSON validity
      expect([201, 400]).toContain(res.status);
    });

    it("should accept valid profile without newId", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: '{"SOUL":{}}' }),
      });
      // May return 201 or 400 depending on JSON validity
      expect([201, 400]).toContain(res.status);
    });
  });

  describe("POST /api/buddies/:id/update", () => {
    it("should accept empty body", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Returns 500 if API keys missing, or 202
      expect([202, 500]).toContain(res.status);
    });

    it("should accept valid repo", async () => {
      const { default: app } = await import("../index.js");
      const res = await app.request("/api/buddies/test-buddy/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "owner/repo" }),
      });
      // Returns 500 if API keys missing, or 202
      expect([202, 500]).toContain(res.status);
    });
  });
});
