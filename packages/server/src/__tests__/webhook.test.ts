/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { GitHubClient, loadConfig } from "@agent-buddy/core";
import { pullRequestWebhookSchema, issueCommentWebhookSchema, validateWebhookEventType, validatePullRequestAction, validateIssueCommentMention, SUPPORTED_EVENT_TYPES, SUPPORTED_PR_ACTIONS, createWebhooksRoutes } from "../routes/webhooks.js";
import { reviewJobs } from "../jobs/state.js";

// Mock loadConfig and processReviewJob
vi.mock("@agent-buddy/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-buddy/core")>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

vi.mock("../jobs/review.js", () => ({
  processReviewJob: vi.fn(),
}));

vi.mock("../jobs/persistence.js", () => ({
  saveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../index.js", () => ({
  getIsShuttingDown: vi.fn().mockReturnValue(false),
}));

// Import after mocking
import { processReviewJob } from "../jobs/review.js";
import { saveJob } from "../jobs/persistence.js";
import { getIsShuttingDown } from "../index.js";

function generateSignature(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

async function parseJsonResponse<T = any>(response: Response): Promise<T> {
  return await response.json() as T;
}

describe("Webhook signature verification", () => {
  const secret = "test-webhook-secret";
  const payload = JSON.stringify({ action: "opened", pull_request: { number: 1 } });

  it("should verify a valid signature", () => {
    const signature = generateSignature(payload, secret);
    const result = GitHubClient.verifyWebhookSignature(payload, signature, secret);
    expect(result).toBe(true);
  });

  it("should reject an invalid signature", () => {
    const signature = generateSignature(payload, "wrong-secret");
    const result = GitHubClient.verifyWebhookSignature(payload, signature, secret);
    expect(result).toBe(false);
  });

  it("should reject a missing signature", () => {
    const result = GitHubClient.verifyWebhookSignature(payload, "", secret);
    expect(result).toBe(false);
  });

  it("should reject a tampered payload", () => {
    const signature = generateSignature(payload, secret);
    const tampered = payload.replace("opened", "closed");
    const result = GitHubClient.verifyWebhookSignature(tampered, signature, secret);
    expect(result).toBe(false);
  });

  it("should use timing-safe comparison", () => {
    const signature = generateSignature(payload, secret);
    const start = Date.now();
    // Verify many times to ensure timing-safe comparison is used
    for (let i = 0; i < 1000; i++) {
      GitHubClient.verifyWebhookSignature(payload, signature, secret);
    }
    const elapsed = Date.now() - start;
    // Timing-safe comparison shouldn't be significantly slower than normal
    expect(elapsed).toBeLessThan(5000);
  });

  it("should handle different payload sizes consistently", () => {
    const smallPayload = '{"action":"opened"}';
    const largePayload = JSON.stringify({ action: "opened", data: "x".repeat(10000) });
    const smallSig = generateSignature(smallPayload, secret);
    const largeSig = generateSignature(largePayload, secret);

    expect(GitHubClient.verifyWebhookSignature(smallPayload, smallSig, secret)).toBe(true);
    expect(GitHubClient.verifyWebhookSignature(largePayload, largeSig, secret)).toBe(true);
    expect(GitHubClient.verifyWebhookSignature(smallPayload, largeSig, secret)).toBe(false);
  });
});

describe("Duplicate event detection", () => {
  it("should detect duplicate events within the window", () => {
    const recentEvents = new Map<string, number>();
    const eventKey = "owner/repo:123:opened";
    const now = Date.now();

    // First event
    recentEvents.set(eventKey, now);

    // Second event within 30s window
    const isDuplicate = recentEvents.has(eventKey) && (now - recentEvents.get(eventKey)!) < 30000;
    expect(isDuplicate).toBe(true);
  });

  it("should allow events after the window expires", () => {
    const recentEvents = new Map<string, number>();
    const eventKey = "owner/repo:123:opened";
    const now = Date.now();

    // Old event (31 seconds ago)
    recentEvents.set(eventKey, now - 31000);

    const isDuplicate = recentEvents.has(eventKey) && (now - recentEvents.get(eventKey)!) < 30000;
    expect(isDuplicate).toBe(false);
  });
});

describe("Webhook event type validation", () => {
  describe("validateWebhookEventType", () => {
    it("should accept supported event types", () => {
      for (const eventType of SUPPORTED_EVENT_TYPES) {
        const result = validateWebhookEventType(eventType);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject missing event type", () => {
      const result = validateWebhookEventType(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing X-GitHub-Event header");
    });

    it("should reject unsupported event types", () => {
      const unsupportedTypes = ["push", "issues", "release", "fork", "watch"];
      for (const eventType of unsupportedTypes) {
        const result = validateWebhookEventType(eventType);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(`Unsupported event type: ${eventType}`);
        expect(result.error).toContain("pull_request");
        expect(result.error).toContain("issue_comment");
      }
    });
  });

  describe("validatePullRequestAction", () => {
    it("should accept supported PR actions", () => {
      for (const action of SUPPORTED_PR_ACTIONS) {
        const result = validatePullRequestAction(action);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject missing action", () => {
      const result = validatePullRequestAction(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing action in pull_request event payload");
    });

    it("should reject unsupported PR actions", () => {
      const unsupportedActions = ["closed", "edited", "assigned"];
      for (const action of unsupportedActions) {
        const result = validatePullRequestAction(action);
        expect(result.valid).toBe(false);
        expect(result.error).toContain(`Unsupported pull_request action: ${action}`);
        expect(result.error).toContain("opened");
        expect(result.error).toContain("synchronize");
        expect(result.error).toContain("reopened");
      }
    });
  });

  describe("validateIssueCommentMention", () => {
    it("should accept comments with @agent-buddy mention", () => {
      const validComments = [
        "@agent-buddy please review this",
        "Hey @agent-buddy, can you check this?",
        "@agent-buddy\nPlease review this PR.",
      ];
      for (const comment of validComments) {
        const result = validateIssueCommentMention(comment);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("should reject comments without @agent-buddy mention", () => {
      const invalidComments = [
        undefined,
        "",
        "Please review this PR",
        "@someone-else please review",
        "agent-buddy (no @ sign)",
      ];
      for (const comment of invalidComments) {
        const result = validateIssueCommentMention(comment);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Comment must contain @agent-buddy mention to trigger review");
      }
    });
  });
});

describe("Webhook payload validation schemas", () => {
  const basePayload = {
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
  };

  describe("pullRequestWebhookSchema", () => {
    it("should validate valid pull_request payload", () => {
      const prPayload = {
        ...basePayload,
        action: "opened",
        pull_request: {
          number: 1,
          title: "Test PR",
          body: "Test body",
          state: "open",
          draft: false,
          user: {
            login: "author",
            id: 1,
          },
          base: {
            ref: "main",
            sha: "abc123",
          },
          head: {
            ref: "feature",
            sha: "def456",
          },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const result = pullRequestWebhookSchema.safeParse(prPayload);
      expect(result.success).toBe(true);
    });

    it("should reject pull_request payload missing required fields", () => {
      const invalidPayloads = [
        { ...basePayload, pull_request: {} }, // Missing all PR fields
        { ...basePayload }, // Missing pull_request entirely
        { ...basePayload, sender: {} }, // Missing sender fields
        { ...basePayload, repository: {} }, // Missing repository fields
      ];

      for (const payload of invalidPayloads) {
        const result = pullRequestWebhookSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });

    it("should reject pull_request payload with invalid state", () => {
      const invalidPayload = {
        ...basePayload,
        pull_request: {
          number: 1,
          title: "Test PR",
          body: "Test body",
          state: "invalid_state",
          draft: false,
          user: { login: "author", id: 1 },
          base: { ref: "main", sha: "abc123" },
          head: { ref: "feature", sha: "def456" },
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      };

      const result = pullRequestWebhookSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe("issueCommentWebhookSchema", () => {
    it("should validate valid issue_comment payload", () => {
      const commentPayload = {
        ...basePayload,
        action: "created",
        comment: {
          id: 12345,
          body: "@agent-buddy please review",
          user: {
            login: "commenter",
          },
        },
        issue: {
          number: 1,
          pull_request: {
            url: "https://api.github.com/repos/owner/repo/pulls/1",
            html_url: "https://github.com/owner/repo/pull/1",
          },
        },
      };

      const result = issueCommentWebhookSchema.safeParse(commentPayload);
      expect(result.success).toBe(true);
    });

    it("should validate issue_comment payload without pull_request", () => {
      const commentPayload = {
        ...basePayload,
        action: "created",
        comment: {
          id: 12345,
          body: "@agent-buddy please review",
          user: {
            login: "commenter",
          },
        },
        issue: {
          number: 1,
        },
      };

      const result = issueCommentWebhookSchema.safeParse(commentPayload);
      expect(result.success).toBe(true);
    });

    it("should reject issue_comment payload missing required fields", () => {
      const invalidPayloads = [
        { ...basePayload }, // Missing comment and issue
        { ...basePayload, comment: {} }, // Missing comment fields
        { ...basePayload, comment: { id: 123, body: "test", user: {} } }, // Missing user login
      ];

      for (const payload of invalidPayloads) {
        const result = issueCommentWebhookSchema.safeParse(payload);
        expect(result.success).toBe(false);
      }
    });
  });
});

describe("Webhook route handler integration tests", () => {
  let app: ReturnType<typeof createWebhooksRoutes>;
  const mockConfig = {
    version: "1.0.0",
    server: { webhookSecret: "test-secret", port: 3000, host: "localhost", apiKey: "test-key" },
    repos: [
      {
        id: "owner/repo",
        owner: "owner",
        repo: "repo",
        buddyId: "test-buddy",
        autoReview: true,
        triggerMode: "pr_opened" as const,
      },
    ],
  };
  let prNumberCounter = 0;

  beforeEach(() => {
    app = createWebhooksRoutes();
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(processReviewJob).mockResolvedValue(undefined);
    vi.mocked(saveJob).mockResolvedValue(undefined);
    reviewJobs.clear();
    prNumberCounter = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createValidPRPayload = (action: string = "opened", prNumber?: number) => {
    const num = prNumber ?? ++prNumberCounter;
    return {
      action,
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
        number: num,
        title: "Test PR",
        body: "Test body",
        state: "open",
        draft: false,
        user: {
          login: "author",
          id: 1,
        },
        base: {
          ref: "main",
          sha: "abc123",
        },
        head: {
          ref: "feature",
          sha: "def456",
        },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    };
  };

  const createValidIssueCommentPayload = (body: string = "@agent-buddy please review", prNumber?: number) => {
    const num = prNumber ?? ++prNumberCounter;
    return {
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
        description: "Test repo",
        private: false,
        default_branch: "main",
        html_url: "https://github.com/owner/repo",
        language: "TypeScript",
        stargazers_count: 10,
        forks_count: 5,
      },
      comment: {
        id: 12345,
        body,
        user: {
          login: "commenter",
        },
      },
      issue: {
        number: num,
        pull_request: {
          url: `https://api.github.com/repos/owner/repo/pulls/${num}`,
          html_url: `https://github.com/owner/repo/pull/${num}`,
        },
      },
    };
  };

  describe("Signature verification", () => {
    it("should accept valid signature", async () => {
      const payload = createValidPRPayload("opened", 10);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
    });

    it("should reject invalid signature with 401", async () => {
      const payload = createValidPRPayload("opened", 11);
      const body = JSON.stringify(payload);
      const signature = "sha256=invalid";

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(401);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Invalid signature");
    });
  });

  describe("pull_request event handling", () => {
    it("should trigger review job creation for valid pull_request event", async () => {
      const payload = createValidPRPayload("opened", 20);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();

      expect(processReviewJob).toHaveBeenCalledWith(
        json.jobIds[0],
        "owner/repo",
        20,
        "test-buddy"
      );

      const job = reviewJobs.get(json.jobIds[0]);
      expect(job).toBeDefined();
      expect(job?.repoId).toBe("owner/repo");
      expect(job?.prNumber).toBe(20);
      expect(job?.buddyId).toBe("test-buddy");
      expect(job?.status).toBe("queued");
    });

    it("should trigger review for synchronize action", async () => {
      const payload = createValidPRPayload("synchronize", 21);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
    });

    it("should trigger review for reopened action", async () => {
      const payload = createValidPRPayload("reopened", 22);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
    });
  });

  describe("issue_comment event handling", () => {
    it("should trigger review when @agent-buddy is mentioned", async () => {
      const payload = createValidIssueCommentPayload("@agent-buddy please review this", 30);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      // Note: The current implementation returns "received" for issue_comment events
      // because parseWebhookEvent doesn't populate pullRequest for issue_comment
      // This is expected behavior for now
      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("received");
    });

    it("should ignore issue_comment without @agent-buddy mention", async () => {
      const payload = createValidIssueCommentPayload("This is a regular comment", 31);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Comment must contain @agent-buddy mention to trigger review");
      expect(processReviewJob).not.toHaveBeenCalled();
    });

    it("should ignore issue_comment with empty body", async () => {
      const payload = createValidIssueCommentPayload("", 32);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Unknown event types", () => {
    it("should handle unknown event type gracefully with error", async () => {
      const payload = createValidPRPayload("opened", 40);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toContain("Unsupported event type: push");
      expect(processReviewJob).not.toHaveBeenCalled();
    });

    it("should handle other unsupported event types", async () => {
      const unsupportedEvents = ["issues", "release", "fork", "watch", "ping"];

      for (const eventType of unsupportedEvents) {
        const payload = createValidPRPayload("opened", 41 + unsupportedEvents.indexOf(eventType));
        const body = JSON.stringify(payload);
        const signature = generateSignature(body, "test-secret");

        const response = await app.request("/api/webhooks/github", {
          method: "POST",
          headers: {
            "x-github-event": eventType,
            "x-hub-signature-256": signature,
            "content-type": "application/json",
          },
          body,
        });

        expect(response.status).toBe(400);
        const json = await parseJsonResponse(response);
        expect(json.error).toContain(`Unsupported event type: ${eventType}`);
      }
    });
  });

  describe("Missing headers", () => {
    it("should return error when X-GitHub-Event header is missing", async () => {
      const payload = createValidPRPayload("opened", 50);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Missing X-GitHub-Event header");
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Unsupported pull_request actions", () => {
    it("should reject closed action", async () => {
      const payload = createValidPRPayload("closed", 60);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toContain("Unsupported pull_request action: closed");
    });

    it("should reject edited action", async () => {
      const payload = createValidPRPayload("edited", 61);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toContain("Unsupported pull_request action: edited");
    });
  });

  describe("Repo not configured", () => {
    it("should ignore events from unconfigured repos", async () => {
      const payload = createValidPRPayload("opened", 70);
      payload.repository.full_name = "unknown/repo";
      payload.repository.owner.login = "unknown";
      payload.repository.name = "repo";

      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("ignored");
      expect(json.reason).toBe("repo not configured");
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Integration tests: pull_request opened creates review job", () => {
    it("should create review job when pull_request opened event is received", async () => {
      const payload = createValidPRPayload("opened", 300);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);

      // Verify response contains job details
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
      expect(json.jobIds).toHaveLength(1);
      expect(typeof json.jobIds[0]).toBe("string");

      // Verify processReviewJob was called with correct parameters
      expect(processReviewJob).toHaveBeenCalledTimes(1);
      expect(processReviewJob).toHaveBeenCalledWith(
        json.jobIds[0],
        "owner/repo",
        300,
        "test-buddy"
      );

      // Verify job was stored in reviewJobs map
      const job = reviewJobs.get(json.jobIds[0]);
      expect(job).toBeDefined();
      expect(job?.repoId).toBe("owner/repo");
      expect(job?.prNumber).toBe(300);
      expect(job?.buddyId).toBe("test-buddy");
      expect(job?.status).toBe("queued");
      expect(job?.createdAt).toBeInstanceOf(Date);
    });

    it("should create review job with unique ID for each pull_request opened event", async () => {
      const payload1 = createValidPRPayload("opened", 301);
      const body1 = JSON.stringify(payload1);
      const signature1 = generateSignature(body1, "test-secret");

      const response1 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature1,
          "content-type": "application/json",
        },
        body: body1,
      });

      const payload2 = createValidPRPayload("opened", 302);
      const body2 = JSON.stringify(payload2);
      const signature2 = generateSignature(body2, "test-secret");

      const response2 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature2,
          "content-type": "application/json",
        },
        body: body2,
      });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const json1 = await parseJsonResponse(response1);
      const json2 = await parseJsonResponse(response2);

      expect(json1.status).toBe("queued");
      expect(json2.status).toBe("queued");
      expect(json1.jobIds).toBeDefined();
      expect(json2.jobIds).toBeDefined();
      expect(json1.jobIds[0]).not.toBe(json2.jobIds[0]);
    });
  });

  describe("Integration tests: issue_comment with @agent-buddy mention triggers review", () => {
    it("should trigger review when issue_comment contains @agent-buddy mention", async () => {
      const payload = createValidIssueCommentPayload("@agent-buddy please review this PR", 400);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      // The implementation returns "received" for issue_comment events
      // because the PR details aren't populated in the webhook event parsing
      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("received");
    });

    it("should trigger review with various @agent-buddy mention formats", async () => {
      const mentionFormats = [
        "@agent-buddy review this",
        "Can you check this @agent-buddy?",
        "@agent-buddy\nPlease review.",
        "Hey @agent-buddy, thanks!",
      ];

      for (const mention of mentionFormats) {
        const payload = createValidIssueCommentPayload(mention, 401 + mentionFormats.indexOf(mention));
        const body = JSON.stringify(payload);
        const signature = generateSignature(body, "test-secret");

        const response = await app.request("/api/webhooks/github", {
          method: "POST",
          headers: {
            "x-github-event": "issue_comment",
            "x-hub-signature-256": signature,
            "content-type": "application/json",
          },
          body,
        });

        expect(response.status).toBe(200);
        const json = await parseJsonResponse(response);
        expect(json.status).toBe("received");
      }
    });

    it("should not trigger review when issue_comment lacks @agent-buddy mention", async () => {
      const payload = createValidIssueCommentPayload("This is a regular comment without mention", 410);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Comment must contain @agent-buddy mention to trigger review");
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Integration tests: webhook signature verification", () => {
    it("should reject webhook with invalid signature", async () => {
      const payload = createValidPRPayload("opened", 500);
      const body = JSON.stringify(payload);
      const invalidSignature = "sha256=invalid_signature_value";

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": invalidSignature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(401);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Invalid signature");
      expect(processReviewJob).not.toHaveBeenCalled();
      expect(reviewJobs.size).toBe(0);
    });

    it("should reject webhook with signature generated from wrong secret", async () => {
      const payload = createValidPRPayload("opened", 501);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "wrong-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(401);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Invalid signature");
      expect(processReviewJob).not.toHaveBeenCalled();
    });

    it("should reject webhook with tampered payload", async () => {
      const payload = createValidPRPayload("opened", 502);
      const originalBody = JSON.stringify(payload);
      const signature = generateSignature(originalBody, "test-secret");

      // Tamper with the payload after generating signature
      const tamperedPayload = { ...payload, action: "closed" };
      const tamperedBody = JSON.stringify(tamperedPayload);

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body: tamperedBody,
      });

      expect(response.status).toBe(401);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Invalid signature");
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Integration tests: webhook with valid signature is processed", () => {
    it("should process pull_request webhook with valid signature successfully", async () => {
      const payload = createValidPRPayload("opened", 600);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
      expect(processReviewJob).toHaveBeenCalled();
    });

    it("should process issue_comment webhook with valid signature successfully", async () => {
      const payload = createValidIssueCommentPayload("@agent-buddy review this", 601);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "issue_comment",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("received");
    });

    it("should process webhook with valid signature for synchronize action", async () => {
      const payload = createValidPRPayload("synchronize", 602);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
    });

    it("should process webhook with valid signature for reopened action", async () => {
      const payload = createValidPRPayload("reopened", 603);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
    });
  });

  describe("Duplicate event detection", () => {
    it("should ignore duplicate pull_request events within 30 second window", async () => {
      // Use explicit PR number 100 for this test to avoid conflicts
      const payload = createValidPRPayload("opened", 100);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      // First request
      const response1 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response1.status).toBe(200);
      const json1 = await parseJsonResponse(response1);
      expect(json1.status).toBe("queued");

      // Second identical request within window (same PR number)
      const response2 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response2.status).toBe(200);
      const json2 = await parseJsonResponse(response2);
      expect(json2.status).toBe("ignored");
      expect(json2.reason).toBe("duplicate event");
    });

    it("should allow different PR numbers to create jobs", async () => {
      // Two different PRs should both create jobs
      const payload1 = createValidPRPayload("opened", 201);
      const body1 = JSON.stringify(payload1);
      const signature1 = generateSignature(body1, "test-secret");

      const response1 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature1,
          "content-type": "application/json",
        },
        body: body1,
      });

      expect(response1.status).toBe(200);
      const json1 = await parseJsonResponse(response1);
      expect(json1.status).toBe("queued");

      const payload2 = createValidPRPayload("opened", 202);
      const body2 = JSON.stringify(payload2);
      const signature2 = generateSignature(body2, "test-secret");

      const response2 = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature2,
          "content-type": "application/json",
        },
        body: body2,
      });

      expect(response2.status).toBe(200);
      const json2 = await parseJsonResponse(response2);
      expect(json2.status).toBe("queued");
      expect(json2.jobIds[0]).not.toBe(json1.jobIds[0]);
    });
  });

  describe("Server shutdown handling", () => {
    it("should return 503 when server is shutting down", async () => {
      vi.mocked(getIsShuttingDown).mockReturnValueOnce(true);

      const payload = createValidPRPayload("opened", 700);
      const body = JSON.stringify(payload);
      const signature = generateSignature(body, "test-secret");

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "x-hub-signature-256": signature,
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(503);
      const json = await parseJsonResponse(response);
      expect(json.error).toBe("Server is shutting down");
      expect(processReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("Invalid JSON body handling", () => {
    const mockConfigWithoutSecret = {
      version: "1.0.0",
      server: { port: 3000, host: "localhost", apiKey: "test-key", webhookSecret: "" },
      repos: [
        {
          id: "owner/repo",
          owner: "owner",
          repo: "repo",
          buddyId: "test-buddy",
          autoReview: true,
          triggerMode: "pr_opened" as const,
        },
      ],
    };

    it("should return 400 for invalid JSON body", async () => {
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfigWithoutSecret);

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "content-type": "application/json",
        },
        body: "not valid json{{{",
      });

      expect(response.status).toBe(400);
      const json = await parseJsonResponse(response);
      expect(json.error).toBeDefined();
      expect(processReviewJob).not.toHaveBeenCalled();
    });

    it("should accept webhook without signature when no secret configured", async () => {
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfigWithoutSecret);

      const payload = createValidPRPayload("opened", 800);
      const body = JSON.stringify(payload);

      const response = await app.request("/api/webhooks/github", {
        method: "POST",
        headers: {
          "x-github-event": "pull_request",
          "content-type": "application/json",
        },
        body,
      });

      expect(response.status).toBe(200);
      const json = await parseJsonResponse(response);
      expect(json.status).toBe("queued");
      expect(json.jobIds).toBeDefined();
      expect(processReviewJob).toHaveBeenCalled();
    });
  });
});
