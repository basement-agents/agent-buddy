import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analysisJobs } from "../jobs/state.js";
import { processAnalysisJob, processUpdateJob } from "../jobs/analysis.js";

const mockGetPRsReviewedBy = vi.fn();
const mockReadProfile = vi.fn();
const mockCreateBuddy = vi.fn();
const mockUpdateBuddy = vi.fn();

vi.mock("@agent-buddy/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-buddy/core")>();
  return {
    ...actual,
    GitHubClient: vi.fn().mockImplementation(function () {
      return { getPRsReviewedBy: mockGetPRsReviewedBy };
    }),
    BuddyFileSystemStorage: vi.fn().mockImplementation(function () {
      return { readProfile: mockReadProfile };
    }),
    AnalysisPipeline: vi.fn().mockImplementation(function () {
      return { createBuddy: mockCreateBuddy, updateBuddy: mockUpdateBuddy };
    }),
    AnthropicClaudeProvider: class {},
    createLLMProvider: vi.fn().mockImplementation(() => ({})),
    loadConfig: vi.fn().mockResolvedValue({ llm: { provider: "anthropic", apiKey: "test" } }),
    Logger: class {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_prefix?: string) {}
      error = vi.fn();
      info = vi.fn();
      warn = vi.fn();
      debug = vi.fn();
      child = vi.fn();
      structured = vi.fn();
    },
  };
});

describe("analysis-job processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPRsReviewedBy.mockReset();
    mockReadProfile.mockReset();
    mockCreateBuddy.mockReset();
    mockUpdateBuddy.mockReset();
  });

  afterEach(() => {
    analysisJobs.clear();
  });

  describe("processAnalysisJob", () => {
    const mockJobId = "job-1";
    const mockUsername = "reviewer";
    const mockOwner = "org";
    const mockRepo = "repo";
    const mockToken = "ghp_token";
    const mockMaxPrs = 10;

    const mockReviewData = [
      {
        pr: {
          id: 1,
          number: 100,
          title: "Test PR",
          body: "Test body",
          state: "closed" as const,
          draft: false,
          author: { login: "author", id: 1, avatarUrl: "", url: "" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          base: { label: "main", ref: "main", sha: "abc", repo: { owner: {} as any, name: "repo", fullName: "org/repo" } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          head: { label: "feature", ref: "feature", sha: "def", repo: { owner: {} as any, name: "repo", fullName: "org/repo" } },
          files: [],
          additions: 10,
          deletions: 5,
          changedFiles: 2,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          url: "https://github.com/org/repo/pull/100",
        },
        reviews: [
          {
            id: 1,
            author: { login: mockUsername, id: 1, avatarUrl: "", url: "" },
            body: "Looks good!",
            state: "approved" as const,
            submittedAt: "2024-01-01T00:00:00Z",
            comments: [],
          },
        ],
        comments: [],
      },
    ];

    beforeEach(() => {
      analysisJobs.set(mockJobId, {
        id: mockJobId,
        buddyId: mockUsername,
        repo: `${mockOwner}/${mockRepo}`,
        status: "queued",
        createdAt: new Date(),
      });
    });

    it("should successfully process analysis job and mark as completed", async () => {
      mockGetPRsReviewedBy.mockResolvedValue(mockReviewData);
      mockCreateBuddy.mockResolvedValue({
        id: mockUsername,
        username: mockUsername,
        soul: "# Review Philosophy",
        user: "# Profile",
        memory: "# Memory Index",
        sourceRepos: [`${mockOwner}/${mockRepo}`],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await processAnalysisJob(mockJobId, mockUsername, mockOwner, mockRepo, mockToken, mockMaxPrs);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("completed");
      expect(job?.progressStage).toBe("completed");
      expect(job?.progressPercentage).toBe(100);
      expect(job?.progress).toBe("Done");
      expect(job?.progressDetail).toBe("Buddy profile created successfully");
      expect(job?.completedAt).toBeInstanceOf(Date);

      expect(mockGetPRsReviewedBy).toHaveBeenCalledWith(mockOwner, mockRepo, mockUsername, undefined, mockMaxPrs);
      expect(mockCreateBuddy).toHaveBeenCalledWith(
        mockUsername,
        mockReviewData,
        mockOwner,
        mockRepo,
        expect.objectContaining({ report: expect.any(Function) })
      );
    });

    it("should fail when no reviews are found", async () => {
      mockGetPRsReviewedBy.mockResolvedValue([]);

      await processAnalysisJob(mockJobId, mockUsername, mockOwner, mockRepo, mockToken, mockMaxPrs);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("No reviews found for this user");
      expect(job?.progressStage).toBe("failed");
      expect(job?.progressDetail).toBe("Failed: No reviews found for this user");
      expect(job?.completedAt).toBeInstanceOf(Date);
    });

    it("should handle pipeline errors and mark job as failed", async () => {
      mockGetPRsReviewedBy.mockResolvedValue(mockReviewData);
      mockCreateBuddy.mockRejectedValue(new Error("LLM API failure"));

      await processAnalysisJob(mockJobId, mockUsername, mockOwner, mockRepo, mockToken, mockMaxPrs);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("LLM API failure");
      expect(job?.progressStage).toBe("failed");
      expect(job?.progressDetail).toBe("Failed: LLM API failure");
    });

    it("should limit reviews to maxPrs", async () => {
      const manyReviews = Array.from({ length: 20 }, (_, i) => ({
        pr: {
          ...mockReviewData[0].pr,
          id: i,
          number: 100 + i,
        },
        reviews: mockReviewData[0].reviews,
        comments: mockReviewData[0].comments,
      }));

      mockGetPRsReviewedBy.mockResolvedValue(manyReviews);
      mockCreateBuddy.mockResolvedValue({
        id: mockUsername,
        username: mockUsername,
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [`${mockOwner}/${mockRepo}`],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await processAnalysisJob(mockJobId, mockUsername, mockOwner, mockRepo, mockToken, mockMaxPrs);

      expect(mockCreateBuddy).toHaveBeenCalledWith(
        mockUsername,
        manyReviews,
        mockOwner,
        mockRepo,
        expect.objectContaining({ report: expect.any(Function) })
      );
    });
  });

  describe("processUpdateJob", () => {
    const mockJobId = "job-2";
    const mockBuddyId = "reviewer";
    const mockRepoStr = "org/repo";
    const mockToken = "ghp_token";

    const mockProfile = {
      id: mockBuddyId,
      username: mockBuddyId,
      soul: "# Review Philosophy",
      user: "# Profile",
      memory: "# Memory Index",
      sourceRepos: ["org/repo", "other/repo"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockReviewData = [
      {
        pr: {
          id: 1,
          number: 200,
          title: "New PR",
          body: "New body",
          state: "closed" as const,
          draft: false,
          author: { login: "author", id: 1, avatarUrl: "", url: "" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          base: { label: "main", ref: "main", sha: "abc", repo: { owner: {} as any, name: "repo", fullName: "org/repo" } },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          head: { label: "feature", ref: "feature", sha: "def", repo: { owner: {} as any, name: "repo", fullName: "org/repo" } },
          files: [],
          additions: 5,
          deletions: 2,
          changedFiles: 1,
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
          url: "https://github.com/org/repo/pull/200",
        },
        reviews: [
          {
            id: 2,
            author: { login: mockBuddyId, id: 1, avatarUrl: "", url: "" },
            body: "Approved",
            state: "approved" as const,
            submittedAt: "2024-01-02T00:00:00Z",
            comments: [],
          },
        ],
        comments: [],
      },
    ];

    beforeEach(() => {
      analysisJobs.set(mockJobId, {
        id: mockJobId,
        buddyId: mockBuddyId,
        repo: mockRepoStr,
        status: "queued",
        createdAt: new Date(),
      });
    });

    it("should successfully update buddy from specified repo", async () => {
      mockReadProfile.mockResolvedValue(mockProfile);
      mockGetPRsReviewedBy.mockResolvedValue(mockReviewData);
      mockUpdateBuddy.mockResolvedValue({
        ...mockProfile,
        updatedAt: new Date(),
      });

      await processUpdateJob(mockJobId, mockBuddyId, mockRepoStr, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("completed");
      expect(job?.progressStage).toBe("completed");
      expect(job?.progressPercentage).toBe(100);
      expect(job?.completedAt).toBeInstanceOf(Date);

      expect(mockReadProfile).toHaveBeenCalledWith(mockBuddyId);
      expect(mockGetPRsReviewedBy).toHaveBeenCalledWith("org", "repo", mockBuddyId, undefined, 50);
      expect(mockUpdateBuddy).toHaveBeenCalledWith(
        mockBuddyId,
        mockReviewData,
        "org",
        "repo",
        undefined,
        expect.objectContaining({ report: expect.any(Function) })
      );
    });

    it("should fail when buddy not found", async () => {
      mockReadProfile.mockResolvedValue(null);

      await processUpdateJob(mockJobId, mockBuddyId, mockRepoStr, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("Buddy not found");
      expect(job?.progressStage).toBe("failed");
    });

    it("should fail when profile has no source repos", async () => {
      mockReadProfile.mockResolvedValue({
        ...mockProfile,
        sourceRepos: [],
      });

      await processUpdateJob(mockJobId, mockBuddyId, undefined, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("No source repos");
    });

    it("should handle malformed repo strings gracefully", async () => {
      mockReadProfile.mockResolvedValue({
        ...mockProfile,
        sourceRepos: ["org/repo", "invalid-repo", "also/invalid/format"],
      });
      mockGetPRsReviewedBy.mockResolvedValue([]);
      mockUpdateBuddy.mockResolvedValue(mockProfile);

      await processUpdateJob(mockJobId, mockBuddyId, undefined, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("completed");
      // Should only call for valid repo strings that split correctly into owner/repo
      expect(mockGetPRsReviewedBy).toHaveBeenCalledTimes(2); // "org/repo" and "other/repo" are valid
    });

    it("should skip repos with no reviews", async () => {
      mockReadProfile.mockResolvedValue(mockProfile);
      mockGetPRsReviewedBy.mockResolvedValue([]);

      await processUpdateJob(mockJobId, mockBuddyId, mockRepoStr, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("completed");
      expect(job?.progressDetail).toContain("Updated from 0 reviews");
    });

    it("should handle pipeline errors during update", async () => {
      mockReadProfile.mockResolvedValue(mockProfile);
      mockGetPRsReviewedBy.mockResolvedValue(mockReviewData);
      mockUpdateBuddy.mockRejectedValue(new Error("Update failed"));

      await processUpdateJob(mockJobId, mockBuddyId, mockRepoStr, mockToken);

      const job = analysisJobs.get(mockJobId);
      expect(job?.status).toBe("failed");
      expect(job?.error).toBe("Update failed");
    });
  });

  describe("reporter forwarding to analysis job state", () => {
    it("processAnalysisJob propagates reporter updates (subStep, model, elapsedMs, fraction → 30~95% mapping)", async () => {
      const jobId = "job-rep";
      const username = "reviewer";
      const owner = "org";
      const repo = "repo";

      analysisJobs.set(jobId, {
        id: jobId, buddyId: username, repo: `${owner}/${repo}`,
        status: "queued", createdAt: new Date(),
      });

      const mockReviewData = [
        { pr: { number: 1, title: "P", state: "closed" } as never, reviews: [], comments: [] },
      ];
      mockGetPRsReviewedBy.mockResolvedValue(mockReviewData);

      let pctAfterFraction = 0;
      mockCreateBuddy.mockImplementation(async (..._args: unknown[]) => {
        const reporter = _args[4] as { report: (u: Record<string, unknown>) => void };
        reporter.report({ stage: "soul_profile_llm", subStep: "memory 1/2", model: "claude-3", elapsedMs: 99 });
        reporter.report({ fraction: 0.5 });
        pctAfterFraction = analysisJobs.get(jobId)!.progressPercentage ?? 0;
        return {
          id: username, username, soul: "", user: "", memory: "", sourceRepos: [`${owner}/${repo}`],
          createdAt: new Date(), updatedAt: new Date(),
        };
      });

      await processAnalysisJob(jobId, username, owner, repo, "tok", 10);

      const job = analysisJobs.get(jobId);
      expect(job?.subStep).toBe("memory 1/2");
      expect(job?.currentModel).toBe("claude-3");
      expect(job?.elapsedMs).toBe(99);
      expect(pctAfterFraction).toBe(63);
      expect(job?.status).toBe("completed");
      expect(job?.progressPercentage).toBe(100);
    });

    it("processUpdateJob keeps progressPercentage monotonic across multiple repos", async () => {
      const jobId = "job-update-mono";
      const buddyId = "reviewer";
      const token = "tok";

      analysisJobs.set(jobId, {
        id: jobId, buddyId, repo: "n/a",
        status: "queued", createdAt: new Date(),
      });

      const profile = {
        id: buddyId, username: buddyId,
        soul: "", user: "", memory: "",
        sourceRepos: ["org/a", "org/b"],
        createdAt: new Date(), updatedAt: new Date(),
      };
      mockReadProfile.mockResolvedValue(profile);
      mockGetPRsReviewedBy.mockResolvedValue([
        { pr: { number: 1, title: "x", state: "closed" } as never, reviews: [], comments: [] },
      ]);

      const observed: number[] = [];
      mockUpdateBuddy.mockImplementation(async (..._args: unknown[]) => {
        const reporter = _args[5] as { report: (u: Record<string, unknown>) => void };
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          reporter.report({ fraction: f });
          observed.push(analysisJobs.get(jobId)!.progressPercentage ?? -1);
        }
        return profile;
      });

      await processUpdateJob(jobId, buddyId, undefined, token);

      for (let i = 1; i < observed.length; i++) {
        expect(observed[i]).toBeGreaterThanOrEqual(observed[i - 1]);
      }
      const job = analysisJobs.get(jobId);
      expect(job?.status).toBe("completed");
      expect(job?.progressPercentage).toBe(100);
    });
  });
});
