import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError } from "../lib/api";

describe("API Client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.mocked(global.fetch).mockReset();
  });

  describe("Health", () => {
    it("should check health", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "healthy" }),
      } as Response);

      const result = await api.health();
      expect(result).toEqual({ status: "healthy" });
      expect(global.fetch).toHaveBeenCalledWith("/api/health", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Settings", () => {
    it("should get settings", async () => {
      const settings = { theme: "dark", autoReview: true };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => settings,
      } as Response);

      const result = await api.getSettings();
      expect(result).toEqual(settings);
      expect(global.fetch).toHaveBeenCalledWith("/api/settings", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should update settings", async () => {
      const newSettings = { githubToken: "test-token" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ saved: true }),
      } as Response);

      const result = await api.updateSettings(newSettings);
      expect(result).toEqual({ saved: true });
      expect(global.fetch).toHaveBeenCalledWith("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
        signal: undefined,
      });
    });
  });

  describe("Repos", () => {
    it("should list repos", async () => {
      const repos = [
        { id: "1", owner: "test", repo: "repo1", autoReview: true, triggerMode: "auto" },
      ];
      const paginatedRepos = {
        data: repos,
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => paginatedRepos,
      } as Response);

      const result = await api.listRepos();
      expect(result).toEqual(paginatedRepos);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should add repo", async () => {
      const newRepo = { id: "1", owner: "test", repo: "repo1", autoReview: true, triggerMode: "auto" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => newRepo,
      } as Response);

      const result = await api.addRepo("test", "repo1");
      expect(result).toEqual(newRepo);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test", repo: "repo1", buddyId: undefined }),
        signal: undefined,
      });
    });

    it("should add repo with buddyId", async () => {
      const newRepo = { id: "1", owner: "test", repo: "repo1", buddyId: "buddy1", autoReview: true, triggerMode: "auto" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => newRepo,
      } as Response);

      const result = await api.addRepo("test", "repo1", "buddy1");
      expect(result).toEqual(newRepo);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: "test", repo: "repo1", buddyId: "buddy1" }),
        signal: undefined,
      });
    });

    it("should remove repo", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: "test/repo1" }),
      } as Response);

      const result = await api.removeRepo("test/repo1");
      expect(result).toEqual({ deleted: "test/repo1" });
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/test/repo1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should update repo", async () => {
      const updatedRepo = { id: "test/repo1", owner: "test", repo: "repo1", autoReview: false, triggerMode: "manual" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedRepo,
      } as Response);

      const result = await api.updateRepo("test/repo1", { autoReview: false, triggerMode: "manual" });
      expect(result).toEqual(updatedRepo);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/test/repo1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReview: false, triggerMode: "manual" }),
        signal: undefined,
      });
    });
  });

  describe("Buddies", () => {
    it("should list buddies", async () => {
      const buddies = [
        { id: "buddy1", username: "reviewer1", sourceRepos: ["test/repo1"], totalReviews: 10, lastUpdated: "2024-01-01" },
      ];
      const paginatedBuddies = {
        data: buddies,
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => paginatedBuddies,
      } as Response);

      const result = await api.listBuddies();
      expect(result).toEqual(paginatedBuddies);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should get buddy", async () => {
      const buddy = {
        id: "buddy1",
        username: "reviewer1",
        soul: "SOUL content",
        user: "USER content",
        memory: "MEMORY content",
        sourceRepos: ["test/repo1"],
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => buddy,
      } as Response);

      const result = await api.getBuddy("buddy1");
      expect(result).toEqual(buddy);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy1", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should create buddy", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: "job1" }),
      } as Response);

      const result = await api.createBuddy("reviewer1", "test/repo1");
      expect(result).toEqual({ jobId: "job1" });
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "reviewer1", repo: "test/repo1", maxPrs: undefined }),
        signal: undefined,
      });
    });

    it("should create buddy with maxPrs", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: "job1" }),
      } as Response);

      const result = await api.createBuddy("reviewer1", "test/repo1", 50);
      expect(result).toEqual({ jobId: "job1" });
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "reviewer1", repo: "test/repo1", maxPrs: 50 }),
        signal: undefined,
      });
    });

    it("should delete buddy", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: "buddy1" }),
      } as Response);

      const result = await api.deleteBuddy("buddy1");
      expect(result).toEqual({ deleted: "buddy1" });
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should update buddy", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: "job2" }),
      } as Response);

      const result = await api.updateBuddy("buddy1", "test/repo2");
      expect(result).toEqual({ jobId: "job2" });
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy1/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: "test/repo2" }),
        signal: undefined,
      });
    });
  });

  describe("Reviews", () => {
    it("should list reviews", async () => {
      const reviewsResponse = {
        reviews: [
          {
            summary: "LGTM",
            state: "approved",
            comments: [],
            buddyId: "buddy1",
            reviewedAt: "2024-01-01",
            metadata: {
              prNumber: 1,
              repo: "repo1",
              owner: "test",
              reviewType: "full",
              llmModel: "claude-3",
              tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
              durationMs: 5000,
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => reviewsResponse,
      } as Response);

      const result = await api.listReviews({ repo: "test/repo1" });
      expect(result).toEqual(reviewsResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/reviews?repo=test%2Frepo1", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should list reviews with multiple filters", async () => {
      const reviewsResponse = { reviews: [], total: 0, page: 1, limit: 20 };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => reviewsResponse,
      } as Response);

      await api.listReviews({ repo: "test/repo1", buddy: "buddy1", status: "approved", page: 2, limit: 20 });
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/reviews?repo=test%2Frepo1&buddy=buddy1&status=approved&page=2&limit=20",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: undefined,
        }
      );
    });

    it("should trigger review", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Review triggered", buddyIds: ["buddy1"] }),
      } as Response);

      const result = await api.triggerReview("test", "repo1", 1);
      expect(result).toEqual({ message: "Review triggered", buddyIds: ["buddy1"] });
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/test/repo1/reviews?", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: 1, reviewType: undefined }),
        signal: undefined,
      });
    });

    it("should trigger review with buddyId and reviewType", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "Review triggered", buddyIds: ["buddy1"] }),
      } as Response);

      await api.triggerReview("test", "repo1", 1, "buddy1", "quick");
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/test/repo1/reviews?buddyId=buddy1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: 1, reviewType: "quick" }),
        signal: undefined,
      });
    });
  });

  describe("Jobs", () => {
    it("should get job", async () => {
      const job = {
        id: "job1",
        repoId: "test/repo1",
        prNumber: 1,
        buddyId: "buddy1",
        status: "completed" as const,
        result: { summary: "LGTM", state: "approved", comments: [], reviewedAt: "2024-01-01", metadata: {} },
        createdAt: "2024-01-01",
        completedAt: "2024-01-01",
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => job,
      } as Response);

      const result = await api.getJob("job1");
      expect(result).toEqual(job);
      expect(global.fetch).toHaveBeenCalledWith("/api/jobs/job1", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should get job status", async () => {
      const status = {
        id: "job1",
        status: "running" as const,
        progress: 50,
        startedAt: "2024-01-01",
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => status,
      } as Response);

      const result = await api.getJobStatus("job1");
      expect(result).toEqual(status);
      expect(global.fetch).toHaveBeenCalledWith("/api/jobs/job1/status", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Analytics", () => {
    it("should get analytics data", async () => {
      const analytics = {
        reviewsLast7Days: 5,
        reviewsLast30Days: 20,
        averageTurnaroundTimeMs: 30000,
        averageTurnaroundTimeSeconds: 30,
        perBuddyCounts: { "buddy-1": 10 },
        perRepoCounts: { "owner/repo": 15 },
        reviewStates: { approved: 12, changes_requested: 3 },
        totalReviews: 20,
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => analytics,
      } as Response);

      const result = await api.getAnalytics();
      expect(result).toEqual(analytics);
      expect(global.fetch).toHaveBeenCalledWith("/api/analytics", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should pass AbortSignal to getAnalytics", async () => {
      const controller = new AbortController();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ totalReviews: 0 }),
      } as Response);

      await api.getAnalytics(controller.signal);
      expect(global.fetch).toHaveBeenCalledWith("/api/analytics", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
    });
  });

  describe("Buddy Feedback", () => {
    it("should get buddy feedback", async () => {
      const feedback = {
        helpfulCount: 5,
        notHelpfulCount: 1,
        recentFeedback: [{ id: "fb-1", reviewId: "r-1", helpful: true, createdAt: "2024-01-01" }],
      };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => feedback,
      } as Response);

      const result = await api.getBuddyFeedback("buddy-1");
      expect(result).toEqual(feedback);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy-1/feedback", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Buddy Status", () => {
    it("should get buddy status", async () => {
      const status = { status: "running", progress: "50%" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => status,
      } as Response);

      const result = await api.getBuddyStatus("buddy-1");
      expect(result).toEqual(status);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy-1/status", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Repo Rules", () => {
    it("should get repo rules", async () => {
      const rules = [{ id: "r1", name: "No console.log", pattern: "console\\.log", severity: "warning", enabled: true }];
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => rules,
      } as Response);

      const result = await api.getRepoRules("owner/repo");
      expect(result).toEqual(rules);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/rules", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should add repo rule", async () => {
      const newRule = { id: "r2", name: "No TODO", pattern: "TODO", severity: "error", enabled: true };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => newRule,
      } as Response);

      const result = await api.addRepoRule("owner/repo", { name: "No TODO", pattern: "TODO", severity: "error", enabled: true });
      expect(result).toEqual(newRule);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No TODO", pattern: "TODO", severity: "error", enabled: true }),
        signal: undefined,
      });
    });

    it("should delete repo rule", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: "r1" }),
      } as Response);

      const result = await api.deleteRepoRule("owner/repo", "r1");
      expect(result).toEqual({ deleted: "r1" });
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/rules/r1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Repo Schedule", () => {
    it("should get repo schedule", async () => {
      const schedule = { enabled: true, interval: 60, lastRun: "2024-01-01T00:00:00Z", nextRun: "2024-01-01T01:00:00Z" };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => schedule,
      } as Response);

      const result = await api.getRepoSchedule("owner/repo");
      expect(result).toEqual(schedule);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/schedule", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should update repo schedule", async () => {
      const updatedSchedule = { enabled: true, interval: 30 };
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedSchedule,
      } as Response);

      const result = await api.updateRepoSchedule("owner/repo", { enabled: true, interval: 30 });
      expect(result).toEqual(updatedSchedule);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, interval: 30 }),
        signal: undefined,
      });
    });
  });

  describe("Open PRs", () => {
    it("should list open PRs", async () => {
      const prs = [
        { number: 1, title: "Add feature", author: "user1", createdAt: "2024-01-01", url: "https://github.com/test/repo1/pull/1", state: "open" },
      ];
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => prs,
      } as Response);

      const result = await api.listOpenPRs("test", "repo1");
      expect(result).toEqual(prs);
      expect(global.fetch).toHaveBeenCalledWith("/api/repos/test/repo1/prs", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("Error Handling", () => {
    it("should throw ApiError for non-OK responses", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ error: "Not found" }),
      } as Response);

      await expect(api.getSettings()).rejects.toThrow(ApiError);
    });

    it("should set isRateLimit for 429 errors", async () => {
      const headers = new Headers();
      headers.set("Retry-After", "60");
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers,
        json: async () => ({ error: "Rate limited" }),
      } as Response);

      try {
        await api.getSettings();
        expect.fail("Should have thrown ApiError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.isRateLimit).toBe(true);
        expect(apiError.retryAfter).toBe(60);
      }
    });

    it("should include requestId from headers", async () => {
      const headers = new Headers();
      headers.set("X-Request-Id", "req-123");
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers,
        json: async () => ({ error: "Bad request" }),
      } as Response);

      try {
        await api.getSettings();
        expect.fail("Should have thrown ApiError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.requestId).toBe("req-123");
      }
    });

    it("should retry 5xx errors up to 2 times", async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: "Internal server error" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: "Internal server error" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ theme: "dark" }),
        } as Response);

      const result = await api.getSettings();
      expect(result).toEqual({ theme: "dark" });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries for 5xx errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: "Internal server error" }),
      } as Response);

      try {
        await api.getSettings();
        expect.fail("Should have thrown ApiError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        const apiError = error as ApiError;
        expect(apiError.status).toBe(500);
      }
    });

    it("should not retry 4xx errors", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: "Bad request" }),
      } as Response);

      try {
        await api.getSettings();
        expect.fail("Should have thrown ApiError");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      }
    });

  });

  describe("SSE Connection (connectToJobProgress)", () => {
    beforeEach(() => {
      // Reset EventSource mock
      global.EventSource = vi.fn() as any;
    });

    it("should create EventSource connection and return cleanup function", () => {
      const mockClose = vi.fn();
      (global.EventSource as any).mockImplementation(function (this: any) {
        this.close = mockClose;
        this.onmessage = null;
        this.onerror = null;
      });

      const onMessage = vi.fn();
      const cleanup = api.connectToJobProgress("job-123", onMessage);

      expect(global.EventSource).toHaveBeenCalledWith("/api/jobs/job-123/progress");
      expect(global.EventSource).toHaveBeenCalledTimes(1);

      cleanup();

      expect(mockClose).toHaveBeenCalled();
    });

    it("should call onMessage when message received", () => {
      let storedOnMessage: ((event: MessageEvent) => void) | null = null;
      const mockClose = vi.fn();

      (global.EventSource as any).mockImplementation(function (this: any) {
        this.close = mockClose;
        Object.defineProperty(this, "onmessage", {
          set(value: (event: MessageEvent) => void) {
            storedOnMessage = value;
          },
          get() {
            return storedOnMessage;
          },
        });
        this.onerror = null;
      });

      const onMessage = vi.fn();
      api.connectToJobProgress("job-123", onMessage);

      const mockData = { id: "job-123", status: "running" };
      if (storedOnMessage) {
        (storedOnMessage as (event: MessageEvent) => void)({ data: JSON.stringify(mockData) } as MessageEvent);
      }

      expect(onMessage).toHaveBeenCalledWith(mockData);
    });

    it("should call onError after exhausting reconnection retries", () => {
      let storedOnError: ((event: Event) => void) | null = null;
      const mockClose = vi.fn();
      let createCount = 0;

      vi.useFakeTimers();

      (global.EventSource as any).mockImplementation(function (this: any) {
        createCount++;
        this.close = mockClose;
        this.onmessage = null;
        Object.defineProperty(this, "onerror", {
          set(value: (event: Event) => void) {
            storedOnError = value;
          },
          get() {
            return storedOnError;
          },
        });
      });

      const onError = vi.fn();
      const cleanup = api.connectToJobProgress("job-123", vi.fn(), onError);

      // Trigger initial connection error, then 5 retries (6 total attempts)
      for (let i = 0; i < 5; i++) {
        if (storedOnError) {
          (storedOnError as (event: Event) => void)(new Event("error"));
        }
        vi.advanceTimersByTime(20000);
      }
      // Trigger the 6th connection error which exhausts retries
      if (storedOnError) {
        (storedOnError as (event: Event) => void)(new Event("error"));
      }

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "SSE connection failed after maximum retries" }));
      expect(createCount).toBeGreaterThanOrEqual(2);

      cleanup();
      vi.useRealTimers();
    });

    it("should handle EventSource not supported in environment", () => {
      // Temporarily unset EventSource
      const originalEventSource = global.EventSource;
      delete (global as any).EventSource;

      const onError = vi.fn();
      api.connectToJobProgress("job-123", vi.fn(), onError);

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "EventSource is not supported in this environment" })
      );

      // Restore EventSource
      global.EventSource = originalEventSource;
    });
  });

  describe("Additional API Methods", () => {
    it("should submit feedback for buddy", async () => {
      const mockResponse = { recorded: true };
      const feedbackData = {
        reviewId: "review-123",
        commentId: "comment-456",
        wasHelpful: true,
        userResponse: "Very helpful!",
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.submitFeedback("buddy-123", feedbackData);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy-123/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
        signal: undefined,
      });
    });

    it("should compare two buddies", async () => {
      const mockResponse = {
        score: 0.85,
        sharedKeywords: ["typescript", "testing"],
        sharedRepos: ["owner/repo"],
        soulOverlap: 0.9,
        analysis: {
          philosophySimilarity: 0.8,
          expertiseOverlap: 0.75,
          commonPatterns: ["functional programming"],
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.compareBuddies("buddy-1", "buddy-2");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy-1/compare/buddy-2", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should get metrics with date range", async () => {
      const mockResponse = {
        totalReviews: 100,
        completedReviews: 95,
        errorCount: 5,
        errorRate: 0.05,
        averageDurationMs: 5000,
        averageTokensPerReview: 1000,
        perBuddy: {},
        perRepo: {},
        since: "2024-01-01",
        until: "2024-01-31",
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.getMetrics({ since: "2024-01-01", until: "2024-01-31" });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/metrics?since=2024-01-01&until=2024-01-31", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should cancel job", async () => {
      const mockResponse = { success: true, jobId: "job-123", status: "cancelled" };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.cancelJob("job-123");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/jobs/job-123/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should list jobs with pagination", async () => {
      const mockResponse = {
        data: [
          {
            id: "job-1",
            type: "review" as const,
            status: "completed" as const,
            repoId: "owner/repo",
            buddyId: "buddy-1",
            prNumber: 123,
            createdAt: "2024-01-01",
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await api.listJobs({ page: 1, limit: 20 });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith("/api/jobs?page=1&limit=20", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("URL Encoding", () => {
    it("should properly encode buddy ID with spaces", async () => {
      const mockBuddy = { id: "buddy with spaces", username: "test" };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBuddy,
      } as Response);

      await api.getBuddy("buddy with spaces");

      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy%20with%20spaces", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should properly encode repo ID with spaces and slashes", async () => {
      const mockRepo = { id: "owner/repo with spaces" };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockRepo,
      } as Response);

      await api.updateRepo("owner/repo with spaces", { autoReview: true });

      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo%20with%20spaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReview: true }),
        signal: undefined,
      });
    });

    it("should properly encode rule ID with slashes", async () => {
      const mockResponse = { deleted: "rule-123" };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await api.deleteRepoRule("owner/repo", "rule with/slashes");

      expect(global.fetch).toHaveBeenCalledWith("/api/repos/owner/repo/rules/rule%20with%2Fslashes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });

    it("should properly encode comparison buddy IDs", async () => {
      const mockResponse = {
        score: 0.5,
        sharedKeywords: [],
        sharedRepos: [],
        soulOverlap: 0.5,
        analysis: {
          philosophySimilarity: 0.5,
          expertiseOverlap: 0.5,
          commonPatterns: [],
        },
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await api.compareBuddies("buddy one", "buddy two");

      expect(global.fetch).toHaveBeenCalledWith("/api/buddies/buddy%20one/compare/buddy%20two", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("ApiError Type Properties", () => {
    it("should be an Error subclass", () => {
      const error = new ApiError(500, "Test error");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
    });

    it("should have status property", () => {
      const error = new ApiError(404, "Not found");
      expect(error.status).toBe(404);
    });

    it("should have requestId property", () => {
      const error = new ApiError(500, "Server error", "req-123");
      expect(error.requestId).toBe("req-123");
    });

    it("should have isRateLimit property", () => {
      const error = new ApiError(429, "Rate limited", undefined, true);
      expect(error.isRateLimit).toBe(true);
    });

    it("should have retryAfter property", () => {
      const error = new ApiError(429, "Rate limited", undefined, true, 60);
      expect(error.retryAfter).toBe(60);
    });

    it("should default isRateLimit to false", () => {
      const error = new ApiError(500, "Server error");
      expect(error.isRateLimit).toBe(false);
    });

    it("should have correct name property", () => {
      const error = new ApiError(500, "Server error");
      expect(error.name).toBe("ApiError");
    });
  });
});
