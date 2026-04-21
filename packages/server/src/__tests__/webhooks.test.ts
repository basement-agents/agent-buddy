import { describe, it, expect } from "vitest";
import {
  SUPPORTED_PR_ACTIONS,
  validateWebhookEventType,
  validatePullRequestAction,
  validateIssueCommentMention,
  pullRequestWebhookSchema,
  issueCommentWebhookSchema,
} from "../routes/webhooks.js";

describe("validateWebhookEventType", () => {
  it("returns valid for pull_request", () => {
    expect(validateWebhookEventType("pull_request")).toEqual({ valid: true });
  });

  it("returns valid for issue_comment", () => {
    expect(validateWebhookEventType("issue_comment")).toEqual({ valid: true });
  });

  it("returns error for undefined event type", () => {
    const result = validateWebhookEventType(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing X-GitHub-Event");
  });

  it("returns error for unsupported event types", () => {
    const pushResult = validateWebhookEventType("push");
    expect(pushResult.valid).toBe(false);
    expect(pushResult.error).toContain("Unsupported event type");
    expect(pushResult.error).toContain("push");

    const releaseResult = validateWebhookEventType("release");
    expect(releaseResult.valid).toBe(false);
    expect(releaseResult.error).toContain("release");
  });
});

describe("validatePullRequestAction", () => {
  it("returns valid for opened", () => {
    expect(validatePullRequestAction("opened")).toEqual({ valid: true });
  });

  it("returns valid for synchronize", () => {
    expect(validatePullRequestAction("synchronize")).toEqual({ valid: true });
  });

  it("returns valid for reopened", () => {
    expect(validatePullRequestAction("reopened")).toEqual({ valid: true });
  });

  it("returns error for undefined action", () => {
    const result = validatePullRequestAction(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing action");
  });

  it("returns error for unsupported actions", () => {
    const closedResult = validatePullRequestAction("closed");
    expect(closedResult.valid).toBe(false);
    expect(closedResult.error).toContain("Unsupported pull_request action");
    expect(closedResult.error).toContain("closed");

    const editedResult = validatePullRequestAction("edited");
    expect(editedResult.valid).toBe(false);
    expect(editedResult.error).toContain("edited");
  });
});

describe("validateIssueCommentMention", () => {
  it("returns valid when body contains @agent-buddy", () => {
    expect(validateIssueCommentMention("@agent-buddy review this")).toEqual({ valid: true });
  });

  it("returns valid for mention mid-sentence", () => {
    expect(validateIssueCommentMention("Hey @agent-buddy can you take a look?")).toEqual({ valid: true });
  });

  it("returns error when body is undefined", () => {
    const result = validateIssueCommentMention(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("@agent-buddy mention");
  });

  it("returns error when body does not contain mention", () => {
    const result = validateIssueCommentMention("Just a regular comment");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("@agent-buddy mention");
  });

  it("returns error for empty string", () => {
    const result = validateIssueCommentMention("");
    expect(result.valid).toBe(false);
  });
});

describe("pullRequestWebhookSchema", () => {
  const validPayload = {
    action: "opened",
    sender: { login: "user", id: 1, avatar_url: "https://example.com/avatar", html_url: "https://example.com/user" },
    repository: {
      id: 1,
      owner: { login: "owner", id: 1, avatar_url: "https://example.com/avatar" },
      name: "repo",
      full_name: "owner/repo",
      description: null,
      private: false,
      default_branch: "main",
      html_url: "https://example.com/owner/repo",
      language: "TypeScript",
      stargazers_count: 10,
      forks_count: 2,
    },
    pull_request: {
      number: 42,
      title: "Fix bug",
      body: "Fixes something",
      state: "open",
      draft: false,
      user: { login: "author", id: 2 },
      base: { ref: "main", sha: "abc123" },
      head: { ref: "feature", sha: "def456" },
      created_at: "2026-04-19T00:00:00Z",
      updated_at: "2026-04-19T00:00:00Z",
    },
  };

  it("accepts valid pull_request payload", () => {
    const result = pullRequestWebhookSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects payload missing pull_request field", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pull_request: _pr, ...withoutPR } = validPayload;
    const result = pullRequestWebhookSchema.safeParse(withoutPR);
    expect(result.success).toBe(false);
  });

  it("rejects payload missing sender field", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sender: _sender, ...withoutSender } = validPayload;
    const result = pullRequestWebhookSchema.safeParse(withoutSender);
    expect(result.success).toBe(false);
  });

  it("rejects payload with invalid PR state", () => {
    const result = pullRequestWebhookSchema.safeParse({
      ...validPayload,
      pull_request: { ...validPayload.pull_request, state: "invalid" },
    });
    expect(result.success).toBe(false);
  });
});

describe("issueCommentWebhookSchema", () => {
  const validPayload = {
    action: "created",
    sender: { login: "user", id: 1, avatar_url: "https://example.com/avatar", html_url: "https://example.com/user" },
    repository: {
      id: 1,
      owner: { login: "owner", id: 1, avatar_url: "https://example.com/avatar" },
      name: "repo",
      full_name: "owner/repo",
      description: null,
      private: false,
      default_branch: "main",
      html_url: "https://example.com/owner/repo",
      language: "TypeScript",
      stargazers_count: 10,
      forks_count: 2,
    },
    comment: {
      id: 1,
      body: "@agent-buddy review this",
      user: { login: "user" },
    },
    issue: {
      number: 42,
      pull_request: { url: "https://api.github.com/...", html_url: "https://github.com/..." },
    },
  };

  it("accepts valid issue_comment payload", () => {
    const result = issueCommentWebhookSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects payload missing comment field", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { comment: _comment, ...withoutComment } = validPayload;
    const result = issueCommentWebhookSchema.safeParse(withoutComment);
    expect(result.success).toBe(false);
  });

  it("accepts issue_comment without pull_request link on issue", () => {
    const result = issueCommentWebhookSchema.safeParse({
      ...validPayload,
      issue: { number: 42 },
    });
    expect(result.success).toBe(true);
  });
});

describe("review_requested action support", () => {
  it("includes review_requested in SUPPORTED_PR_ACTIONS", () => {
    expect(SUPPORTED_PR_ACTIONS).toContain("review_requested");
  });

  it("validatePullRequestAction accepts review_requested", () => {
    const result = validatePullRequestAction("review_requested");
    expect(result.valid).toBe(true);
  });

  it("validatePullRequestAction rejects unsupported actions", () => {
    const result = validatePullRequestAction("unassigned");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unsupported pull_request action");
  });
});
