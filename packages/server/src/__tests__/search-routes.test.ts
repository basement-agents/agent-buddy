/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Next } from "hono";
import type { CodeReview } from "@agent-buddy/core";

// Create hoisted mocks for dynamic control
const mockState = vi.hoisted(() => ({
  listReposFn: vi.fn().mockResolvedValue([]),
  listBuddiesFn: vi.fn().mockResolvedValue([]),
  reviewHistory: [] as CodeReview[],
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
vi.mock("@agent-buddy/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-buddy/core")>();
  return {
    ...actual,
    listRepos: mockState.listReposFn,
    BuddyFileSystemStorage: class {
      listBuddies = mockState.listBuddiesFn;
    },
    Logger: class {
      error = vi.fn();
      info = vi.fn();
      warn = vi.fn();
    },
  };
});

// Mock job state with mutable reviewHistory
vi.mock("../jobs/state.js", () => ({
  reviewHistory: mockState.reviewHistory,
  reviewJobs: new Map(),
  analysisJobs: new Map(),
  schedules: new Map(),
}));

describe("Search Routes", () => {
  let searchApp: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock state
    mockState.reviewHistory.length = 0;
    mockState.listReposFn.mockResolvedValue([]);
    mockState.listBuddiesFn.mockResolvedValue([]);

    // Import search routes after mocks are set up
    const { createSearchRoutes } = await import("../routes/search.js");
    searchApp = createSearchRoutes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("query validation", () => {
    it("empty query returns empty arrays", async () => {
      const res = await searchApp.request("/api/search");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ repos: [], buddies: [], reviews: [] });
    });

    it("whitespace-only query returns empty arrays", async () => {
      const res = await searchApp.request("/api/search?q=%20+%20");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ repos: [], buddies: [], reviews: [] });
    });

  });

  describe("repo matching", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "owner1/repo1", owner: "owner1", repo: "repo1" },
        { id: "owner2/repo2", owner: "owner2", repo: "repo2" },
        { id: "testowner/testrepo", owner: "testowner", repo: "testrepo" },
      ]);
    });

    it("matches repos by owner name", async () => {
      const res = await searchApp.request("/api/search?q=owner1");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.repos[0]).toEqual({ id: "owner1/repo1", owner: "owner1", repo: "repo1" });
    });

    it("matches repos by repo name", async () => {
      const res = await searchApp.request("/api/search?q=repo2");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.repos[0]).toEqual({ id: "owner2/repo2", owner: "owner2", repo: "repo2" });
    });

    it("matches repos by partial owner name", async () => {
      const res = await searchApp.request("/api/search?q=owner");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(3);
    });

    it("matches repos by partial repo name", async () => {
      const res = await searchApp.request("/api/search?q=repo");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(3);
    });
  });

  describe("buddy matching", () => {
    beforeEach(() => {
      mockState.listBuddiesFn.mockResolvedValue([
        { id: "buddy-1", username: "john_doe" },
        { id: "buddy-2", username: "jane_smith" },
        { id: "test-buddy", username: "testuser" },
      ]);
    });

    it("matches buddies by username", async () => {
      const res = await searchApp.request("/api/search?q=john");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buddies).toHaveLength(1);
      expect(data.buddies[0]).toEqual({ id: "buddy-1", username: "john_doe" });
    });

    it("matches buddies by ID", async () => {
      const res = await searchApp.request("/api/search?q=buddy-2");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buddies).toHaveLength(1);
      expect(data.buddies[0]).toEqual({ id: "buddy-2", username: "jane_smith" });
    });

    it("matches buddies by partial username", async () => {
      const res = await searchApp.request("/api/search?q=_");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buddies).toHaveLength(2);
    });
  });

  describe("review matching", () => {
    beforeEach(() => {
      mockState.reviewHistory.push(
        {
          summary: "Fix authentication bug in login flow",
          state: "approved",
          comments: [],
          buddyId: "buddy-1",
          reviewedAt: new Date(),
          metadata: {
            owner: "owner1",
            repo: "repo1",
            prNumber: 123,
            reviewType: "low-context",
            llmModel: "claude-3-opus",
            tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
            durationMs: 5000,
          },
        },
        {
          summary: "Add unit tests for user service",
          state: "changes_requested",
          comments: [],
          buddyId: "buddy-2",
          reviewedAt: new Date(),
          metadata: {
            owner: "owner2",
            repo: "repo2",
            prNumber: 456,
            reviewType: "high-context",
            llmModel: "claude-3-opus",
            tokenUsage: { inputTokens: 2000, outputTokens: 800, totalTokens: 2800 },
            durationMs: 8000,
          },
        },
        {
          summary: "Refactor database connection logic",
          state: "commented",
          comments: [],
          buddyId: "test-buddy",
          reviewedAt: new Date(),
          metadata: {
            owner: "testowner",
            repo: "testrepo",
            prNumber: 789,
            reviewType: "combined",
            llmModel: "claude-3-sonnet",
            tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
            durationMs: 2000,
          },
        }
      );
    });

    it("matches reviews by owner", async () => {
      const res = await searchApp.request("/api/search?q=owner1");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0]).toEqual({
        owner: "owner1",
        repo: "repo1",
        prNumber: 123,
        summary: "Fix authentication bug in login flow",
      });
    });

    it("matches reviews by repo name", async () => {
      const res = await searchApp.request("/api/search?q=repo2");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0]).toEqual({
        owner: "owner2",
        repo: "repo2",
        prNumber: 456,
        summary: "Add unit tests for user service",
      });
    });

    it("matches reviews by summary text", async () => {
      const res = await searchApp.request("/api/search?q=authentication");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0].summary).toContain("authentication");
    });

    it("matches reviews by PR number", async () => {
      const res = await searchApp.request("/api/search?q=456");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0].prNumber).toBe(456);
    });

    it("matches reviews by partial PR number", async () => {
      const res = await searchApp.request("/api/search?q=12");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(1);
      expect(data.reviews[0].prNumber).toBe(123);
    });
  });

  describe("case-insensitive matching", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "TestOwner/TestRepo", owner: "TestOwner", repo: "TestRepo" },
      ]);
      mockState.listBuddiesFn.mockResolvedValue([
        { id: "buddy-test", username: "TestUser" },
      ]);
      mockState.reviewHistory.push({
        summary: "Test summary with keyword",
        state: "approved",
        comments: [],
        buddyId: "buddy-test",
        reviewedAt: new Date(),
        metadata: {
          owner: "TestOwner",
          repo: "TestRepo",
          prNumber: 111,
          reviewType: "low-context",
          llmModel: "claude-3-opus",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          durationMs: 5000,
        },
      });
    });

    it("searching lowercase matches uppercase content", async () => {
      const res = await searchApp.request("/api/search?q=testowner");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.repos[0].owner).toBe("TestOwner");
    });

    it("searching uppercase matches lowercase content", async () => {
      const res = await searchApp.request("/api/search?q=TESTUSER");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buddies).toHaveLength(1);
      expect(data.buddies[0].username).toBe("TestUser");
    });

    it("searching mixed case matches any case", async () => {
      const res = await searchApp.request("/api/search?q=TeSt");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.buddies).toHaveLength(1);
      expect(data.reviews).toHaveLength(1);
    });
  });

  describe("result limiting", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `owner${i}/repo${i}`,
          owner: `owner${i}`,
          repo: `repo${i}`,
        }))
      );
      mockState.listBuddiesFn.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: `buddy-${i}`,
          username: `user${i}`,
        }))
      );
      mockState.reviewHistory.push(
        ...Array.from({ length: 10 }, (_, i) => ({
          summary: `Review summary ${i}`,
          state: "approved" as const,
          comments: [],
          buddyId: `buddy-${i}`,
          reviewedAt: new Date(),
          metadata: {
            owner: `owner${i}`,
            repo: `repo${i}`,
            prNumber: i,
            reviewType: "low-context" as const,
            llmModel: "claude-3-opus",
            tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
            durationMs: 5000,
          },
        }))
      );
    });

    it("limits repos to 5 results", async () => {
      const res = await searchApp.request("/api/search?q=owner");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(5);
    });

    it("limits buddies to 5 results", async () => {
      const res = await searchApp.request("/api/search?q=user");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.buddies).toHaveLength(5);
    });

    it("limits reviews to 5 results", async () => {
      const res = await searchApp.request("/api/search?q=review");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reviews).toHaveLength(5);
    });
  });

  describe("error handling", () => {
    it("returns 500 when listRepos throws", async () => {
      mockState.listReposFn.mockRejectedValue(new Error("Database error"));

      const res = await searchApp.request("/api/search?q=test");

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Search failed" });
    });

    it("returns 500 when listBuddies throws", async () => {
      mockState.listBuddiesFn.mockRejectedValue(new Error("Storage error"));

      const res = await searchApp.request("/api/search?q=test");

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Search failed" });
    });
  });

  describe("special characters", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "owner/repo", owner: "owner", repo: "repo" },
      ]);
      mockState.listBuddiesFn.mockResolvedValue([
        { id: "buddy-1", username: "user@example.com" },
      ]);
      mockState.reviewHistory.push({
        summary: "Fix: handle special chars !@#$%",
        state: "approved",
        comments: [],
        buddyId: "buddy-1",
        reviewedAt: new Date(),
        metadata: {
          owner: "owner",
          repo: "repo",
          prNumber: 1,
          reviewType: "low-context",
          llmModel: "claude-3-opus",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          durationMs: 5000,
        },
      });
    });

    it("handles special and unicode characters in query", async () => {
      const specialRes = await searchApp.request("/api/search?q=!@#$%");
      const specialData = await specialRes.json();
      expect(specialData.repos).toHaveLength(0);
      expect(specialData.buddies).toHaveLength(0);
      expect(specialData.reviews).toHaveLength(1);

      const atRes = await searchApp.request("/api/search?q=@");
      const atData = await atRes.json();
      expect(atData.buddies).toHaveLength(1);

      const unicodeRes = await searchApp.request("/api/search?q=café");
      const unicodeData = await unicodeRes.json();
      expect(unicodeData).toHaveProperty("repos");
      expect(unicodeData).toHaveProperty("buddies");
      expect(unicodeData).toHaveProperty("reviews");
    });
  });

  describe("no matches", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "owner/repo", owner: "owner", repo: "repo" },
      ]);
      mockState.listBuddiesFn.mockResolvedValue([
        { id: "buddy-1", username: "user" },
      ]);
      mockState.reviewHistory.push({
        summary: "Test review",
        state: "approved",
        comments: [],
        buddyId: "buddy-1",
        reviewedAt: new Date(),
        metadata: {
          owner: "owner",
          repo: "repo",
          prNumber: 1,
          reviewType: "low-context",
          llmModel: "claude-3-opus",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          durationMs: 5000,
        },
      });
    });

    it("returns empty arrays for non-matching query", async () => {
      const res = await searchApp.request("/api/search?q=nonexistent");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toEqual([]);
      expect(data.buddies).toEqual([]);
      expect(data.reviews).toEqual([]);
    });
  });

  describe("cross-category matching", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "test/repo", owner: "test", repo: "repo" },
      ]);
      mockState.listBuddiesFn.mockResolvedValue([
        { id: "test-buddy", username: "testuser" },
      ]);
      mockState.reviewHistory.push({
        summary: "Test review summary",
        state: "approved",
        comments: [],
        buddyId: "test-buddy",
        reviewedAt: new Date(),
        metadata: {
          owner: "test",
          repo: "repo",
          prNumber: 1,
          reviewType: "low-context",
          llmModel: "claude-3-opus",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          durationMs: 5000,
        },
      });
    });

    it("matches across all categories with single query", async () => {
      const res = await searchApp.request("/api/search?q=test");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.repos).toHaveLength(1);
      expect(data.buddies).toHaveLength(1);
      expect(data.reviews).toHaveLength(1);
    });
  });

  describe("query trimming", () => {
    beforeEach(() => {
      mockState.listReposFn.mockResolvedValue([
        { id: "owner/repo", owner: "owner", repo: "repo" },
      ]);
    });

    it("trims whitespace before searching", async () => {
      const leading = await searchApp.request("/api/search?q=%20owner");
      const trailing = await searchApp.request("/api/search?q=owner%20");
      const both = await searchApp.request("/api/search?q=%20%20owner%20%20");

      for (const res of [leading, trailing, both]) {
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.repos).toHaveLength(1);
        expect(data.repos[0].owner).toBe("owner");
      }
    });
  });
});
