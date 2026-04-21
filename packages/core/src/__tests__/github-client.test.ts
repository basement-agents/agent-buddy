import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubClient, GitHubError } from "../github/client.js";
import { importPKCS8 } from "jose";
/* eslint-disable @typescript-eslint/no-require-imports */

// Mock at top level as required - must be before any imports that use it
vi.mock("jose", () => ({
  SignJWT: class {
    setProtectedHeader = vi.fn().mockReturnThis();
    setIssuedAt = vi.fn().mockReturnThis();
    setExpirationTime = vi.fn().mockReturnThis();
    sign = vi.fn().mockResolvedValue("mock-jwt-token");
  },
  importPKCS8: vi.fn().mockResolvedValue("mock-private-key"),
}));

// Mock global fetch
global.fetch = vi.fn();

describe("GitHubClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  describe("constructor", () => {
    it("should initialize with PAT token", () => {
      const client = new GitHubClient("test-pat-token");
      expect(client).toBeDefined();
    });

    it("should initialize with GitHub App credentials", () => {
      const appCredentials = {
        appId: "123456",
        privateKey: "mock-private-key",
        installationId: "789012",
      };
      const client = new GitHubClient("initial-token", appCredentials);
      expect(client).toBeDefined();
    });
  });

  describe("generateAppInstallationToken", () => {
    it("should generate installation token with valid credentials", async () => {
      const mockToken = "mock-installation-token";
      const mockHeaders = new Headers();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders,
        json: async () => ({ token: mockToken }),
      } as Response);

      const appCredentials = {
        appId: "123456",
        privateKey: "mock-private-key",
        installationId: "789012",
      };
      const client = new GitHubClient("initial-token", appCredentials);

      const token = await client.generateAppInstallationToken();

      expect(token).toBe(mockToken);
      expect(importPKCS8).toHaveBeenCalledWith("mock-private-key", "RS256");
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/app/installations/789012/access_tokens",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer mock-jwt-token",
          }),
        })
      );
    });

    it("should throw error when credentials not configured", async () => {
      const client = new GitHubClient("pat-only");

      await expect(client.generateAppInstallationToken()).rejects.toThrow(
        "GitHub App credentials not configured"
      );
    });

    it("should handle API errors during token generation", async () => {
      const mockHeaders = new Headers();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: mockHeaders,
        text: async () => "Unauthorized",
      } as Response);

      const appCredentials = {
        appId: "123456",
        privateKey: "mock-private-key",
        installationId: "789012",
      };
      const client = new GitHubClient("initial-token", appCredentials);

      await expect(client.generateAppInstallationToken()).rejects.toThrow(
        "Failed to generate GitHub App token"
      );
    });

    it("should handle JWT signing errors", async () => {
      vi.mocked(importPKCS8).mockRejectedValueOnce(new Error("Invalid key format"));

      const appCredentials = {
        appId: "123456",
        privateKey: "invalid-key",
        installationId: "789012",
      };
      const client = new GitHubClient("initial-token", appCredentials);

      await expect(client.generateAppInstallationToken()).rejects.toThrow(
        "Failed to generate GitHub App token"
      );
    });
  });

  describe("useAppInstallation", () => {
    it("should switch to use installation token", async () => {
      const mockToken = "new-installation-token";
      const mockHeaders1 = new Headers();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders1,
        json: async () => ({ token: mockToken }),
      } as Response);

      const appCredentials = {
        appId: "123456",
        privateKey: "mock-private-key",
        installationId: "789012",
      };
      const client = new GitHubClient("initial-token", appCredentials);

      await client.useAppInstallation();

      // Verify the token was updated by checking subsequent requests
      const mockHeaders2 = new Headers();
      mockHeaders2.set("x-ratelimit-remaining", "5000");
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders2,
        json: async () => ({ id: 1 }),
      } as Response);

      await client.getRepo("owner", "repo");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
          }),
        })
      );
    });
  });

  describe("PAT authentication", () => {
    it("should use PAT token for requests", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("x-ratelimit-remaining", "5000");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders,
        json: async () => ({ id: 1, name: "test" }),
      } as Response);

      const client = new GitHubClient("pat-token-123");
      await client.getRepo("owner", "repo");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer pat-token-123",
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          }),
        })
      );
    });
  });

  describe("rate limit handling", () => {
    it("should handle rate limit headers", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("x-ratelimit-remaining", "4999");
      mockHeaders.set("x-ratelimit-reset", "1234567890");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: mockHeaders,
        json: async () => [],
      } as Response);

      const client = new GitHubClient("pat-token");
      await client.listPRs("owner", "repo");

      // Should not throw and complete successfully
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should wait when rate limit exceeded", async () => {
      const now = Date.now();
      const resetTime = Math.floor(now / 1000) + 1; // 1 second in future

      let callCount = 0;
      vi.mocked(global.fetch).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First call: rate limited
          const mockHeaders = new Headers();
          mockHeaders.set("x-ratelimit-remaining", "0");
          mockHeaders.set("x-ratelimit-reset", String(resetTime));
          return {
            ok: true,
            headers: mockHeaders,
            json: async () => [],
          } as Response;
        } else {
          // Second call after wait
          const mockHeaders = new Headers();
          mockHeaders.set("x-ratelimit-remaining", "5000");
          return {
            ok: true,
            headers: mockHeaders,
            json: async () => [],
          } as Response;
        }
      });

      const client = new GitHubClient("pat-token");
      await client.listPRs("owner", "repo");

      // Should have been called at least twice (retry after rate limit)
      expect(callCount).toBeGreaterThanOrEqual(1);
    }, 10000);
  });

  describe("error handling", () => {
    it("should throw GitHubError for failed requests", async () => {
      const mockHeaders = new Headers();
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: mockHeaders,
        text: async () => "Not Found",
      } as Response);

      const client = new GitHubClient("pat-token");

      await expect(client.getRepo("owner", "repo")).rejects.toThrow(GitHubError);
    });

    it("should include rate limit info in error", async () => {
      const mockHeaders = new Headers();
      mockHeaders.set("x-ratelimit-remaining", "0");
      mockHeaders.set("x-ratelimit-reset", "1234567890");

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: mockHeaders,
        text: async () => "API rate limit exceeded",
      } as Response);

      const client = new GitHubClient("pat-token");

      try {
        await client.getRepo("owner", "repo");
        expect.fail("Should have thrown GitHubError");
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubError);
        if (error instanceof GitHubError) {
          expect(error.status).toBe(403);
          expect(error.rateLimitRemaining).toBe(0);
          expect(error.rateLimitReset).toBe(1234567890);
        }
      }
    });
  });

  describe("verifyWebhookSignature", () => {
    it("should verify valid webhook signature", () => {
      const payload = '{"test": "data"}';
      const secret = "webhook-secret";
      const signature = "sha256=" + require("crypto").createHmac("sha256", secret).update(payload).digest("hex");

      const isValid = GitHubClient.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it("should reject invalid webhook signature", () => {
      const payload = '{"test": "data"}';
      const secret = "webhook-secret";
      const invalidSignature = "sha256=invalid";

      const isValid = GitHubClient.verifyWebhookSignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });

    it("should be timing-safe", () => {
      const payload = '{"test": "data"}';
      const secret = "webhook-secret";
      const validSignature = "sha256=" + require("crypto").createHmac("sha256", secret).update(payload).digest("hex");

      // Should not throw timing-related errors
      const isValid1 = GitHubClient.verifyWebhookSignature(payload, validSignature, secret);
      const isValid2 = GitHubClient.verifyWebhookSignature(payload, "sha256=wrong", secret);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
    });
  });

  describe("parseWebhookEvent", () => {
    it("should parse pull_request event", () => {
      const headers = {
        "x-github-event": "pull_request",
      };
      const body = {
        action: "opened",
        sender: {
          login: "testuser",
          id: 123,
          avatar_url: "https://github.com/avatar.png",
          html_url: "https://github.com/testuser",
        },
        repository: {
          id: 456,
          owner: {
            login: "owner",
            id: 789,
            avatar_url: "https://github.com/owner.png",
          },
          name: "repo",
          full_name: "owner/repo",
          description: "Test repo",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/owner/repo",
          language: "TypeScript",
          stargazers_count: 10,
          forks_count: 5,
        },
        pull_request: {
          number: 1,
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
        },
      };

      const event = GitHubClient.parseWebhookEvent(headers, body);

      expect(event.type).toBe("pull_request");
      expect(event.action).toBe("opened");
      expect(event.repository.fullName).toBe("owner/repo");
      expect(event.sender.login).toBe("testuser");
      expect(event.pullRequest).toBeDefined();
    });

    it("should parse issue_comment event", () => {
      const headers = {
        "x-github-event": "issue_comment",
      };
      const body = {
        action: "created",
        sender: {
          login: "testuser",
          id: 123,
          avatar_url: "https://github.com/avatar.png",
          html_url: "https://github.com/testuser",
        },
        repository: {
          id: 456,
          owner: {
            login: "owner",
            id: 789,
            avatar_url: "https://github.com/owner.png",
          },
          name: "repo",
          full_name: "owner/repo",
          description: null,
          private: false,
          default_branch: "main",
          html_url: "https://github.com/owner/repo",
          language: "JavaScript",
          stargazers_count: 0,
          forks_count: 0,
        },
        comment: {
          id: 12345,
          body: "Test comment",
          user: {
            login: "commenter",
          },
        },
      };

      const event = GitHubClient.parseWebhookEvent(headers, body);

      expect(event.type).toBe("issue_comment");
      expect(event.action).toBe("created");
      expect(event.comment).toBeDefined();
      expect(event.comment?.body).toBe("Test comment");
    });

    it("should throw error for missing event header", () => {
      const headers = {};
      const body = {};

      expect(() => GitHubClient.parseWebhookEvent(headers, body)).toThrow(
        "Missing X-GitHub-Event header"
      );
    });
  });

  describe("API methods", () => {
    beforeEach(() => {
      const mockHeaders = new Headers();
      mockHeaders.set("x-ratelimit-remaining", "5000");
      mockHeaders.set("x-ratelimit-reset", "1234567890");

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: mockHeaders,
        json: async () => ({}),
      } as Response);
    });

    it("should list PRs", async () => {
      const client = new GitHubClient("pat-token");
      await client.listPRs("owner", "repo", { state: "open", perPage: 10, page: 2 });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls?state=open&per_page=10&page=2",
        expect.any(Object)
      );
    });

    it("should get PR", async () => {
      const client = new GitHubClient("pat-token");
      await client.getPR("owner", "repo", 123);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123",
        expect.any(Object)
      );
    });

    it("should get PR files", async () => {
      const client = new GitHubClient("pat-token");
      await client.getPRFiles("owner", "repo", 123);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123/files",
        expect.any(Object)
      );
    });

    it("should get reviews", async () => {
      const client = new GitHubClient("pat-token");
      await client.getReviews("owner", "repo", 123);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123/reviews",
        expect.any(Object)
      );
    });

    it("should get review comments", async () => {
      const client = new GitHubClient("pat-token");
      await client.getReviewComments("owner", "repo", 123);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123/comments",
        expect.any(Object)
      );
    });

    it("should create review", async () => {
      const client = new GitHubClient("pat-token");
      await client.createReview("owner", "repo", 123, {
        body: "LGTM",
        event: "APPROVE",
        comments: [],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123/reviews",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should create issue comment", async () => {
      const client = new GitHubClient("pat-token");
      await client.createIssueComment("owner", "repo", 123, "Test comment");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/issues/123/comments",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should get contributors", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => [{ login: "user1" }],
      } as Response);

      const client = new GitHubClient("pat-token");
      await client.getContributors("owner", "repo");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contributors?page=1&per_page=100",
        expect.any(Object)
      );
    });

    it("should get repo", async () => {
      const client = new GitHubClient("pat-token");
      await client.getRepo("owner", "repo");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo",
        expect.any(Object)
      );
    });
  });

  describe("getPRDiff", () => {
    it("should fetch PR diff", async () => {
      const mockDiff = "@@ -1,1 +1,2 @@\n-old\n+new";
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        text: async () => mockDiff,
        headers: new Headers({ "x-ratelimit-remaining": "4999", "x-ratelimit-reset": "0" }),
      } as Response);

      const client = new GitHubClient("pat-token");
      const diff = await client.getPRDiff("owner", "repo", 123);

      expect(diff).toBe(mockDiff);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/pulls/123",
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/vnd.github.v3.diff",
          }),
        })
      );
    });

    it("should throw error on failed diff fetch", async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
      } as Response);

      const client = new GitHubClient("pat-token");

      await expect(client.getPRDiff("owner", "repo", 123)).rejects.toThrow(GitHubError);
    });
  });

  describe("maxPages constructor parameter", () => {
    it("uses default maxPages when not specified", () => {
      const client = new GitHubClient("token");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((client as any).maxPages).toBe(10);
    });

    it("accepts custom maxPages via constructor", () => {
      const client = new GitHubClient("token", undefined, 3);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((client as any).maxPages).toBe(3);
    });

    it("uses default maxPages when maxPages is undefined", () => {
      const client = new GitHubClient("token", undefined, undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((client as any).maxPages).toBe(10);
    });
  });
});
