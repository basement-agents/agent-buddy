import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalysisPipeline } from "../analysis/pipeline.js";
import type { LLMProvider } from "../llm/types.js";
import type { AnalysisResult, PullRequest, PRReview, ReviewComment as GHReviewComment } from "../index.js";
import { BuddyFileSystemStorage } from "../buddy/storage.js";

// Mock at top level as required
const mockWriteProfile = vi.fn().mockResolvedValue(undefined);
const mockAddMemoryEntry = vi.fn().mockResolvedValue(undefined);
const mockReadProfile = vi.fn().mockResolvedValue({
  id: "test-user",
  username: "test-user",
  soul: "Original soul",
  user: "Original user",
  memory: "# Memory Index\n",
  sourceRepos: ["org/repo"],
  createdAt: new Date(),
  updatedAt: new Date(),
});

vi.mock("../buddy/storage.js", () => ({
  BuddyFileSystemStorage: class {
    writeProfile = mockWriteProfile;
    addMemoryEntry = mockAddMemoryEntry;
    readProfile = mockReadProfile;
  },
}));

// Mock learning feedback functions
vi.mock("../learning/feedback.js", () => ({
  getFeedbackSummary: vi.fn().mockResolvedValue({
    helpful: 5,
    notHelpful: 2,
    patterns: ["helpful pattern 1", "helpful pattern 2"],
  }),
  getRecentFeedback: vi.fn().mockResolvedValue([
    {
      buddyId: "test-user",
      reviewId: "r1",
      commentId: "c1",
      wasHelpful: true,
      userResponse: "Very helpful",
      timestamp: new Date().toISOString(),
    },
    {
      buddyId: "test-user",
      reviewId: "r2",
      commentId: "c2",
      wasHelpful: false,
      userResponse: "Too verbose",
      timestamp: new Date().toISOString(),
    },
  ]),
}));

// Mock LLM prompts
vi.mock("../llm/prompts.js", () => ({
  buildAnalysisPrompt: vi.fn(() => "Mock analysis prompt"),
  buildSoulPrompt: vi.fn(() => "Mock soul prompt"),
  buildUserPrompt: vi.fn(() => "Mock user prompt"),
}));

describe("AnalysisPipeline", () => {
  let mockLLM: LLMProvider;
  let mockStorage: InstanceType<typeof BuddyFileSystemStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLM = {
      generate: vi.fn().mockResolvedValue({ content: "Generated text" }),
      generateStructured: vi.fn().mockResolvedValue({
        content: {
          username: "test-user",
          reviewStyle: {
            thoroughness: "standard",
            focus: ["correctness", "readability"],
            typicalSeverity: "warning",
            severityDistribution: {
              info: 10,
              suggestion: 15,
              warning: 20,
              error: 5,
            },
            approvalCriteria: ["Tests pass", "No console.log"],
            commentStyle: "moderate",
            codeExampleUsage: "sometimes",
          },
          thinkingPatterns: [],
          topIssues: [],
          communicationTone: {
            formality: "friendly",
            encouragement: "moderate",
            directness: "balanced",
            typicalPhrases: [],
          },
          stats: {
            totalPRsAnalyzed: 10,
            totalComments: 50,
            averageCommentsPerPR: 5,
            uniqueRepos: 2,
            dateRange: { start: new Date(), end: new Date() },
          },
          preferredLanguages: ["TypeScript", "Python"],
          preferredFrameworks: ["React", "Express"],
          reviewPatterns: [
            {
              pattern: "Type safety",
              description: "Always checks for proper typing",
              frequency: "frequent",
              examples: ["Add type annotation", "Fix type error"],
            },
          ],
        },
      }),
    } as unknown as LLMProvider;

    // Re-create mock storage instance
    mockStorage = new BuddyFileSystemStorage();
  });

  describe("analyzePRReview", () => {
    it("should analyze a single PR review", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const pr: PullRequest = {
        number: 123,
        title: "Test PR",
        body: "Test body",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 10,
        deletions: 5,
        changedFiles: 2,
      };

      const reviews: PRReview[] = [
        {
          id: 1,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          state: "approved",
          body: "Looks good!",
          submittedAt: new Date(),
        },
      ];

      const comments: GHReviewComment[] = [];

      const result = await pipeline.analyzePRReview(pr, reviews, comments);

      expect(result).toBeDefined();
      expect(result.username).toBe("test-user");
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(mockLLM.generateStructured).toHaveBeenCalled();
    });

    it("should handle empty review data", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const pr: PullRequest = {
        number: 123,
        title: "Test PR",
        body: "",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      };

      const result = await pipeline.analyzePRReview(pr, [], []);

      expect(result).toBeDefined();
      expect(mockLLM.generateStructured).toHaveBeenCalled();
    });
  });

  describe("analyzeReviewerHistory", () => {
    it("should analyze review history with valid data", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "First PR",
            body: "Body 1",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "LGTM",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 2,
            title: "Second PR",
            body: "Body 2",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 20,
            deletions: 10,
            changedFiles: 3,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "changes_requested" as const,
              body: "Please fix",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.analyzeReviewerHistory(reviewData);

      expect(result).toBeDefined();
      expect(result.username).toBe("test-user");
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(mockLLM.generateStructured).toHaveBeenCalledTimes(1);
    });

    it("should handle empty review history", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const result = await pipeline.analyzeReviewerHistory([]);

      expect(result).toBeDefined();
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(mockLLM.generateStructured).toHaveBeenCalled();
    });

    it("should handle LLM errors gracefully", async () => {
      const errorLLM = {
        generateStructured: vi.fn().mockRejectedValue(new Error("LLM API error")),
      } as unknown as LLMProvider;

      const pipeline = new AnalysisPipeline(errorLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          },
          reviews: [],
          comments: [],
        },
      ];

      await expect(pipeline.analyzeReviewerHistory(reviewData)).rejects.toThrow(
        "analyzeReviewerHistory failed for 1 review(s): LLM API error"
      );
    });

    it("should wrap analyzePRReview errors with descriptive message", async () => {
      const originalError = new Error("Network timeout");
      const errorLLM = {
        generateStructured: vi.fn().mockRejectedValue(originalError),
      } as unknown as LLMProvider;

      const pipeline = new AnalysisPipeline(errorLLM, mockStorage);

      const pr: PullRequest = {
        number: 42,
        title: "Test PR",
        body: "",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 0,
        deletions: 0,
        changedFiles: 0,
      };

      await expect(pipeline.analyzePRReview(pr, [], [])).rejects.toThrow(
        "analyzePRReview failed for PR #42: Network timeout"
      );

      try {
        await pipeline.analyzePRReview(pr, [], []);
      } catch (error) {
        expect((error as Error).cause).toBe(originalError);
        return;
      }
      expect.unreachable("Should have thrown");
    });

    it("should wrap analyzeReviewerHistory errors with descriptive message and preserve cause", async () => {
      const originalError = new Error("Rate limited");
      const errorLLM = {
        generateStructured: vi.fn().mockRejectedValue(originalError),
      } as unknown as LLMProvider;

      const pipeline = new AnalysisPipeline(errorLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          },
          reviews: [],
          comments: [],
        },
      ];

      await expect(pipeline.analyzeReviewerHistory(reviewData)).rejects.toThrow(
        "analyzeReviewerHistory failed for 1 review(s): Rate limited"
      );

      try {
        await pipeline.analyzeReviewerHistory(reviewData);
      } catch (error) {
        expect((error as Error).cause).toBe(originalError);
        return;
      }
      expect.unreachable("Should have thrown");
    });
  });

  describe("buildSoulProfile", () => {
    it("should build soul profile from analysis", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const analysisResult: AnalysisResult = {
        username: "test-user",
        reviewStyle: {
          thoroughness: "standard",
          focus: ["correctness"],
          typicalSeverity: "warning",
          severityDistribution: {
            info: 0,
            suggestion: 0,
            warning: 0,
            error: 0,
          },
          approvalCriteria: [],
          commentStyle: "moderate",
          codeExampleUsage: "sometimes",
        },
        thinkingPatterns: [],
        topIssues: [],
        communicationTone: {
          formality: "friendly",
          encouragement: "moderate",
          directness: "balanced",
          typicalPhrases: [],
        },
        stats: {
          totalPRsAnalyzed: 1,
          totalComments: 5,
          averageCommentsPerPR: 5,
          uniqueRepos: 1,
          dateRange: { start: new Date(), end: new Date() },
        },
        preferredLanguages: [],
        preferredFrameworks: [],
        reviewPatterns: [],
        generatedAt: new Date(),
      };

      const result = await pipeline.buildSoulProfile(analysisResult, "test-user");

      expect(result).toBe("Generated text");
      expect(mockLLM.generate).toHaveBeenCalled();
    });
  });

  describe("buildUserProfile", () => {
    it("should build user profile from analysis", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const analysisResult: AnalysisResult = {
        username: "test-user",
        reviewStyle: {
          thoroughness: "standard",
          focus: ["correctness"],
          typicalSeverity: "warning",
          severityDistribution: {
            info: 0,
            suggestion: 0,
            warning: 0,
            error: 0,
          },
          approvalCriteria: [],
          commentStyle: "moderate",
          codeExampleUsage: "sometimes",
        },
        thinkingPatterns: [],
        topIssues: [],
        communicationTone: {
          formality: "friendly",
          encouragement: "moderate",
          directness: "balanced",
          typicalPhrases: [],
        },
        stats: {
          totalPRsAnalyzed: 1,
          totalComments: 5,
          averageCommentsPerPR: 5,
          uniqueRepos: 1,
          dateRange: { start: new Date(), end: new Date() },
        },
        preferredLanguages: [],
        preferredFrameworks: [],
        reviewPatterns: [],
        generatedAt: new Date(),
      };

      const result = await pipeline.buildUserProfile(analysisResult, "test-user");

      expect(result).toBe("Generated text");
      expect(mockLLM.generate).toHaveBeenCalled();
    });
  });

  describe("createMemoryEntry", () => {
    it("should create memory entry with key learnings", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const pr: PullRequest = {
        number: 123,
        title: "Test PR",
        body: "Test body",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 10,
        deletions: 5,
        changedFiles: 2,
      };

      const reviews: PRReview[] = [
        {
          id: 1,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          state: "changes_requested",
          body: "Please fix this",
          submittedAt: new Date(),
        },
      ];

      const comments: GHReviewComment[] = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
        path: "file.ts",
        line: i + 1,
        body: `Comment ${i + 1}`,
        createdAt: new Date(),
      }));

      const result = await pipeline.createMemoryEntry("test-user", "org", "repo", pr, reviews, comments);

      expect(result.buddyId).toBe("test-user");
      expect(result.prNumber).toBe(123);
      expect(result.keyLearnings).toContain("Requested changes on this PR");
      expect(result.keyLearnings).toContain("Detailed review with many comments");
      expect(mockStorage.addMemoryEntry).toHaveBeenCalled();
    });

    it("should create memory entry without key learnings for simple review", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const pr: PullRequest = {
        number: 456,
        title: "Simple PR",
        body: "",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 5,
        deletions: 0,
        changedFiles: 1,
      };

      const reviews: PRReview[] = [
        {
          id: 1,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          state: "approved",
          body: "",
          submittedAt: new Date(),
        },
      ];

      const comments: GHReviewComment[] = [];

      const result = await pipeline.createMemoryEntry("test-user", "org", "repo", pr, reviews, comments);

      expect(result.keyLearnings).toHaveLength(0);
      expect(mockStorage.addMemoryEntry).toHaveBeenCalled();
    });
  });

  describe("createBuddy", () => {
    it("should create complete buddy profile", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "LGTM",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.createBuddy("test-user", reviewData, "org", "repo");

      expect(result.id).toBe("test-user");
      expect(result.username).toBe("test-user");
      expect(result.sourceRepos).toContain("org/repo");
      expect(result.soul).toBe("Generated text");
      expect(result.user).toBe("Generated text");
      expect(result.lastAnalyzedPr).toBe(1);
      expect(mockStorage.writeProfile).toHaveBeenCalledWith("test-user", expect.any(Object));
      expect(mockStorage.addMemoryEntry).toHaveBeenCalled();
    });

    it("should set lastAnalyzedPr to highest PR number", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 5,
            title: "Test PR 5",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "LGTM",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 10,
            title: "Test PR 10",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "LGTM",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 7,
            title: "Test PR 7",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 3,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "LGTM",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.createBuddy("test-user", reviewData, "org", "repo");

      expect(result.lastAnalyzedPr).toBe(10);
    });
  });

  describe("updateBuddy", () => {
    it("should update existing buddy with new review data", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const newReviewData = [
        {
          pr: {
            number: 2,
            title: "New PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 15,
            deletions: 8,
            changedFiles: 3,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Great work",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.updateBuddy("test-user", newReviewData, "org", "newrepo");

      expect(result.id).toBe("test-user");
      expect(result.sourceRepos).toContain("org/newrepo");
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(mockStorage.readProfile).toHaveBeenCalledWith("test-user");
      expect(mockStorage.writeProfile).toHaveBeenCalledWith("test-user", expect.any(Object));
      expect(mockStorage.addMemoryEntry).toHaveBeenCalled();
    });

    it("should throw error when buddy not found", async () => {
      mockReadProfile.mockResolvedValueOnce(null);

      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          },
          reviews: [],
          comments: [],
        },
      ];

      await expect(pipeline.updateBuddy("nonexistent", reviewData, "org", "repo")).rejects.toThrow(
        "Buddy nonexistent not found"
      );
    });

    it("should incorporate feedback into soul profile", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 0,
            deletions: 0,
            changedFiles: 0,
          },
          reviews: [],
          comments: [],
        },
      ];

      const result = await pipeline.updateBuddy("test-user", reviewData, "org", "repo");

      expect(result.soul).toBe("Generated text");
      // Should have called generateStructured twice (once for analysis, once with feedback)
      expect(mockLLM.generateStructured).toHaveBeenCalled();
    });

    it("should filter PRs when sincePr is provided", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 5,
            title: "Old PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Old review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 10,
            title: "New PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "New review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 15,
            title: "Newer PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 3,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Newer review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.updateBuddy("test-user", reviewData, "org", "repo", { sincePr: 8 });

      expect(result.lastAnalyzedPr).toBe(15);
      // Should only process PRs 10 and 15, not PR 5
      expect(mockStorage.addMemoryEntry).toHaveBeenCalledTimes(2);
    });

    it("should return existing profile when no new PRs to process", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 5,
            title: "Old PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Old review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const existingProfile = await mockStorage.readProfile("test-user");
      const result = await pipeline.updateBuddy("test-user", reviewData, "org", "repo", { sincePr: 10 });

      expect(result).toEqual(existingProfile);
      expect(mockLLM.generateStructured).not.toHaveBeenCalled();
      expect(mockStorage.addMemoryEntry).not.toHaveBeenCalled();
      expect(mockStorage.writeProfile).not.toHaveBeenCalled();
    });

    it("should process all PRs when force is true", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 5,
            title: "Old PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Old review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 10,
            title: "New PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "New review",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.updateBuddy("test-user", reviewData, "org", "repo", { sincePr: 8, force: true });

      expect(result.lastAnalyzedPr).toBe(10);
      // Should process both PRs despite sincePr=8
      expect(mockStorage.addMemoryEntry).toHaveBeenCalledTimes(2);
    });

    it("should update lastAnalyzedPr to highest processed PR number", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 20,
            title: "PR 20",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 1,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Review 20",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
        {
          pr: {
            number: 25,
            title: "PR 25",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [
            {
              id: 2,
              author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
              state: "approved" as const,
              body: "Review 25",
              submittedAt: new Date(),
            },
          ],
          comments: [],
        },
      ];

      const result = await pipeline.updateBuddy("test-user", reviewData, "org", "repo");

      expect(result.lastAnalyzedPr).toBe(25);
    });
  });

  describe("structured output verification", () => {
    it("should extract review patterns from analysis", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [],
          comments: [],
        },
      ];

      const result = await pipeline.analyzeReviewerHistory(reviewData);

      expect(result).toBeDefined();
      expect(result.reviewPatterns).toBeDefined();
      expect(Array.isArray(result.reviewPatterns)).toBe(true);
      expect(result.reviewPatterns.length).toBeGreaterThan(0);
      expect(result.reviewPatterns[0]).toHaveProperty("pattern");
      expect(result.reviewPatterns[0]).toHaveProperty("description");
      expect(result.reviewPatterns[0]).toHaveProperty("frequency");
      expect(result.reviewPatterns[0]).toHaveProperty("examples");
    });

    it("should generate severity distribution in analysis", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [],
          comments: [],
        },
      ];

      const result = await pipeline.analyzeReviewerHistory(reviewData);

      expect(result).toBeDefined();
      expect(result.reviewStyle.severityDistribution).toBeDefined();
      expect(result.reviewStyle.severityDistribution).toHaveProperty("info");
      expect(result.reviewStyle.severityDistribution).toHaveProperty("suggestion");
      expect(result.reviewStyle.severityDistribution).toHaveProperty("warning");
      expect(result.reviewStyle.severityDistribution).toHaveProperty("error");
      expect(typeof result.reviewStyle.severityDistribution.info).toBe("number");
      expect(typeof result.reviewStyle.severityDistribution.suggestion).toBe("number");
      expect(typeof result.reviewStyle.severityDistribution.warning).toBe("number");
      expect(typeof result.reviewStyle.severityDistribution.error).toBe("number");
    });

    it("should identify preferred programming languages", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [],
          comments: [],
        },
      ];

      const result = await pipeline.analyzeReviewerHistory(reviewData);

      expect(result).toBeDefined();
      expect(result.preferredLanguages).toBeDefined();
      expect(Array.isArray(result.preferredLanguages)).toBe(true);
      expect(result.preferredLanguages.length).toBeGreaterThan(0);
      expect(typeof result.preferredLanguages[0]).toBe("string");
    });

    it("should identify preferred frameworks", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const reviewData = [
        {
          pr: {
            number: 1,
            title: "Test PR",
            body: "",
            state: "open" as const,
            author: { login: "author", id: 1, avatarUrl: "", url: "" },
            createdAt: new Date(),
            updatedAt: new Date(),
            headRef: "feature",
            baseRef: "main",
            files: [],
            additions: 10,
            deletions: 5,
            changedFiles: 2,
          },
          reviews: [],
          comments: [],
        },
      ];

      const result = await pipeline.analyzeReviewerHistory(reviewData);

      expect(result).toBeDefined();
      expect(result.preferredFrameworks).toBeDefined();
      expect(Array.isArray(result.preferredFrameworks)).toBe(true);
      expect(result.preferredFrameworks.length).toBeGreaterThan(0);
      expect(typeof result.preferredFrameworks[0]).toBe("string");
    });

    it("should create categorized memory entries", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);

      const pr: PullRequest = {
        number: 123,
        title: "Test PR with security concerns",
        body: "Test body",
        state: "open",
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 10,
        deletions: 5,
        changedFiles: 2,
      };

      const reviews: PRReview[] = [
        {
          id: 1,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          state: "changes_requested",
          body: "Please fix the security vulnerability",
          submittedAt: new Date(),
        },
      ];

      const comments: GHReviewComment[] = [
        {
          id: 1,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          path: "file.ts",
          line: 10,
          body: "This is a security issue - we need to validate input",
          createdAt: new Date(),
        },
        {
          id: 2,
          author: { login: "reviewer", id: 2, avatarUrl: "", url: "" },
          path: "file.ts",
          line: 20,
          body: "Performance: consider caching this result",
          createdAt: new Date(),
        },
      ];

      const result = await pipeline.createMemoryEntry("test-user", "org", "repo", pr, reviews, comments);

      expect(result).toBeDefined();
      expect(result.content).toContain("Categories");
      expect(result.content).toContain("security-focus");
      expect(result.content).toContain("performance-focus");
      expect(result.keyLearnings).toContain("Requested changes on this PR");
    });
  });

  describe("Progress reporter integration", () => {
    function basePR(n: number): PullRequest {
      return {
        number: n,
        title: `PR ${n}`,
        body: "",
        state: "open" as const,
        author: { login: "author", id: 1, avatarUrl: "", url: "" },
        createdAt: new Date(),
        updatedAt: new Date(),
        headRef: "feature",
        baseRef: "main",
        files: [],
        additions: 1,
        deletions: 0,
        changedFiles: 1,
      } as PullRequest;
    }

    it("reports llm_call and writing_memory stages from createBuddy", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);
      const calls: Array<{ stage?: string; subStep?: string }> = [];
      const reporter = { report: (u: { stage?: string; subStep?: string }) => calls.push(u) };

      const reviewData = [
        { pr: basePR(1), reviews: [], comments: [] },
        { pr: basePR(2), reviews: [], comments: [] },
      ];

      await pipeline.createBuddy("test-user", reviewData, "org", "repo", reporter);

      const stages = new Set(calls.map((c) => c.stage));
      expect(stages.has("llm_call")).toBe(true);
      expect(stages.has("generating_profile")).toBe(true);
      expect(stages.has("writing_memory")).toBe(true);

      const memSubSteps = calls.map((c) => c.subStep).filter((s) => s && /^memory \d+\/\d+$/.test(s));
      expect(memSubSteps.length).toBe(2);
    });

    it("emits soul_profile_llm and user_profile_llm stages", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);
      const calls: Array<{ stage?: string }> = [];
      const reporter = { report: (u: { stage?: string }) => calls.push(u) };

      await pipeline.createBuddy(
        "test-user",
        [{ pr: basePR(1), reviews: [], comments: [] }],
        "org",
        "repo",
        reporter
      );

      const stages = new Set(calls.map((c) => c.stage));
      expect(stages.has("soul_profile_llm")).toBe(true);
      expect(stages.has("user_profile_llm")).toBe(true);
    });

    it("emits batch subSteps when reviewerHistory exceeds BATCH_SIZE", async () => {
      const pipeline = new AnalysisPipeline(mockLLM, mockStorage);
      const calls: Array<{ stage?: string; subStep?: string }> = [];
      const reporter = { report: (u: { stage?: string; subStep?: string }) => calls.push(u) };

      const reviewData = [1, 2, 3, 4, 5].map((n) => ({
        pr: basePR(n),
        reviews: [],
        comments: [],
      }));

      await pipeline.analyzeReviewerHistory(reviewData, reporter);

      const subSteps = calls.map((c) => c.subStep).filter((s): s is string => Boolean(s));
      expect(subSteps.some((s) => /^analysis batch \d+\/\d+$/.test(s))).toBe(true);
    });
  });
});
