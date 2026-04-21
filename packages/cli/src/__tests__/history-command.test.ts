import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReviewHistory } from "../commands/history.js";
import type { HistoryDeps } from "../commands/history.js";

function makeMockDeps(overrides: Partial<HistoryDeps> = {}): HistoryDeps {
  return {
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    joinPath: (...parts: string[]) => parts.join("/"),
    getHomeDir: () => "/home/testuser",
    ...overrides,
  };
}

function makeJob(
  id: string,
  status: string,
  repoId: string,
  buddyId: string,
  prNumber: number,
  createdAt: string,
  commentCount = 0
) {
  return {
    type: "review",
    data: {
      id,
      status,
      repoId,
      buddyId,
      prNumber,
      createdAt,
      completedAt: createdAt,
      result: { comments: Array(commentCount).fill({}) },
    },
  };
}

function setupMockFiles(jobs: ReturnType<typeof makeJob>[], deps: HistoryDeps) {
  (deps.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(jobs.map((j) => `${j.data.id}.json`));
  (deps.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
    const name = p.split("/").pop()?.replace(".json", "");
    const job = jobs.find((j) => j.data.id === name);
    return job ? JSON.stringify(job) : "";
  });
}

describe("CLI history command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchReviewHistory", () => {
    it("lists review history sorted by date descending", async () => {
      const jobs = [
        makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z", 5),
        makeJob("job-2", "completed", "owner/repo", "buddy-2", 124, "2026-04-16T10:00:00Z", 3),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("job-2");
      expect(results[1].id).toBe("job-1");
      expect(results[0].commentCount).toBe(3);
      expect(results[1].commentCount).toBe(5);
    });

    it("limits results to last 10 reviews", async () => {
      const jobs = Array.from({ length: 15 }, (_, i) =>
        makeJob(`job-${i}`, "completed", "owner/repo", "buddy-1", 100 + i, new Date(Date.now() - i * 1000000).toISOString(), i)
      );
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(10);
    });

    it("handles empty history gracefully", async () => {
      const deps = makeMockDeps();
      const results = await fetchReviewHistory({ json: false }, deps);
      expect(results).toHaveLength(0);
    });

    it("excludes queued jobs from history", async () => {
      const jobs = [
        makeJob("job-1", "queued", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo", "buddy-1", 124, "2026-04-16T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("job-2");
    });

    it("excludes non-review job types", async () => {
      const analysisJob = JSON.stringify({
        type: "analysis",
        data: { id: "job-1", status: "completed", createdAt: "2026-04-15T10:00:00Z" },
      });
      const reviewJob = JSON.stringify(makeJob("job-2", "completed", "owner/repo", "buddy-1", 123, "2026-04-16T10:00:00Z"));

      const deps = makeMockDeps();
      (deps.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(["job-1.json", "job-2.json"]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
        if (p.endsWith("job-1.json")) return analysisJob;
        if (p.endsWith("job-2.json")) return reviewJob;
        return "";
      });

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("job-2");
    });

    it("filters by --repo option", async () => {
      const jobs = [
        makeJob("job-1", "completed", "owner/repo1", "buddy-1", 123, "2026-04-15T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo2", "buddy-1", 124, "2026-04-16T10:00:00Z"),
        makeJob("job-3", "completed", "owner/repo1", "buddy-2", 125, "2026-04-17T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false, repo: "owner/repo1" }, deps);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.repo === "owner/repo1")).toBe(true);
    });

    it("filters by --buddy option", async () => {
      const jobs = [
        makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo", "buddy-2", 124, "2026-04-16T10:00:00Z"),
        makeJob("job-3", "completed", "owner/repo", "buddy-1", 125, "2026-04-17T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false, buddy: "buddy-1" }, deps);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.buddyId === "buddy-1")).toBe(true);
    });

    it("filters by --since date", async () => {
      const jobs = [
        makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-10T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo", "buddy-1", 124, "2026-04-15T10:00:00Z"),
        makeJob("job-3", "completed", "owner/repo", "buddy-1", 125, "2026-04-20T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false, since: "2026-04-15" }, deps);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toEqual(["job-3", "job-2"]);
    });

    it("filters by --until date", async () => {
      const jobs = [
        makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-10T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo", "buddy-1", 124, "2026-04-15T10:00:00Z"),
        makeJob("job-3", "completed", "owner/repo", "buddy-1", 125, "2026-04-20T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false, until: "2026-04-15" }, deps);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toEqual(["job-2", "job-1"]);
    });

    it("rejects invalid --since date format", async () => {
      const deps = makeMockDeps();
      await expect(fetchReviewHistory({ json: false, since: "not-a-date" }, deps)).rejects.toThrow("Invalid date format");
    });

    it("rejects invalid --until date format", async () => {
      const deps = makeMockDeps();
      await expect(fetchReviewHistory({ json: false, until: "not-a-date" }, deps)).rejects.toThrow("Invalid date format");
    });

    it("skips non-JSON files in jobs directory", async () => {
      const deps = makeMockDeps();
      (deps.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(["readme.txt", ".hidden", "job-1.json"]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
        if (p.endsWith("job-1.json")) {
          return JSON.stringify(makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z"));
        }
        return "";
      });

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(1);
      expect(deps.readFile).not.toHaveBeenCalledWith(expect.stringContaining("readme.txt"));
    });

    it("skips malformed JSON files gracefully", async () => {
      const deps = makeMockDeps();
      (deps.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(["good.json", "bad.json"]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
        if (p.endsWith("good.json")) {
          return JSON.stringify(makeJob("job-1", "completed", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z"));
        }
        return "not valid json {{{";
      });

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("job-1");
    });

    it("handles jobs with missing comments gracefully", async () => {
      const job = {
        type: "review",
        data: {
          id: "job-1",
          status: "completed",
          repoId: "owner/repo",
          buddyId: "buddy-1",
          prNumber: 123,
          createdAt: "2026-04-15T10:00:00Z",
          completedAt: "2026-04-15T10:00:00Z",
        },
      };

      const deps = makeMockDeps();
      (deps.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(["job-1.json"]);
      (deps.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify(job));

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(1);
      expect(results[0].commentCount).toBe(0);
    });

    it("includes failed reviews in history", async () => {
      const jobs = [
        makeJob("job-1", "failed", "owner/repo", "buddy-1", 123, "2026-04-15T10:00:00Z"),
        makeJob("job-2", "completed", "owner/repo", "buddy-1", 124, "2026-04-16T10:00:00Z"),
      ];
      const deps = makeMockDeps();
      setupMockFiles(jobs, deps);

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(2);
      expect(results[0].state).toBe("completed");
      expect(results[1].state).toBe("failed");
    });

    it("reads jobs from the correct directory", async () => {
      const deps = makeMockDeps();

      await fetchReviewHistory({ json: false }, deps);

      expect(deps.readdir).toHaveBeenCalledWith("/home/testuser/.agent-buddy/jobs");
    });

    it("handles readdir errors gracefully", async () => {
      const deps = makeMockDeps({
        readdir: vi.fn().mockRejectedValue(new Error("ENOENT")),
      });

      const results = await fetchReviewHistory({ json: false }, deps);

      expect(results).toHaveLength(0);
    });
  });
});
