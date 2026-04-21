/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReviewEngine } from "../review/engine.js";
import type { LLMProvider, BuddyProfile, PullRequest, CustomRule } from "../index.js";
import { FileContextCache } from "../cache/file-cache.js";
import * as feedback from "../learning/feedback.js";

// Mock LLM provider at top level (Vitest requirement)
const createMockLLM = (responses: any[] = []): LLMProvider => ({
  generate: vi.fn(async () => ({
    content: "Mock response",
    usage: { inputTokens: 1000, outputTokens: 500 },
    model: "claude-3-5-sonnet",
  }) as any),
  generateStructured: vi.fn(async () => {
    const response = responses.shift() || {
      content: {
        summary: "LGTM",
        state: "approved",
        comments: [],
      },
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
      },
      model: "claude-3-5-sonnet",
    };
    return response as any;
  }) as any,
});

// Helper to create a minimal PR for testing
function createTestPR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: 1,
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: "open",
    draft: false,
    author: {
      login: "testuser",
      id: 123,
      avatarUrl: "https://example.com/avatar.png",
      url: "https://example.com/testuser",
    },
    base: {
      label: "main",
      ref: "main",
      sha: "abc123",
      repo: {
        owner: {
          login: "testowner",
          id: 456,
          avatarUrl: "https://example.com/owner.png",
          url: "https://example.com/testowner",
        },
        name: "test-repo",
        fullName: "testowner/test-repo",
      },
    },
    head: {
      label: "feature",
      ref: "feature",
      sha: "def456",
      repo: {
        owner: {
          login: "testowner",
          id: 456,
          avatarUrl: "https://example.com/owner.png",
          url: "https://example.com/testowner",
        },
        name: "test-repo",
        fullName: "testowner/test-repo",
      },
    },
    files: [],
    additions: 10,
    deletions: 5,
    changedFiles: 2,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    url: "https://example.com/pr/1",
    ...overrides,
  };
}

describe("ReviewEngine", () => {
  let mockLLM: LLMProvider;
  let engine: ReviewEngine;

  beforeEach(() => {
    mockLLM = createMockLLM();
    engine = new ReviewEngine(mockLLM);
  });

  describe("Constructor", () => {
    it("should create instance with LLM provider", () => {
      expect(engine).toBeInstanceOf(ReviewEngine);
    });

    it("should accept custom rules", () => {
      const customRules: CustomRule[] = [
        {
          id: "rule-1",
          name: "Test Rule",
          description: "Test description",
          pattern: "test",
          severity: "warning",
          enabled: true,
        },
      ];
      const engineWithRules = new ReviewEngine(mockLLM, customRules);
      expect(engineWithRules).toBeInstanceOf(ReviewEngine);
    });

    it("should handle empty custom rules array", () => {
      const engineWithEmptyRules = new ReviewEngine(mockLLM, []);
      expect(engineWithEmptyRules).toBeInstanceOf(ReviewEngine);
    });

    it("should accept FileContextCache", () => {
      const fileCache = new FileContextCache();
      const engineWithCache = new ReviewEngine(mockLLM, undefined, 8000, fileCache);
      expect(engineWithCache).toBeInstanceOf(ReviewEngine);
    });

    it("should accept custom rules and FileContextCache together", () => {
      const customRules: CustomRule[] = [
        {
          id: "rule-1",
          name: "Test Rule",
          description: "Test description",
          pattern: "test",
          severity: "warning",
          enabled: true,
        },
      ];
      const fileCache = new FileContextCache();
      const engineWithBoth = new ReviewEngine(mockLLM, customRules, 8000, fileCache);
      expect(engineWithBoth).toBeInstanceOf(ReviewEngine);
    });
  });

  describe("FileContextCache integration", () => {
    it("should populate cache after reviewWithContext", async () => {
      const fileCache = new FileContextCache();
      const engine = new ReviewEngine(mockLLM, undefined, 8000, fileCache);
      const pr = createTestPR();

      const repoFiles = ["src/file.ts", "src/utils.ts", "README.md"];

      await engine.reviewWithContext(pr, "diff", repoFiles);

      const cacheKey = "fileTree:testowner/test-repo";
      const cachedFiles = fileCache.get<string[]>(cacheKey);

      expect(cachedFiles).toBeDefined();
      expect(cachedFiles).toEqual(repoFiles);
    });

    it("should check cache in performReview when repoFiles not provided", async () => {
      const fileCache = new FileContextCache();
      const engine = new ReviewEngine(mockLLM, undefined, 8000, fileCache);
      const pr = createTestPR();

      const repoFiles = ["src/file.ts", "src/utils.ts"];
      const cacheKey = "fileTree:testowner/test-repo";

      // Pre-populate the cache
      fileCache.set(cacheKey, repoFiles);

      // Perform review without repoFiles parameter
      const review = await engine.performReview(pr, "diff", undefined, undefined);

      // Should have used cached files for high-context review
      expect(review.metadata.reviewType).toBe("combined");
    });

    it("should not use cache when repoFiles are explicitly provided", async () => {
      const fileCache = new FileContextCache();
      const engine = new ReviewEngine(mockLLM, undefined, 8000, fileCache);
      const pr = createTestPR();

      const cachedFiles = ["src/old.ts"];
      const providedFiles = ["src/new.ts", "src/utils.ts"];
      const cacheKey = "fileTree:testowner/test-repo";

      // Pre-populate cache with different files
      fileCache.set(cacheKey, cachedFiles);

      // Perform review with explicit repoFiles
      const review = await engine.performReview(pr, "diff", undefined, providedFiles);

      // Should use provided files, not cached ones
      expect(review.metadata.reviewType).toBe("combined");
      const stillCached = fileCache.get<string[]>(cacheKey);
      // Cache should be updated with the provided files
      expect(stillCached).toEqual(providedFiles);
    });

    it("should skip high-context review on cache miss when repoFiles not provided", async () => {
      const fileCache = new FileContextCache();
      const engine = new ReviewEngine(mockLLM, undefined, 8000, fileCache);
      const pr = createTestPR();

      // Don't pre-populate cache and don't provide repoFiles
      const review = await engine.performReview(pr, "diff", undefined, undefined);

      // Should fall back to low-context review
      expect(review.metadata.reviewType).toBe("low-context");
    });

    it("should work correctly when FileContextCache is not provided", async () => {
      // Engine without cache
      const pr = createTestPR();

      const repoFiles = ["src/file.ts"];

      // Should work normally with explicit repoFiles
      const review = await engine.performReview(pr, "diff", undefined, repoFiles);

      expect(review.metadata.reviewType).toBe("combined");

      // Should fall back to low-context review when repoFiles not provided
      const reviewLowCtx = await engine.performReview(pr, "diff", undefined, undefined);

      expect(reviewLowCtx.metadata.reviewType).toBe("low-context");
    });
  });

  describe("performReview without LLM", () => {
    it("should throw meaningful error when LLM fails", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => {
        throw new Error("API key invalid");
      }) as any;

      const failingLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const failingEngine = new ReviewEngine(failingLLM);
      const pr = createTestPR();

      await expect(
        failingEngine.performReview(pr, "diff content")
      ).rejects.toThrow("API key invalid");
    });

    it("should throw error when LLM returns invalid response", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => {
        return {
          content: null as unknown as { summary: string; state: string; comments: never[] },
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const invalidLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const invalidEngine = new ReviewEngine(invalidLLM);
      const pr = createTestPR();

      await expect(
        invalidEngine.performReview(pr, "diff content")
      ).rejects.toThrow();
    });
  });

  describe("Comment deduplication", () => {
    it("should deduplicate identical comments", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Review",
          state: "commented" as const,
          comments: [
            {
              path: "src/file.ts",
              line: 10,
              body: "This is a duplicate comment",
              severity: "suggestion",
              category: "readability",
            },
            {
              path: "src/file.ts",
              line: 10,
              body: "This is a duplicate comment",
              severity: "suggestion",
              category: "readability",
            },
            {
              path: "src/other.ts",
              line: 20,
              body: "Different comment",
              severity: "warning",
              category: "bug",
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLMWithDupes: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const dedupeEngine = new ReviewEngine(mockLLMWithDupes);
      const pr = createTestPR();

      const review = await dedupeEngine.reviewDiff(pr, "diff");
      // reviewDiff doesn't deduplicate - performReview does
      expect(review.comments).toHaveLength(3);
    });

    it("should deduplicate across low and high context reviews", async () => {
      const responses = [
        {
          content: {
            summary: "Low context review",
            state: "commented" as const,
            comments: [
              {
                path: "src/file.ts",
                line: 5,
                body: "Add error handling",
                severity: "warning",
                category: "error-handling",
              },
              {
                path: "src/file.ts",
                line: 10,
                body: "Consider using const",
                severity: "suggestion",
                category: "style",
              },
            ],
          },
          usage: { inputTokens: 500, outputTokens: 250 },
          model: "claude-3-5-sonnet",
        },
        {
          content: {
            summary: "High context review",
            state: "commented" as const,
            comments: [
              {
                path: "src/file.ts",
                line: 5,
                body: "Add error handling",
                severity: "warning",
                category: "error-handling",
              },
              {
                path: "src/file.ts",
                line: 15,
                body: "Type safety issue",
                severity: "error",
                category: "type-safety",
              },
            ],
          },
          usage: { inputTokens: 800, outputTokens: 400 },
          model: "claude-3-5-sonnet",
        },
      ];

      const mockLLM = createMockLLM(responses);
      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.performReview(pr, "diff", undefined, ["src/file.ts"]);
      expect(review.comments).toHaveLength(3);
    });
  });

  describe("Custom rules integration", () => {
    it("should apply custom rules to review", async () => {
      const customRules: CustomRule[] = [
        {
          id: "no-console-log",
          name: "No console.log",
          description: "No console.log statements",
          pattern: "console.log",
          severity: "warning",
          enabled: true,
        },
        {
          id: "no-any",
          name: "No any types",
          description: "Avoid using any type",
          pattern: ": any",
          severity: "error",
          enabled: true,
        },
      ];

      const engineWithRules = new ReviewEngine(mockLLM, customRules);
      const pr = createTestPR();

      const diff = `
diff --git a/src/file.ts b/src/file.ts
index 123..456 789
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,5 @@
+console.log("debug");
 const data: any = {};
`;

      const review = await engineWithRules.reviewDiff(pr, diff);
      expect(review.comments.length).toBeGreaterThan(0);

      const consoleLogComment = review.comments.find(
        (c) => c.body.includes("console.log")
      );
      expect(consoleLogComment).toBeDefined();

      const anyTypeComment = review.comments.find(
        (c) => c.body.includes("any")
      );
      expect(anyTypeComment).toBeDefined();
    });

    it("should combine LLM comments with custom rule comments", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "LLM Review",
          state: "commented" as const,
          comments: [
            {
              path: "src/file.ts",
              line: 10,
              body: "LLM comment",
              severity: "suggestion",
              category: "readability",
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const customRules: CustomRule[] = [
        {
          id: "custom-1",
          name: "Custom Rule",
          description: "Custom rule description",
          pattern: "TODO",
          severity: "warning",
          enabled: true,
        },
      ];

      const engine = new ReviewEngine(mockLLM, customRules);
      const pr = createTestPR();

      const diff = `
diff --git a/src/file.ts b/src/file.ts
+// TODO: fix this
`;

      const review = await engine.reviewDiff(pr, diff);
      expect(review.comments.length).toBeGreaterThan(0);
    });
  });

  describe("Review state determination", () => {
    it("should determine correct review state", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Issues found",
          state: "approved" as const,
          comments: [
            {
              path: "src/file.ts",
              line: 10,
              body: "Critical bug",
              severity: "error",
              category: "bug",
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, "diff");
      expect(review.state).toBe("commented");
    });
  });

  describe("Buddy profile integration", () => {
    it("should use buddy profile in review", async () => {
      const buddyProfile: BuddyProfile = {
        id: "test-buddy",
        username: "testbuddy",
        soul: "# Review Philosophy\nFocus on security",
        user: "# Profile\nSecurity expert",
        memory: "# Memory\nSecurity patterns",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content;
        // Check if buddy info is in prompt
        expect(prompt).toContain("testbuddy");
        expect(prompt).toContain("Security expert");

        return {
          content: {
            summary: "Security-focused review",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 1500, outputTokens: 600 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      await engine.reviewDiff(pr, "diff", buddyProfile);
    });
  });

  describe("formatForGitHub", () => {
    it("should format review for GitHub API", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "LGTM with comments",
          state: "commented" as const,
          comments: [
            {
              path: "src/file.ts",
              line: 10,
              body: "Consider refactoring",
              severity: "suggestion",
              category: "readability",
              suggestion: "Use const instead",
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, "diff");
      const githubReview = engine.formatForGitHub(review);

      expect(githubReview.body).toBe("LGTM with comments");
      expect(githubReview.event).toBe("COMMENT");
      expect(githubReview.comments).toHaveLength(1);
      expect(githubReview.comments[0]).toMatchObject({
        path: "src/file.ts",
        line: 10,
      });
    });

    it("should map review states to GitHub events", async () => {
      const testCases = [
        { llmState: "approved" as const, expectedEvent: "APPROVE" },
        { llmState: "changes_requested" as const, expectedEvent: "REQUEST_CHANGES" },
        { llmState: "commented" as const, expectedEvent: "COMMENT" },
      ];

      for (const { llmState, expectedEvent } of testCases) {
        const mockGenerate = vi.fn(async () => ({
          content: "Mock",
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        })) as any;

        const mockGenerateStructured = vi.fn(async () => ({
          content: {
            summary: "Test",
            state: llmState,
            comments: [],
          },
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        })) as any;

        const mockLLM: LLMProvider = {
          generate: mockGenerate,
          generateStructured: mockGenerateStructured,
        };

        const engine = new ReviewEngine(mockLLM);
        const pr = createTestPR();

        const review = await engine.reviewDiff(pr, "diff");
        const githubReview = engine.formatForGitHub(review);
        expect(githubReview.event).toBe(expectedEvent);
      }
    });
  });

  describe("High-context review with impact analysis", () => {
    it("should perform high-context review with impact assessment", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 2000, outputTokens: 800 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "High-context impact analysis",
          state: "commented" as const,
          comments: [
            {
              path: "src/auth.ts",
              line: 15,
              body: "Authentication logic affects multiple services",
              severity: "warning",
              category: "architecture",
            },
          ],
          impactAssessment: {
            overallRisk: "medium" as const,
            affectedModules: ["auth", "user-service", "api-gateway"],
            breakingChanges: true,
            migrationRequired: true,
          },
          alternativeApproaches: [
            {
              description: "Use OAuth2 provider",
              pros: ["Standardized", "Better security"],
              cons: ["External dependency"],
              complexity: "medium" as const,
            },
          ],
          sideEffects: [
            {
              description: "Existing sessions may become invalid",
              likelihood: "high" as const,
              severity: "warning",
              mitigation: "Implement session migration",
            },
          ],
        },
        usage: { inputTokens: 2000, outputTokens: 800 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const repoFiles = [
        "src/auth.ts",
        "src/user-service.ts",
        "src/api-gateway.ts",
        "src/utils.ts",
      ];

      const review = await engine.reviewWithContext(pr, "diff", repoFiles);

      expect(review.summary).toContain("High-context impact analysis");
      expect(review.summary).toContain("Impact Assessment");
      expect(review.summary).toContain("Alternative Approaches");
      expect(review.summary).toContain("Potential Side Effects");
      expect(review.metadata.reviewType).toBe("high-context");
      expect(review.comments).toHaveLength(1);
    });

    it("should handle high-context review without impact data", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Simple high-context review",
          state: "approved" as const,
          comments: [],
        },
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewWithContext(pr, "diff", ["src/file.ts"]);

      expect(review.summary).toBe("Simple high-context review");
      expect(review.metadata.reviewType).toBe("high-context");
    });
  });

  describe("Combined low and high-context review", () => {
    it("should merge and deduplicate comments from both reviews", async () => {
      const responses = [
        // Low-context review
        {
          content: {
            summary: "Low-context review",
            state: "commented" as const,
            comments: [
              {
                path: "src/file.ts",
                line: 10,
                body: "Add error handling",
                severity: "warning" as const,
                category: "error-handling" as const,
              },
              {
                path: "src/file.ts",
                line: 20,
                body: "Use const instead of let",
                severity: "suggestion" as const,
                category: "style" as const,
              },
              {
                path: "src/file.ts",
                line: 30,
                body: "Low-context only comment",
                severity: "info" as const,
                category: "documentation" as const,
              },
            ],
          },
          usage: { inputTokens: 500, outputTokens: 250 },
          model: "claude-3-5-sonnet",
        },
        // High-context review
        {
          content: {
            summary: "High-context review",
            state: "commented" as const,
            comments: [
              {
                path: "src/file.ts",
                line: 10,
                body: "Add error handling - affects multiple modules",
                severity: "error" as const,
                category: "error-handling" as const,
              },
              {
                path: "src/file.ts",
                line: 25,
                body: "High-context architecture comment",
                severity: "warning" as const,
                category: "architecture" as const,
              },
            ],
            impactAssessment: {
              overallRisk: "medium" as const,
              affectedModules: ["auth", "api"],
              breakingChanges: false,
              migrationRequired: false,
            },
          },
          usage: { inputTokens: 800, outputTokens: 400 },
          model: "claude-3-5-sonnet",
        },
      ];

      const mockLLM = createMockLLM(responses);
      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.performReview(pr, "diff", undefined, ["src/file.ts"]);

      expect(review.metadata.reviewType).toBe("combined");
      expect(review.summary).toContain("Low-context review");
      expect(review.summary).toContain("High-context review");
      expect(review.summary).toContain("High-Context Analysis");

      // Should deduplicate line 10 (keep higher severity error)
      expect(review.comments).toHaveLength(4); // 4 unique locations (10, 20, 25, 30)
      const line10Comment = review.comments.find((c) => c.line === 10);
      expect(line10Comment?.severity).toBe("error");
      expect(line10Comment?.body).toContain("affects multiple modules");

      // Should keep unique comments
      expect(review.comments.some((c) => c.line === 20)).toBe(true);
      expect(review.comments.some((c) => c.line === 25)).toBe(true);
      expect(review.comments.some((c) => c.line === 30)).toBe(true);

      // Token usage should be combined (low + high context)
      expect(review.metadata.tokenUsage.inputTokens).toBeGreaterThanOrEqual(1300); // 500 + 800
      expect(review.metadata.tokenUsage.outputTokens).toBeGreaterThanOrEqual(650); // 250 + 400
    });

    it("should prioritize high-context state when changes requested", async () => {
      const responses = [
        {
          content: {
            summary: "Low-context",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 500, outputTokens: 250 },
          model: "claude-3-5-sonnet",
        },
        {
          content: {
            summary: "High-context",
            state: "changes_requested" as const,
            comments: [
              {
                path: "src/file.ts",
                line: 10,
                body: "Critical issue",
                severity: "error" as const,
                category: "bug" as const,
              },
            ],
          },
          usage: { inputTokens: 800, outputTokens: 400 },
          model: "claude-3-5-sonnet",
        },
      ];

      const mockLLM = createMockLLM(responses);
      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.performReview(pr, "diff", undefined, ["src/file.ts"]);

      expect(review.state).toBe("changes_requested");
    });
  });

  describe("Chunked diff processing", () => {
    it("should process large diffs in chunks", async () => {
      // Create a very large diff that will be split into multiple chunks
      // The split logic uses maxTokensPerReview * 0.7 * 4 = ~22400 chars per chunk
      // We need to exceed this with multiple file boundaries
      const fileHeader = "diff --git a/file.ts b/file.ts\nindex 123..456 789\n--- a/file.ts\n+++ b/file.ts\n@@ -1,1 +1,2 @@\n";
      const chunkContent = "line\n".repeat(8000); // ~32000 chars per chunk

      // Create 3 large files to force chunking
      const largeDiff =
        fileHeader + chunkContent +
        "diff --git a/file2.ts b/file2.ts\n" + fileHeader + chunkContent +
        "diff --git a/file3.ts b/file3.ts\n" + fileHeader + chunkContent;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 5000, outputTokens: 1000 },
        model: "claude-3-5-sonnet",
      })) as any;

      let callCount = 0;
      const mockGenerateStructured = vi.fn(async () => {
        callCount++;
        return {
          content: {
            summary: `Chunk review ${callCount}`,
            state: "commented" as const,
            comments: [
              {
                path: `file${callCount}.ts`,
                line: 10,
                body: "Comment from chunk",
                severity: "suggestion" as const,
                category: "readability" as const,
              },
            ],
          },
          usage: { inputTokens: 5000, outputTokens: 1000 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, [], 8000);
      const pr = createTestPR();

      const review = await engine.performReview(pr, largeDiff);

      // Should have chunked the review
      expect(review.metadata.reviewType).toBe("chunked");
      expect(review.metadata.chunkCount).toBeGreaterThan(1);
      expect(review.summary).toContain("---"); // Chunk separator
      expect(callCount).toBeGreaterThan(1); // Called multiple times for chunks
    });

    it("should apply custom rules to chunked reviews", async () => {
      const largeDiff = "diff --git a/file.ts b/file.ts\n+console.log('test')\n".repeat(3000);

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 5000, outputTokens: 1000 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Chunked",
          state: "commented" as const,
          comments: [],
        },
        usage: { inputTokens: 5000, outputTokens: 1000 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const customRules: CustomRule[] = [
        {
          id: "no-console",
          name: "No console",
          description: "No console statements",
          pattern: "console.log",
          severity: "warning",
          enabled: true,
        },
      ];

      const engine = new ReviewEngine(mockLLM, customRules, 8000);
      const pr = createTestPR();

      const review = await engine.performReview(pr, largeDiff);

      expect(review.comments.length).toBeGreaterThan(0);
      expect(review.comments.some((c) => c.body.includes("console"))).toBe(true);
    });

    it("should not chunk when diff is small enough", async () => {
      const smallDiff = "diff --git a/file.ts b/file.ts\n+small change";

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Small review",
          state: "approved" as const,
          comments: [],
        },
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, [], 8000);
      const pr = createTestPR();

      const review = await engine.performReview(pr, smallDiff);

      expect(review.metadata.reviewType).toBe("low-context");
      expect(review.metadata.chunkCount).toBeUndefined();
    });
  });

  describe("Markdown formatting", () => {
    it("should format markdown summary with all sections", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Excellent PR with minor suggestions",
          state: "approved" as const,
          comments: [
            {
              path: "src/file.ts",
              line: 10,
              body: "Consider using const",
              severity: "suggestion",
              category: "readability",
              suggestion: "const instead of let",
            },
            {
              path: "src/other.ts",
              line: 20,
              body: "Potential bug",
              severity: "error",
              category: "bug",
            },
            {
              path: "src/util.ts",
              line: 5,
              body: "Add JSDoc",
              severity: "info",
              category: "documentation",
            },
          ],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, "diff");
      const markdown = engine.formatMarkdownSummary(review);

      expect(markdown).toContain("## Code Review Summary");
      expect(markdown).toContain("Excellent PR with minor suggestions");
      expect(markdown).toContain("**State:**");
      expect(markdown).toContain("## Key Findings");
      expect(markdown).toContain("### ❌ Errors (1)");
      // Warnings with 0 count are not shown
      expect(markdown).toContain("### 💡 Suggestions (1)");
      expect(markdown).toContain("### ℹ️ Info (1)");
      expect(markdown).toContain("[src/file.ts:10]");
      expect(markdown).toContain("Suggestion:");
      expect(markdown).toContain("Reviewed by");
      expect(markdown).toContain("Model:");
      expect(markdown).toContain("Tokens:");
      expect(markdown).toContain("Duration:");
    });

    it("should format markdown with high-context analysis", async () => {
      const review = {
        summary: "Base summary",
        state: "commented" as const,
        comments: [],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "test-repo",
          owner: "testowner",
          reviewType: "high-context" as const,
          llmModel: "claude-3-5-sonnet",
          tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          durationMs: 2500,
        },
      };

      const highContextData = {
        impactAssessment: {
          overallRisk: "high" as const,
          affectedModules: ["auth", "api"],
          breakingChanges: true,
          migrationRequired: true,
        },
        alternativeApproaches: [
          {
            description: "Use OAuth2",
            pros: ["Standard", "Secure"],
            cons: ["Complex"],
            complexity: "medium" as const,
          },
        ],
        sideEffects: [
          {
            description: "Session invalidation",
            likelihood: "high" as const,
            severity: "warning",
            mitigation: "Implement migration",
          },
        ],
      };

      const engine = new ReviewEngine(createMockLLM());
      const markdown = engine.formatMarkdownSummary(review, highContextData);

      expect(markdown).toContain("## Impact Assessment");
      expect(markdown).toContain("**Overall Risk:** HIGH");
      expect(markdown).toContain("**Breaking Changes:** Yes");
      expect(markdown).toContain("**Migration Required:** Yes");
      expect(markdown).toContain("**Affected Modules:**");
      // The modules are comma-separated on one line, not as individual bullets
      expect(markdown).toContain("auth, api");
      expect(markdown).toContain("## Alternative Approaches");
      expect(markdown).toContain("### Use OAuth2 (Complexity: medium)");
      expect(markdown).toContain("**Pros:**");
      expect(markdown).toContain("**Cons:**");
      expect(markdown).toContain("## Potential Side Effects");
      expect(markdown).toContain("**Session invalidation**");
      expect(markdown).toContain("Likelihood: HIGH");
    });

    it("should handle empty comments in markdown", async () => {
      const review = {
        summary: "Clean PR",
        state: "approved" as const,
        comments: [],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "test-repo",
          owner: "testowner",
          reviewType: "low-context" as const,
          llmModel: "claude-3-5-sonnet",
          tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
          durationMs: 1000,
        },
      };

      const engine = new ReviewEngine(createMockLLM());
      const markdown = engine.formatMarkdownSummary(review);

      expect(markdown).toContain("## Code Review Summary");
      expect(markdown).toContain("Clean PR");
      expect(markdown).toContain("**State:** ✅ APPROVED");
      expect(markdown).not.toContain("## Key Findings");
    });
  });

  describe("Comment deduplication with severity priority", () => {
    it("should keep higher severity comment when deduplicating", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Low severity comment",
          severity: "info" as const,
          category: "style" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          line: 10,
          body: "High severity comment",
          severity: "error" as const,
          category: "bug" as const,
        },
        {
          id: "3",
          path: "src/file.ts",
          line: 10,
          body: "Medium severity comment",
          severity: "warning" as const,
          category: "bug" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].severity).toBe("error");
      expect(deduplicated[0].body).toBe("High severity comment");
    });

    it("should keep first comment when severities are equal", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "First comment",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          line: 10,
          body: "Second comment",
          severity: "warning" as const,
          category: "bug" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].body).toBe("First comment");
    });

    it("should handle comments without line numbers", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          body: "General comment",
          severity: "suggestion" as const,
          category: "readability" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          body: "Duplicate general comment",
          severity: "warning" as const,
          category: "bug" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      // Both have no line, so they share the same key
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].severity).toBe("warning");
    });

    it("should not deduplicate comments at different locations", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Comment at line 10",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          line: 20,
          body: "Comment at line 20",
          severity: "info" as const,
          category: "style" as const,
        },
        {
          id: "3",
          path: "src/other.ts",
          line: 10,
          body: "Comment in other file",
          severity: "suggestion" as const,
          category: "readability" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(3);
    });

    it("should deduplicate multi-line comments with overlapping ranges", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          startLine: 10,
          line: 20,
          body: "Multi-line comment 10-20",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          startLine: 15,
          line: 25,
          body: "Overlapping comment 15-25",
          severity: "error" as const,
          category: "security" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].severity).toBe("error");
      expect(deduplicated[0].body).toBe("Overlapping comment 15-25");
    });

    it("should preserve non-overlapping multi-line comments on same file", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          startLine: 5,
          line: 10,
          body: "Comment lines 5-10",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          startLine: 20,
          line: 30,
          body: "Comment lines 20-30",
          severity: "info" as const,
          category: "style" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(2);
    });

    it("should handle comments without startLine alongside multi-line comments", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 15,
          body: "Single-line at 15",
          severity: "suggestion" as const,
          category: "readability" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          startLine: 10,
          line: 20,
          body: "Multi-line 10-20",
          severity: "error" as const,
          category: "bug" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      // line 15 falls within range 10-20, so they overlap
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0].severity).toBe("error");
    });

    it("should never deduplicate comments on different files", () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          startLine: 10,
          line: 20,
          body: "File A",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/other.ts",
          startLine: 10,
          line: 20,
          body: "File B",
          severity: "error" as const,
          category: "security" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);

      expect(deduplicated).toHaveLength(2);
    });

    it("should preserve all severity levels when on different lines", () => {
      const engine = new ReviewEngine(createMockLLM());
      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Error issue",
          severity: "error" as const,
          category: "bug" as const,
        },
        {
          id: "2",
          path: "src/file.ts",
          line: 20,
          body: "Warning issue",
          severity: "warning" as const,
          category: "performance" as const,
        },
        {
          id: "3",
          path: "src/file.ts",
          line: 30,
          body: "Suggestion issue",
          severity: "suggestion" as const,
          category: "readability" as const,
        },
        {
          id: "4",
          path: "src/file.ts",
          line: 40,
          body: "Info note",
          severity: "info" as const,
          category: "documentation" as const,
        },
      ];

      const deduplicated = engine.deduplicateComments(comments);
      expect(deduplicated).toHaveLength(4);
      expect(deduplicated.map((c) => c.severity)).toEqual(["error", "warning", "suggestion", "info"]);
    });
  });

  describe("Error handling", () => {
    it("should handle LLM generation errors gracefully", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => {
        throw new Error("Rate limit exceeded");
      }) as any;

      const failingLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(failingLLM);
      const pr = createTestPR();

      await expect(engine.reviewDiff(pr, "diff")).rejects.toThrow("Rate limit exceeded");
    });

    it("should handle network timeout errors", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => {
        throw new Error("Request timeout after 30s");
      }) as any;

      const timeoutLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(timeoutLLM);
      const pr = createTestPR();

      await expect(engine.reviewDiff(pr, "diff")).rejects.toThrow("Request timeout after 30s");
    });

    it("should handle malformed LLM responses", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Missing required fields",
          // Missing 'state' and 'comments'
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const malformedLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(malformedLLM);
      const pr = createTestPR();

      // Should handle missing fields gracefully
      await expect(engine.reviewDiff(pr, "diff")).rejects.toThrow();
    });

    it("should handle custom rules with invalid regex patterns", async () => {
      const customRules: CustomRule[] = [
        {
          id: "invalid-regex",
          name: "Invalid Rule",
          description: "Has invalid regex",
          pattern: "(?<=invalid", // Invalid lookbehind
          severity: "warning",
          enabled: true,
        },
        {
          id: "valid-rule",
          name: "Valid Rule",
          description: "Valid regex",
          pattern: "TODO",
          severity: "warning",
          enabled: true,
        },
      ];

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Review",
          state: "approved" as const,
          comments: [],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, customRules);
      const pr = createTestPR();

      const diff = `
diff --git a/src/file.ts b/src/file.ts
+// TODO: implement
`;

      // Should not throw, should skip invalid regex
      const review = await engine.reviewDiff(pr, diff);
      expect(review.comments).toBeDefined();
    });

    it("should handle disabled custom rules", async () => {
      const customRules: CustomRule[] = [
        {
          id: "disabled-rule",
          name: "Disabled Rule",
          description: "Should not trigger",
          pattern: "console.log",
          severity: "error",
          enabled: false, // Disabled
        },
        {
          id: "enabled-rule",
          name: "Enabled Rule",
          description: "Should trigger",
          pattern: "TODO",
          severity: "warning",
          enabled: true,
        },
      ];

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Review",
          state: "approved" as const,
          comments: [],
        },
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, customRules);
      const pr = createTestPR();

      const diff = `
diff --git a/src/file.ts b/src/file.ts
+console.log("debug")
+// TODO: implement
`;

      const review = await engine.reviewDiff(pr, diff);

      // Should only have the enabled rule comment (custom rules add comments to diff)
      // The custom rule evaluator matches against the entire diff
      const consoleComments = review.comments.filter((c) => c.body.includes("console"));

      // Custom rules should have triggered for TODO (enabled)
      expect(review.comments.length).toBeGreaterThan(0);
      // Disabled rule should not have triggered
      expect(consoleComments.length).toBe(0);
    });
  });

  describe("formatForGitHub edge cases", () => {
    it("should filter out comments without line numbers", async () => {
      const review = {
        summary: "Review with mixed comments",
        state: "commented" as const,
        comments: [
          {
            id: "1",
            path: "src/file.ts",
            line: 10,
            body: "Has line number",
            severity: "suggestion" as const,
            category: "readability" as const,
          },
          {
            id: "2",
            path: "src/file.ts",
            body: "No line number",
            severity: "info" as const,
            category: "documentation" as const,
          },
        ],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "test-repo",
          owner: "testowner",
          reviewType: "low-context" as const,
          llmModel: "claude-3-5-sonnet",
          tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
          durationMs: 1000,
        },
      };

      const engine = new ReviewEngine(createMockLLM());
      const githubReview = engine.formatForGitHub(review);

      expect(githubReview.comments).toHaveLength(1);
      expect(githubReview.comments[0].line).toBe(10);
    });

    it("should include suggestion in formatted comment body", async () => {
      const review = {
        summary: "Review with suggestion",
        state: "commented" as const,
        comments: [
          {
            id: "1",
            path: "src/file.ts",
            line: 10,
            body: "Use const instead of let",
            severity: "suggestion" as const,
            category: "style" as const,
            suggestion: "const data = []",
          },
        ],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "test-repo",
          owner: "testowner",
          reviewType: "low-context" as const,
          llmModel: "claude-3-5-sonnet",
          tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
          durationMs: 1000,
        },
      };

      const engine = new ReviewEngine(createMockLLM());
      const githubReview = engine.formatForGitHub(review);

      expect(githubReview.comments[0].body).toContain("[SUGGEST]");
      expect(githubReview.comments[0].body).toContain("```suggestion");
      expect(githubReview.comments[0].body).toContain("const data = []");
    });

    it("should handle empty comments array", async () => {
      const review = {
        summary: "Clean review",
        state: "approved" as const,
        comments: [],
        reviewedAt: new Date(),
        metadata: {
          prNumber: 1,
          repo: "test-repo",
          owner: "testowner",
          reviewType: "low-context" as const,
          llmModel: "claude-3-5-sonnet",
          tokenUsage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
          durationMs: 1000,
        },
      };

      const engine = new ReviewEngine(createMockLLM());
      const githubReview = engine.formatForGitHub(review);

      expect(githubReview.event).toBe("APPROVE");
      expect(githubReview.comments).toHaveLength(0);
    });
  });

  describe("Token budget truncation", () => {
    it("should truncate diff that exceeds token budget", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Verify diff was truncated
        expect(prompt.length).toBeLessThan(10000); // Should be truncated
        return {
          content: {
            summary: "Truncated review",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, [], 1000); // Low token budget
      const pr = createTestPR();

      // Create diff that exceeds budget
      const largeDiff = "x".repeat(10000);

      await engine.reviewDiff(pr, largeDiff);
    });
  });

  describe("Review state determination edge cases", () => {
    it("should downgrade approved to commented when errors present", async () => {
      const engine = new ReviewEngine(createMockLLM());

      // Simulate internal state determination
      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Critical issue",
          severity: "error" as const,
          category: "bug" as const,
        },
      ];

      const state = engine["determineReviewState"]("approved", comments);
      expect(state).toBe("commented");
    });

    it("should upgrade to changes_requested when errors present and not approved", async () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Critical issue",
          severity: "error" as const,
          category: "bug" as const,
        },
      ];

      const state = engine["determineReviewState"]("commented", comments);
      expect(state).toBe("changes_requested");
    });

    it("should preserve approved state without errors", async () => {
      const engine = new ReviewEngine(createMockLLM());

      const comments = [
        {
          id: "1",
          path: "src/file.ts",
          line: 10,
          body: "Minor suggestion",
          severity: "suggestion" as const,
          category: "style" as const,
        },
      ];

      const state = engine["determineReviewState"]("approved", comments);
      expect(state).toBe("approved");
    });
  });

  describe("Severity and category parsing", () => {
    it("should parse valid severities correctly", () => {
      const engine = new ReviewEngine(createMockLLM());

      expect(engine["parseSeverity"]("error")).toBe("error");
      expect(engine["parseSeverity"]("warning")).toBe("warning");
      expect(engine["parseSeverity"]("suggestion")).toBe("suggestion");
      expect(engine["parseSeverity"]("info")).toBe("info");
    });

    it("should default invalid severities to suggestion", () => {
      const engine = new ReviewEngine(createMockLLM());

      expect(engine["parseSeverity"]("invalid")).toBe("suggestion");
      expect(engine["parseSeverity"]("critical")).toBe("suggestion");
      expect(engine["parseSeverity"]("")).toBe("suggestion");
    });

    it("should parse valid categories correctly", () => {
      const engine = new ReviewEngine(createMockLLM());

      expect(engine["parseCategory"]("bug")).toBe("bug");
      expect(engine["parseCategory"]("security")).toBe("security");
      expect(engine["parseCategory"]("performance")).toBe("performance");
      expect(engine["parseCategory"]("readability")).toBe("readability");
      expect(engine["parseCategory"]("architecture")).toBe("architecture");
      expect(engine["parseCategory"]("testing")).toBe("testing");
      expect(engine["parseCategory"]("documentation")).toBe("documentation");
      expect(engine["parseCategory"]("style")).toBe("style");
      expect(engine["parseCategory"]("type-safety")).toBe("type-safety");
      expect(engine["parseCategory"]("error-handling")).toBe("error-handling");
      expect(engine["parseCategory"]("suggestion")).toBe("suggestion");
    });

    it("should default invalid categories to suggestion", () => {
      const engine = new ReviewEngine(createMockLLM());

      expect(engine["parseCategory"]("invalid")).toBe("suggestion");
      expect(engine["parseCategory"]("")).toBe("suggestion");
    });
  });

  describe("Comment normalization", () => {
    it("should add unique IDs to comments", () => {
      const engine = new ReviewEngine(createMockLLM());

      const rawComments = [
        {
          path: "src/file.ts",
          line: 10,
          body: "Comment 1",
          severity: "warning" as const,
          category: "bug" as const,
        },
        {
          path: "src/file.ts",
          line: 20,
          body: "Comment 2",
          severity: "suggestion" as const,
          category: "style" as const,
        },
      ];

      const normalized = engine["normalizeComments"](rawComments);

      expect(normalized[0].id).toBe("comment-0");
      expect(normalized[1].id).toBe("comment-1");
    });

    it("should handle comments without line numbers", () => {
      const engine = new ReviewEngine(createMockLLM());

      const rawComments = [
        {
          path: "src/file.ts",
          body: "General comment",
          severity: "info" as const,
          category: "documentation" as const,
        },
      ];

      const normalized = engine["normalizeComments"](rawComments);

      expect(normalized[0].line).toBeUndefined();
      expect(normalized[0].id).toBe("comment-0");
    });

    it("should handle startLine in comments", () => {
      const engine = new ReviewEngine(createMockLLM());

      const rawComments = [
        {
          path: "src/file.ts",
          line: 20,
          startLine: 10,
          body: "Multi-line comment",
          severity: "warning" as const,
          category: "bug" as const,
        },
      ];

      const normalized = engine["normalizeComments"](rawComments);

      expect(normalized[0].startLine).toBe(10);
      expect(normalized[0].line).toBe(20);
    });

    it("should preserve file paths as-is without normalization", () => {
      const engine = new ReviewEngine(createMockLLM());

      const rawComments = [
        { path: "./src/file.ts", line: 1, body: "Relative path", severity: "info" as const, category: "style" as const },
        { path: "../lib/util.ts", line: 5, body: "Parent relative", severity: "warning" as const, category: "bug" as const },
        { path: "src/deep/nested/file.ts", line: 10, body: "Absolute-like path", severity: "error" as const, category: "security" as const },
      ];

      const normalized = engine["normalizeComments"](rawComments);
      expect(normalized[0].path).toBe("./src/file.ts");
      expect(normalized[1].path).toBe("../lib/util.ts");
      expect(normalized[2].path).toBe("src/deep/nested/file.ts");
    });

    it("should generate unique threadIds per comment", () => {
      const engine = new ReviewEngine(createMockLLM());

      const rawComments = [
        { path: "src/file.ts", line: 10, body: "Comment A", severity: "info" as const, category: "style" as const },
        { path: "src/file.ts", line: 10, body: "Comment B", severity: "warning" as const, category: "bug" as const },
      ];

      const normalized = engine["normalizeComments"](rawComments);
      expect(normalized[0].threadId).toBeDefined();
      expect(normalized[1].threadId).toBeDefined();
    });
  });

  describe("Feedback context integration", () => {
    it("should inject feedback context into review prompts", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Check if feedback context is in prompt
        expect(prompt).toContain("Feedback Context");
        expect(prompt).toContain("Review Performance");

        return {
          content: {
            summary: "Review with feedback context",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 1500, outputTokens: 600 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      // Mock feedback functions
      vi.spyOn(feedback, "getFeedbackSummary").mockResolvedValue({
        helpful: 5,
        notHelpful: 2,
        patterns: ["thorough", "security-focused"],
      });

      vi.spyOn(feedback, "getRecentFeedback").mockResolvedValue([
        {
          buddyId: "test-buddy",
          reviewId: "review-1",
          commentId: "comment-1",
          wasHelpful: false,
          userResponse: "Too verbose, keep it concise",
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          buddyId: "test-buddy",
          reviewId: "review-2",
          commentId: "comment-2",
          wasHelpful: true,
          userResponse: "Great security analysis",
          timestamp: "2024-01-02T00:00:00Z",
        },
      ]);

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      const pr = createTestPR();

      await engine.reviewDiff(pr, "diff");

      // Verify feedback functions were called
      expect(feedback.getFeedbackSummary).toHaveBeenCalledWith("test-buddy");
      expect(feedback.getRecentFeedback).toHaveBeenCalledWith("test-buddy", 5);
    });

    it("should work without feedback context when not provided", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should NOT contain feedback context
        expect(prompt).not.toContain("Feedback Context");

        return {
          content: {
            summary: "Normal review",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      await engine.reviewDiff(pr, "diff");
    });

    it("should handle feedback loading errors gracefully", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should not contain feedback context if loading fails
        expect(prompt).not.toContain("Feedback Context");

        return {
          content: {
            summary: "Review without feedback due to error",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 1000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      vi.spyOn(feedback, "getFeedbackSummary").mockRejectedValue(new Error("Storage error"));
      vi.spyOn(feedback, "getRecentFeedback").mockRejectedValue(new Error("Storage error"));

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      const pr = createTestPR();

      // Should not throw, should continue without feedback
      const review = await engine.reviewDiff(pr, "diff");
      expect(review).toBeDefined();
      expect(review.summary).toContain("Review without feedback");
    });

    it("should inject feedback context into high-context review", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 2000, outputTokens: 800 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Check if feedback context is in high-context review prompt
        expect(prompt).toContain("Feedback Context");

        return {
          content: {
            summary: "High-context review with feedback",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 2000, outputTokens: 800 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      vi.spyOn(feedback, "getFeedbackSummary").mockResolvedValue({
        helpful: 3,
        notHelpful: 1,
        patterns: ["architecture"],
      });

      vi.spyOn(feedback, "getRecentFeedback").mockResolvedValue([]);

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      const pr = createTestPR();

      await engine.reviewWithContext(pr, "diff", ["src/file.ts"]);
    });

    it("should inject feedback context into chunked reviews", async () => {
      const largeDiff = "diff --git a/file.ts b/file.ts\n+large content\n".repeat(3000);

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 5000, outputTokens: 1000 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Each chunk should have feedback context
        expect(prompt).toContain("Feedback Context");

        return {
          content: {
            summary: "Chunk review",
            state: "commented" as const,
            comments: [],
          },
          usage: { inputTokens: 5000, outputTokens: 1000 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      vi.spyOn(feedback, "getFeedbackSummary").mockResolvedValue({
        helpful: 1,
        notHelpful: 0,
        patterns: [],
      });

      vi.spyOn(feedback, "getRecentFeedback").mockResolvedValue([]);

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      const pr = createTestPR();

      await engine.performReview(pr, largeDiff);
    });

    it("should include Avoid section for unhelpful feedback patterns", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        expect(prompt).toContain("Avoid");
        expect(prompt).toContain("Too verbose");

        return {
          content: { summary: "Review adjusted", state: "approved" as const, comments: [] },
          usage: { inputTokens: 1500, outputTokens: 600 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = { generate: mockGenerate, generateStructured: mockGenerateStructured };

      vi.spyOn(feedback, "getFeedbackSummary").mockResolvedValue({
        helpful: 3,
        notHelpful: 5,
        patterns: ["verbose", "generic"],
      });

      vi.spyOn(feedback, "getRecentFeedback").mockResolvedValue([
        {
          buddyId: "test-buddy", reviewId: "r1", commentId: "c1",
          wasHelpful: false, userResponse: "Too verbose, keep it concise", timestamp: "2024-01-01T00:00:00Z",
        },
        {
          buddyId: "test-buddy", reviewId: "r2", commentId: "c2",
          wasHelpful: false, userResponse: "Generic suggestions, be specific", timestamp: "2024-01-02T00:00:00Z",
        },
      ]);

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      await engine.reviewDiff(createTestPR(), "diff");

      expect(feedback.getFeedbackSummary).toHaveBeenCalledWith("test-buddy");
      expect(feedback.getRecentFeedback).toHaveBeenCalledWith("test-buddy", 5);
    });

    it("should include Continue section for helpful feedback patterns", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 1500, outputTokens: 600 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        expect(prompt).toContain("Continue");
        expect(prompt).toContain("security analysis");

        return {
          content: { summary: "Review reinforced", state: "approved" as const, comments: [] },
          usage: { inputTokens: 1500, outputTokens: 600 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = { generate: mockGenerate, generateStructured: mockGenerateStructured };

      vi.spyOn(feedback, "getFeedbackSummary").mockResolvedValue({
        helpful: 10,
        notHelpful: 1,
        patterns: ["security", "detailed"],
      });

      vi.spyOn(feedback, "getRecentFeedback").mockResolvedValue([
        {
          buddyId: "test-buddy", reviewId: "r1", commentId: "c1",
          wasHelpful: true, userResponse: "Great security analysis", timestamp: "2024-01-01T00:00:00Z",
        },
        {
          buddyId: "test-buddy", reviewId: "r2", commentId: "c2",
          wasHelpful: true, userResponse: "Detailed explanation helped", timestamp: "2024-01-02T00:00:00Z",
        },
      ]);

      const engine = new ReviewEngine(mockLLM, [], 8000, undefined, { buddyId: "test-buddy" });
      await engine.reviewDiff(createTestPR(), "diff");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty diff gracefully", async () => {
      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Empty diff should still be sent to LLM
        expect(prompt).toBeDefined();

        return {
          content: {
            summary: "No changes to review",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 100, outputTokens: 50 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, "");

      expect(review).toBeDefined();
      expect(review.summary).toContain("No changes");
      expect(review.comments).toHaveLength(0);
      expect(review.state).toBe("approved");
    });

    it("should handle very large diff without hanging", async () => {
      // Create a large diff (100KB of text)
      const largeDiff = "diff --git a/large.ts b/large.ts\n" +
        "index 123..456 789\n" +
        "--- a/large.ts\n" +
        "+++ b/large.ts\n" +
        "@@ -1,1 +1,1 @@\n" +
        "-old\n" +
        "+new\n".repeat(5000);

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 25000, outputTokens: 500 },
        model: "claude-3-5-sonnet",
      })) as any;

      const startTime = Date.now();
      let processingTime = 0;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Verify diff was truncated
        expect(prompt.length).toBeLessThanOrEqual(32000); // maxTokensPerReview * 4

        processingTime = Date.now() - startTime;
        return {
          content: {
            summary: "Large diff reviewed",
            state: "commented" as const,
            comments: [],
          },
          usage: { inputTokens: 8000, outputTokens: 500 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM, [], 8000);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, largeDiff);

      expect(review).toBeDefined();
      // Should complete within reasonable time (less than 5 seconds for the test)
      expect(processingTime).toBeLessThan(5000);
      expect(review.metadata.reviewType).toBe("low-context");
    });

    it("should handle binary file changes", async () => {
      // Binary files have no text content in diff
      const binaryDiff = `diff --git a/image.png b/image.png
index 1234567..abcdef 1234567
Binary files a/image.png and b/image.png differ

diff --git a/data.bin b/data.bin
index 1000000..2000000 1000000
Binary files a/data.bin and b/data.bin differ

diff --git a/code.ts b/code.ts
index 111..222 333
--- a/code.ts
+++ b/code.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 500, outputTokens: 200 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Binary files should be in the diff
        expect(prompt).toContain("Binary files");

        return {
          content: {
            summary: "Review with binary changes",
            state: "approved" as const,
            comments: [
              {
                path: "code.ts",
                line: 2,
                body: "Changed value",
                severity: "suggestion" as const,
                category: "style" as const,
              },
            ],
          },
          usage: { inputTokens: 500, outputTokens: 200 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, binaryDiff);

      expect(review).toBeDefined();
      expect(review.summary).toContain("binary");
      // Should only comment on code files, not binary files
      expect(review.comments).toHaveLength(1);
      expect(review.comments[0].path).toBe("code.ts");
    });

    it("should handle deleted files", async () => {
      const deletedFilesDiff = `diff --git a/old-file.ts b/old-file.ts
deleted file mode 100644
index 1234567..0000000
--- a/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export function oldFunction() {
-  return "removed";
-}

diff --git a/another-deleted.ts b/another-deleted.ts
deleted file mode 100644
index abcdef..0000000
--- a/another-deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const old = "value";
-console.log(old);

diff --git a/kept.ts b/kept.ts
index 111..222 333
--- a/kept.ts
+++ b/kept.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 600, outputTokens: 250 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should include deleted file markers
        expect(prompt).toContain("deleted file mode");
        expect(prompt).toContain("/dev/null");

        return {
          content: {
            summary: "Review with deleted files",
            state: "commented" as const,
            comments: [
              {
                path: "old-file.ts",
                body: "This file was deleted",
                severity: "info" as const,
                category: "documentation" as const,
              },
              {
                path: "kept.ts",
                line: 2,
                body: "Minor change",
                severity: "suggestion" as const,
                category: "style" as const,
              },
            ],
          },
          usage: { inputTokens: 600, outputTokens: 250 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, deletedFilesDiff);

      expect(review).toBeDefined();
      expect(review.summary).toContain("deleted");
      // Should handle both deleted and modified files
      expect(review.comments.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle rename-only changes", async () => {
      const renameDiff = `diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts

diff --git a/another-old.ts b/another-new.ts
similarity index 100%
rename from another-old.ts
rename to another-new.ts`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 400, outputTokens: 150 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should include rename markers
        expect(prompt).toContain("rename from");
        expect(prompt).toContain("rename to");
        expect(prompt).toContain("similarity index 100%");

        return {
          content: {
            summary: "Files renamed with no content changes",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 400, outputTokens: 150 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, renameDiff);

      expect(review).toBeDefined();
      expect(review.summary).toContain("rename");
      expect(review.state).toBe("approved");
      expect(review.comments).toHaveLength(0);
    });

    it("should handle mixed diff with multiple edge cases", async () => {
      const mixedDiff = `diff --git a/binary.png b/binary.png
Binary files a/binary.png and b/binary.png differ

diff --git a/deleted.ts b/deleted.ts
deleted file mode 100644
index 123..000 456
--- a/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const old = "value";

diff --git a/renamed-old.ts b/renamed-new.ts
similarity index 100%
rename from renamed-old.ts
rename to renamed-new.ts

diff --git a/modified.ts b/modified.ts
index 111..222 333
--- a/modified.ts
+++ b/modified.ts
@@ -1,1 +1,1 @@
-const x = 1;
+const x = 2;

diff --git a/empty.ts b/empty.ts
new file mode 100644
index 0000000..1234567`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 800, outputTokens: 300 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should handle all types of changes
        expect(prompt).toContain("Binary files");
        expect(prompt).toContain("deleted file mode");
        expect(prompt).toContain("rename from");
        expect(prompt).toContain("rename to");
        expect(prompt).toContain("@@");

        return {
          content: {
            summary: "Mixed changes: binary, deletions, renames, and modifications",
            state: "commented" as const,
            comments: [
              {
                path: "modified.ts",
                line: 2,
                body: "Value changed",
                severity: "suggestion" as const,
                category: "style" as const,
              },
              {
                path: "deleted.ts",
                body: "File removed",
                severity: "info" as const,
                category: "documentation" as const,
              },
            ],
          },
          usage: { inputTokens: 800, outputTokens: 300 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, mixedDiff);

      expect(review).toBeDefined();
      expect(review.comments).toHaveLength(2);
      // Should have comment on modified file
      expect(review.comments.some(c => c.path === "modified.ts")).toBe(true);
      // Should have comment on deleted file
      expect(review.comments.some(c => c.path === "deleted.ts")).toBe(true);
    });

    it("should handle diff with only whitespace changes", async () => {
      const whitespaceDiff = `diff --git a/file.ts b/file.ts
index 111..222 333
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-const x=1;
+const x = 1;
-const y=2;
+const y = 2;
-const z=3;
+const z = 3;`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 300, outputTokens: 150 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Only whitespace changes detected",
          state: "approved" as const,
          comments: [],
        },
        usage: { inputTokens: 300, outputTokens: 150 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, whitespaceDiff);

      expect(review).toBeDefined();
      expect(review.state).toBe("approved");
    });

    it("should handle diff with special characters and unicode", async () => {
      const unicodeDiff = `diff --git a/file.ts b/file.ts
index 111..222 333
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
-const msg = "hello";
+const msg = "你好世界";
-const emoji = "test";
+const emoji = "🚀🎉";
-const special = "normal";
+const special = "©®™€£¥";`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 400, outputTokens: 200 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async (messages) => {
        const prompt = messages[0].content as string;
        // Should handle unicode characters
        expect(prompt).toContain("你好世界");
        expect(prompt).toContain("🚀🎉");

        return {
          content: {
            summary: "Unicode and special characters added",
            state: "approved" as const,
            comments: [],
          },
          usage: { inputTokens: 400, outputTokens: 200 },
          model: "claude-3-5-sonnet",
        };
      }) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, unicodeDiff);

      expect(review).toBeDefined();
      expect(review.summary).toContain("Unicode");
    });

    it("should handle review with single-line file change", async () => {
      const singleLineDiff = `diff --git a/file.ts b/file.ts
index 1234567..abcdefg 100644
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-const x = 1;
+const x = 2;`;

      const mockGenerate = vi.fn(async () => ({
        content: "Mock",
        usage: { inputTokens: 200, outputTokens: 100 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockGenerateStructured = vi.fn(async () => ({
        content: {
          summary: "Minor change reviewed",
          state: "approved" as const,
          comments: [
            {
              path: "file.ts",
              line: 2,
              body: "Consider naming this constant",
              severity: "suggestion",
              category: "readability",
            },
          ],
        },
        usage: { inputTokens: 200, outputTokens: 100 },
        model: "claude-3-5-sonnet",
      })) as any;

      const mockLLM: LLMProvider = {
        generate: mockGenerate,
        generateStructured: mockGenerateStructured,
      };

      const engine = new ReviewEngine(mockLLM);
      const pr = createTestPR();

      const review = await engine.reviewDiff(pr, singleLineDiff);

      expect(review).toBeDefined();
      expect(review.comments).toHaveLength(1);
      expect(review.comments[0].path).toBe("file.ts");
    });
  });

  describe("Dependency change detection", () => {
    it("should detect package.json additions", () => {
      const engine = new ReviewEngine(createMockLLM());
      const diff = `diff --git a/package.json b/package.json
index abc..def 100644
--- a/package.json
+++ b/package.json
@@ -1,5 +1,6 @@
 {
   "name": "my-app",
-  "lodash": "^4.17.0",
+  "lodash": "^4.18.0",
+  "express": "^4.18.2"
 }`;
      const changes = engine["parseDependencyChanges"](diff);
      expect(changes.length).toBeGreaterThanOrEqual(1);
      const express = changes.find((c: any) => c.package === "express");
      expect(express).toBeDefined();
      expect(express.type).toBe("added");
      expect(express.version).toBe("^4.18.2");
    });

    it("should detect package.json removals", () => {
      const engine = new ReviewEngine(createMockLLM());
      const diff = `diff --git a/package.json b/package.json
index abc..def 100644
--- a/package.json
+++ b/package.json
@@ -5,7 +5,6 @@
   "express": "^4.18.2",
-  "moment": "^2.29.0"
 }`;
      const changes = engine["parseDependencyChanges"](diff);
      const moment = changes.find((c: any) => c.package === "moment");
      expect(moment).toBeDefined();
      expect(moment.type).toBe("removed");
    });

    it("should return empty array when no dependency files are in diff", () => {
      const engine = new ReviewEngine(createMockLLM());
      const diff = `diff --git a/src/index.ts b/src/index.ts
index abc..def 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,1 +1,2 @@
+export const x = 1;`;
      const changes = engine["parseDependencyChanges"](diff);
      expect(changes).toHaveLength(0);
    });

    it("should detect changes in various lock and manifest files", () => {
      const engine = new ReviewEngine(createMockLLM());
      const diff = `diff --git a/yarn.lock b/yarn.lock
index abc..def 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1,1 +1,2 @@
+express@^4.18.2:
+  version "4.18.2"
diff --git a/Cargo.toml b/Cargo.toml
index abc..def 100644
--- a/Cargo.toml
+++ b/Cargo.toml
@@ -1,1 +1,2 @@
+serde = "1.0.0"`;
      const changes = engine["parseDependencyChanges"](diff);
      expect(changes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
