/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the middleware at top level before imports
vi.mock("../middleware/auth.js", () => ({
  authMiddleware: async (_c: any, next: () => Promise<void>) => next(),
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
  requestIdMiddleware: () => async (_c: any, next: () => Promise<void>) => next(),
}));

vi.mock("../jobs/scheduler.js", () => ({
  initializeSchedules: () => {},
  cleanupSchedules: () => {},
  checkForOpenPRs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    repos: [
      { id: "owner/repo", buddyId: "buddy-1", schedule: { enabled: true, intervalMinutes: 60 } },
    ],
    server: {},
  }),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  listRepos: vi.fn().mockResolvedValue([{ id: "owner/repo", buddyId: "buddy-1" }]),
  addRepo: vi.fn().mockResolvedValue({ id: "owner/repo", buddyId: "buddy-1" }),
  removeRepo: vi.fn().mockResolvedValue(undefined),
  GitHubClient: class {},
  Logger: class { error = vi.fn(); info = vi.fn(); warn = vi.fn(); },
  BuddyFileSystemStorage: class {},
  AnalysisPipeline: class {},
  ReviewEngine: class {},
  evaluateCustomRules: vi.fn(),
  AnthropicClaudeProvider: class {},
  ConfigError: class extends Error {},
  FileContextCache: class {},
  recordFeedback: vi.fn(),
  getFeedbackSummary: vi.fn().mockResolvedValue({ helpful: 0, notHelpful: 0, patterns: [] }),
  getRecentFeedback: vi.fn().mockResolvedValue([]),
  configSchema: {},
  compareBuddies: vi.fn(),
}));

vi.mock("../jobs/review.js", () => ({
  processReviewJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../jobs/state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../jobs/state.js")>();
  return {
    ...actual,
    reviewJobs: new Map(),
    schedules: new Map(),
    reviewHistory: [],
    analysisJobs: new Map(),
  };
});

describe("Repos Routes", () => {
  let app: any;
  let mockLoadConfig: any;
  let mockListRepos: any;
  let mockAddRepo: any;
  let mockRemoveRepo: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import after mocks are set up
    const mod = await import("../index.js");
    app = mod.default;

    // Get mock functions for manipulation in tests
    const core = await import("@agent-buddy/core");
    mockLoadConfig = core.loadConfig;
    mockListRepos = core.listRepos;
    mockAddRepo = core.addRepo;
    mockRemoveRepo = core.removeRepo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GET /api/repos returns repo list (200)", async () => {
    const mockRepos = [
      { id: "owner/repo", buddyId: "buddy-1" },
      { id: "test/test", buddyId: "buddy-2" },
    ];
    mockListRepos.mockResolvedValue(mockRepos);

    const res = await app.request("/api/repos");

    expect(res.status).toBe(200);
    const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBe(2);
    expect(data.data[0].id).toBe("owner/repo");
    expect(data.page).toBe(1);
    expect(data.limit).toBe(20);
    expect(data.total).toBe(2);
    expect(data.totalPages).toBe(1);
  });

  it("GET /api/repos supports pagination", async () => {
    const mockRepos = Array.from({ length: 5 }, (_, i) => ({ id: `owner/repo-${i}`, buddyId: `buddy-${i}` }));
    mockListRepos.mockResolvedValue(mockRepos);

    const res = await app.request("/api/repos?page=2&limit=2");

    expect(res.status).toBe(200);
    const data = await res.json() as { data: any[]; total: number; page: number; limit: number; totalPages: number };
    expect(data.page).toBe(2);
    expect(data.limit).toBe(2);
    expect(data.total).toBe(5);
    expect(data.totalPages).toBe(3);
    expect(data.data).toHaveLength(2);
    expect(data.data[0].id).toBe("owner/repo-2");
  });

  it("GET /api/repos returns 400 for invalid page", async () => {
    mockListRepos.mockResolvedValue([{ id: "owner/repo" }]);

    const res = await app.request("/api/repos?page=0");
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("GET /api/repos returns 400 for limit exceeding max", async () => {
    mockListRepos.mockResolvedValue([{ id: "owner/repo" }]);

    const res = await app.request("/api/repos?limit=101");
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("Validation error");
  });

  it("POST /api/repos adds a repo (201)", async () => {
    const newRepo = { id: "new/repo", buddyId: "buddy-3" };
    mockAddRepo.mockResolvedValue(newRepo);

    const res = await app.request("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "new", repo: "repo", buddyId: "buddy-3" }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("new/repo");
    expect(data.buddyId).toBe("buddy-3");
  });

  it("DELETE /api/repos/:owner/:repo removes a repo (200)", async () => {
    mockRemoveRepo.mockResolvedValue(undefined);

    const res = await app.request("/api/repos/test/repo", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe("test/repo");
  });

  it("PATCH /api/repos/:owner/:repo updates repo config (200)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1", autoReview: false }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buddyId: "buddy-2", autoReview: true }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.buddyId).toBe("buddy-2");
    expect(data.autoReview).toBe(true);
  });

  it("PATCH /api/repos/:owner/:repo returns 404 for non-existent repo", async () => {
    const mockConfig = {
      repos: [{ id: "other/repo", buddyId: "buddy-1" }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buddyId: "buddy-2" }),
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repo not found");
  });

  it("GET /api/repos/:owner/:repo/schedule returns schedule (200)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1", schedule: { enabled: true, intervalMinutes: 60 } }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/schedule");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.schedule).toBeDefined();
    expect(data.schedule.enabled).toBe(true);
    expect(data.schedule.intervalMinutes).toBe(60);
  });

  it("POST /api/repos/:owner/:repo/schedule creates schedule (201)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1" }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, intervalMinutes: 30 }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.repoId).toBe("owner/repo");
    expect(data.schedule.enabled).toBe(true);
    expect(data.schedule.intervalMinutes).toBe(30);
  });

  it("DELETE /api/repos/:owner/:repo/schedule removes schedule (200)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1", schedule: { enabled: true, intervalMinutes: 60 } }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/schedule", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });

  it("GET /api/repos/:owner/:repo/rules returns rules (200)", async () => {
    const mockConfig = {
      repos: [{
        id: "owner/repo",
        buddyId: "buddy-1",
        customRules: [
          { id: "rule-1", name: "Test Rule", pattern: "test", severity: "error", enabled: true },
        ],
      }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/rules");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rules).toBeDefined();
    expect(Array.isArray(data.rules)).toBe(true);
    expect(data.rules.length).toBe(1);
    expect(data.rules[0].id).toBe("rule-1");
  });

  it("POST /api/repos/:owner/:repo/rules adds a rule (201)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1" }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "rule-2",
        name: "New Rule",
        pattern: "new-pattern",
        severity: "warning",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rule.id).toBe("rule-2");
    expect(data.rule.name).toBe("New Rule");
    expect(data.rule.severity).toBe("warning");
  });

  it("DELETE /api/repos/:owner/:repo/rules/:ruleId removes a rule (200)", async () => {
    const mockConfig = {
      repos: [{
        id: "owner/repo",
        buddyId: "buddy-1",
        customRules: [
          { id: "rule-1", name: "Test Rule", pattern: "test", severity: "error", enabled: true },
          { id: "rule-2", name: "Another Rule", pattern: "another", severity: "suggestion", enabled: true },
        ],
      }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);
  });

  it("POST /api/repos/:owner/:repo/reviews triggers review (202)", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo", buddyId: "buddy-1" }],
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);
    process.env.GITHUB_TOKEN = "test-token";

    const res = await app.request("/api/repos/owner/repo/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prNumber: 123, reviewType: "low-context" }),
    });

    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.message).toContain("Queued reviews");
    expect(data.buddyIds).toContain("buddy-1");
  });

  it("POST /api/repos/:owner/:repo/reviews returns 400 when no buddy assigned", async () => {
    const mockConfig = {
      repos: [{ id: "owner/repo" }], // No buddyId
      server: {},
    };
    mockLoadConfig.mockResolvedValue(mockConfig);

    const res = await app.request("/api/repos/owner/repo/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prNumber: 123 }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No buddy assigned to this repo");
  });

  it("GET /api/repos/unknown/repo/rules returns 404 when repo not in config", async () => {
    mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

    const res = await app.request("/api/repos/unknown/repo/rules");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repo not found");
  });

  it("POST /api/repos/unknown/repo/rules returns 404 when repo not in config", async () => {
    mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

    const res = await app.request("/api/repos/unknown/repo/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "r1", name: "Test", pattern: "test" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repo not found");
  });

  it("DELETE /api/repos/unknown/repo/rules/rule-1 returns 404 when repo not in config", async () => {
    mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

    const res = await app.request("/api/repos/unknown/repo/rules/rule-1", { method: "DELETE" });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Repo not found");
  });

  describe("schedule validation", () => {
    it("POST schedule rejects intervalMinutes of zero", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 0 }),
      });

      expect(res.status).toBe(400);
    });

    it("POST schedule rejects negative intervalMinutes", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: -5 }),
      });

      expect(res.status).toBe(400);
    });

    it("POST schedule rejects non-integer intervalMinutes", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 3.5 }),
      });

      expect(res.status).toBe(400);
    });

    it("POST schedule returns 404 for non-existent repo", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "other/repo" }], server: {} });

      const res = await app.request("/api/repos/missing/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 30 }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Repo not found");
    });

    it("POST schedule accepts minimum valid intervalMinutes of 1", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, intervalMinutes: 1 }),
      });

      expect(res.status).toBe(201);
    });

    it("POST schedule disables schedule when enabled is false", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{ id: "owner/repo", schedule: { enabled: true, intervalMinutes: 60 } }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, intervalMinutes: 60 }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.schedule.enabled).toBe(false);
    });

    it("GET schedule returns 404 for non-existent repo", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "other/repo" }], server: {} });

      const res = await app.request("/api/repos/missing/repo/schedule");
      expect(res.status).toBe(404);
    });

  });

  describe("rule management", () => {
    it("GET rules returns empty array when repo has no customRules", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rules).toEqual([]);
    });

    it("POST rule rejects missing required fields", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }), // missing id and pattern
      });

      expect(res.status).toBe(400);
    });

    it("POST rule rejects empty id", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "", name: "Test", pattern: "test" }),
      });

      expect(res.status).toBe(400);
    });

    it("POST rule rejects invalid severity", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "r1", name: "Test", pattern: "test", severity: "critical" }),
      });

      expect(res.status).toBe(400);
    });

    it("POST rule defaults severity to suggestion when omitted", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "r1", name: "Test", pattern: "test" }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.rule.severity).toBe("suggestion");
    });

    it("DELETE rule returns 404 when repo has no customRules", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", { method: "DELETE" });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Rule not found");
    });

    it("GET rules returns all rules when repo has multiple rules", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{
          id: "owner/repo",
          customRules: [
            { id: "r1", name: "Rule 1", pattern: "p1", severity: "error", enabled: true },
            { id: "r2", name: "Rule 2", pattern: "p2", severity: "warning", enabled: false },
            { id: "r3", name: "Rule 3", pattern: "p3", severity: "info", enabled: true },
          ],
        }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/rules");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rules).toHaveLength(3);
    });

    it("PATCH /api/repos/:owner/:repo/rules/:ruleId updates a rule (200)", async () => {
      const mockConfig = {
        repos: [{
          id: "owner/repo",
          buddyId: "buddy-1",
          customRules: [
            { id: "rule-1", name: "Test Rule", description: "Original", pattern: "test", severity: "error", enabled: true },
          ],
        }],
        server: {},
      };
      mockLoadConfig.mockResolvedValue(mockConfig);

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Rule", enabled: false }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rule.id).toBe("rule-1");
      expect(data.rule.name).toBe("Updated Rule");
      expect(data.rule.enabled).toBe(false);
      expect(data.rule.pattern).toBe("test"); // unchanged
    });

    it("PATCH rule returns 404 when repo not found", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/unknown/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Repo not found");
    });

    it("PATCH rule returns 404 when rule not found", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{
          id: "owner/repo",
          customRules: [{ id: "rule-1", name: "Rule 1", pattern: "p1", severity: "error", enabled: true }],
        }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/rules/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Rule not found");
    });

    it("PATCH rule returns 404 when repo has no customRules", async () => {
      mockLoadConfig.mockResolvedValue({ repos: [{ id: "owner/repo" }], server: {} });

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Rule not found");
    });

    it("PATCH rule rejects invalid severity", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{
          id: "owner/repo",
          customRules: [{ id: "rule-1", name: "Rule 1", pattern: "p1", severity: "error", enabled: true }],
        }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity: "critical" }),
      });
      expect(res.status).toBe(400);
    });

    it("PATCH rule rejects empty name when provided", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{
          id: "owner/repo",
          customRules: [{ id: "rule-1", name: "Rule 1", pattern: "p1", severity: "error", enabled: true }],
        }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("PATCH rule rejects empty pattern when provided", async () => {
      mockLoadConfig.mockResolvedValue({
        repos: [{
          id: "owner/repo",
          customRules: [{ id: "rule-1", name: "Rule 1", pattern: "p1", severity: "error", enabled: true }],
        }],
        server: {},
      });

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("PATCH rule allows updating all fields", async () => {
      const mockConfig = {
        repos: [{
          id: "owner/repo",
          customRules: [
            { id: "rule-1", name: "Test Rule", description: "Original", pattern: "test", severity: "error", enabled: true },
          ],
        }],
        server: {},
      };
      mockLoadConfig.mockResolvedValue(mockConfig);

      const res = await app.request("/api/repos/owner/repo/rules/rule-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Fully Updated",
          description: "New description",
          pattern: "new-pattern",
          severity: "warning",
          enabled: false,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rule.name).toBe("Fully Updated");
      expect(data.rule.description).toBe("New description");
      expect(data.rule.pattern).toBe("new-pattern");
      expect(data.rule.severity).toBe("warning");
      expect(data.rule.enabled).toBe(false);
    });
  });
});
