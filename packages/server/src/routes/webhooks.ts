import { Hono, type Context } from "hono";
import { loadConfig, GitHubClient, Logger, getErrorMessage, RepoConfig } from "@agent-buddy/core";
import { z } from "zod";
import type { ReviewJob } from "../jobs/state.js";
import { reviewJobs, createJobBase } from "../jobs/state.js";
import { processReviewJob } from "../jobs/review.js";
import { enqueueJob } from "../jobs/queue.js";
import { saveJob } from "../jobs/persistence.js";
import { getIsShuttingDown } from "../index.js";
import { apiError } from "../lib/api-response.js";

const logger = new Logger("routes:webhooks");

export const webhookValidationFailures = {
  event_type: 0,
  signature: 0,
  payload: 0,
};

const recentEvents = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 30000;

function handlePayloadValidationError(c: Context, eventType: string, error: z.ZodError) {
  webhookValidationFailures.payload++;
  logger.warn(`Invalid ${eventType} webhook payload`, {
    error: error.errors[0].message,
    path: error.errors[0].path.join("."),
  });
  return c.json(apiError(`Invalid ${eventType} payload`, error.errors[0].message), 400);
}

const SUPPORTED_EVENT_TYPES = ["pull_request", "issue_comment"] as const;
const SUPPORTED_PR_ACTIONS = ["opened", "synchronize", "reopened", "review_requested"] as const;

const webhookEventSchema = z.object({
  action: z.string(),
  sender: z.object({
    login: z.string(),
    id: z.number(),
    avatar_url: z.string(),
    html_url: z.string(),
  }),
  repository: z.object({
    id: z.number(),
    owner: z.object({
      login: z.string(),
      id: z.number(),
      avatar_url: z.string(),
    }),
    name: z.string(),
    full_name: z.string(),
    description: z.string().nullable(),
    private: z.boolean(),
    default_branch: z.string(),
    html_url: z.string(),
    language: z.string().nullable(),
    stargazers_count: z.number(),
    forks_count: z.number(),
  }),
});

const pullRequestWebhookSchema = webhookEventSchema.extend({
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string(),
    state: z.enum(["open", "closed", "merged"]),
    draft: z.boolean(),
    user: z.object({
      login: z.string(),
      id: z.number(),
    }),
    base: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    head: z.object({
      ref: z.string(),
      sha: z.string(),
    }),
    created_at: z.string(),
    updated_at: z.string(),
  }),
});

const issueCommentWebhookSchema = webhookEventSchema.extend({
  comment: z.object({
    id: z.number(),
    body: z.string(),
    user: z.object({
      login: z.string(),
    }),
  }),
  issue: z.object({
    number: z.number(),
    pull_request: z.object({
      url: z.string(),
      html_url: z.string(),
    }).optional(),
  }),
});

function validateWebhookEventType(eventType: string | undefined): { valid: boolean; error?: string } {
  if (!eventType) {
    return { valid: false, error: "Missing X-GitHub-Event header" };
  }

  if (!SUPPORTED_EVENT_TYPES.includes(eventType as typeof SUPPORTED_EVENT_TYPES[number])) {
    return {
      valid: false,
      error: `Unsupported event type: ${eventType}. Supported types: ${SUPPORTED_EVENT_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

function validatePullRequestAction(action: string | undefined): { valid: boolean; error?: string } {
  if (!action) {
    return { valid: false, error: "Missing action in pull_request event payload" };
  }

  if (!SUPPORTED_PR_ACTIONS.includes(action as typeof SUPPORTED_PR_ACTIONS[number])) {
    return {
      valid: false,
      error: `Unsupported pull_request action: ${action}. Supported actions: ${SUPPORTED_PR_ACTIONS.join(", ")}`,
    };
  }

  return { valid: true };
}

function validateIssueCommentMention(body: string | undefined): { valid: boolean; error?: string } {
  if (!body || !body.includes("@agent-buddy")) {
    return {
      valid: false,
      error: "Comment must contain @agent-buddy mention to trigger review",
    };
  }

  return { valid: true };
}

export {
  SUPPORTED_EVENT_TYPES,
  SUPPORTED_PR_ACTIONS,
  pullRequestWebhookSchema,
  issueCommentWebhookSchema,
  validateWebhookEventType,
  validatePullRequestAction,
  validateIssueCommentMention,
};

export function createWebhooksRoutes(): Hono {
  const app = new Hono();

  app.post("/api/webhooks/github", async (c) => {
    if (getIsShuttingDown()) {
      return c.json(apiError("Server is shutting down"), 503);
    }

    const config = await loadConfig();
    const signature = c.req.header("x-hub-signature-256") || "";
    const eventType = c.req.header("x-github-event");
    const body = await c.req.text();

    const eventTypeValidation = validateWebhookEventType(eventType);
    if (!eventTypeValidation.valid) {
      webhookValidationFailures.event_type++;
      logger.warn("Invalid webhook event type", { eventType, error: eventTypeValidation.error });
      return c.json(apiError(eventTypeValidation.error!), 400);
    }

    if (!config.server?.webhookSecret) {
      webhookValidationFailures.signature++;
      logger.warn("Webhook rejected: no secret configured");
      return c.json(apiError("Webhook secret not configured"), 503);
    }
    const valid = GitHubClient.verifyWebhookSignature(body, signature, config.server.webhookSecret);
    if (!valid) {
      webhookValidationFailures.signature++;
      logger.warn("Invalid webhook signature", { signature: signature.substring(0, 20) + "..." });
      return c.json(apiError("Invalid signature"), 401);
    }

    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => { headers[key] = value; });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;

      if (eventType === "pull_request") {
        const prValidation = pullRequestWebhookSchema.safeParse(parsed);
        if (!prValidation.success) {
          return handlePayloadValidationError(c, "pull_request", prValidation.error);
        }

        const actionValidation = validatePullRequestAction(parsed.action as string);
        if (!actionValidation.valid) {
          logger.warn("Invalid pull_request action", { action: parsed.action, error: actionValidation.error });
          return c.json(apiError(actionValidation.error!), 400);
        }
      } else if (eventType === "issue_comment") {
        const commentValidation = issueCommentWebhookSchema.safeParse(parsed);
        if (!commentValidation.success) {
          return handlePayloadValidationError(c, "issue_comment", commentValidation.error);
        }

        const validatedComment = commentValidation.data;
        const mentionValidation = validateIssueCommentMention(validatedComment.comment.body);
        if (!mentionValidation.valid) {
          logger.info("issue_comment without @agent-buddy mention", {
            repo: validatedComment.repository.full_name,
            commentId: validatedComment.comment.id,
          });
          return c.json(apiError(mentionValidation.error!), 400);
        }
      }

      const event = GitHubClient.parseWebhookEvent(headers, parsed);

      const repoId = `${event.repository.owner.login}/${event.repository.name}`;

      logger.info("Webhook event received", {
        type: event.type,
        action: event.action,
        repo: repoId
      });

      const repoConfig = config.repos.find((r: RepoConfig) => r.id === repoId);
      if (!repoConfig) return c.json({ status: "ignored", reason: "repo not configured" });

      if (event.type === "pull_request" && event.pullRequest) {
        const prNumber = event.pullRequest.number;
        const eventKey = `${repoId}:${prNumber}:${event.action}`;
        const now = Date.now();
        const lastProcessed = recentEvents.get(eventKey);

        if (lastProcessed && (now - lastProcessed) < DUPLICATE_WINDOW_MS) {
          logger.info("Duplicate event skipped", { eventKey, lastProcessed, now });
          return c.json({ status: "ignored", reason: "duplicate event" });
        }

        recentEvents.set(eventKey, now);

        const cutoff = now - DUPLICATE_WINDOW_MS;
        for (const [key, timestamp] of recentEvents) {
          if (timestamp < cutoff) recentEvents.delete(key);
        }
      }

      const isPrAutoReview = event.type === "pull_request" &&
        ["opened", "synchronize", "reopened"].includes(event.action || "") &&
        repoConfig.autoReview;
      const isReviewRequested = event.type === "pull_request" && event.action === "review_requested";
      const isMention = event.type === "issue_comment" && event.comment?.body?.includes("@agent-buddy");
      const shouldReview = isPrAutoReview || isReviewRequested || isMention;

      if (!shouldReview) return c.json({ status: "ignored", reason: "trigger condition not met" });

      if (event.pullRequest) {
        const prNumber = event.pullRequest.number;

        const buddyIds = repoConfig.buddies || (repoConfig.buddyId ? [repoConfig.buddyId] : []);
        if (buddyIds.length === 0) {
          logger.warn("Webhook received for repo without buddy configured", { repoId, prNumber });
          return c.json({ status: "ignored", reason: "no buddy configured for repo" });
        }

        const jobIds: string[] = [];
        for (const buddyId of buddyIds) {
          const job: ReviewJob = {
            ...createJobBase(),
            repoId,
            prNumber,
            buddyId,
          };
          reviewJobs.set(job.id, job);
          saveJob(job).catch((err) => logger.error("Failed to persist new job", { jobId: job.id, error: getErrorMessage(err) }));

          enqueueJob(job.id, "review", () =>
            processReviewJob(job.id, repoId, prNumber, buddyId).catch((err) => {
              logger.error("Webhook review job failed", { jobId: job.id, repoId, prNumber, buddyId, error: getErrorMessage(err) });
            })
          );

          jobIds.push(job.id);
        }

        return c.json({ status: "queued", jobIds });
      }

      return c.json({ status: "received" });
    } catch (err) {
      const error = getErrorMessage(err);
      logger.error("Webhook processing failed", { error });
      return c.json({ error }, 400);
    }
  });

  return app;
}
