import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  saveConfig,
  addRepo as coreAddRepo,
  removeRepo as coreRemoveRepo,
  listRepos,
  Logger,
  GitHubClient,
  getErrorMessage,
  CustomRule,
} from "@agent-buddy/core";
import type { ReviewJob } from "../jobs/state.js";
import { reviewJobs, createJobBase } from "../jobs/state.js";
import { processReviewJob } from "../jobs/review.js";
import { checkForOpenPRs } from "../jobs/scheduler.js";
import { parsePaginationParams, paginate, apiError } from "../lib/api-response.js";
import { validateRepoParams, loadRepoConfig, requireRepoConfig } from "../lib/route-helpers.js";

const logger = new Logger("routes:repos");

const createRepoSchema = z.object({
  owner: z.string().min(1, "Owner is required"),
  repo: z.string().min(1, "Repo is required"),
  buddyId: z.string().optional(),
});

const updateRepoSchema = z.object({
  buddyId: z.string().optional(),
  autoReview: z.boolean().optional(),
  triggerMode: z.enum(["pr_opened", "mention", "review_requested", "manual"]).optional(),
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(1, "intervalMinutes must be at least 1"),
});

const reviewRequestSchema = z.object({
  prNumber: z.number().int().positive("prNumber must be a positive integer"),
  reviewType: z.enum(["low-context", "high-context", "auto"]).optional(),
});

const validPattern = z.string().min(1).refine((p) => { try { new RegExp(p); return true; } catch { return false; } }, { message: "Pattern must be a valid regular expression" });

const createRuleSchema = z.object({
  id: z.string().min(1, "Rule ID is required"),
  name: z.string().min(1, "Rule name is required"),
  description: z.string().optional(),
  pattern: validPattern,
  severity: z.enum(["error", "suggestion", "warning", "info"]).optional(),
  enabled: z.boolean().optional(),
});

const updateRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required").optional(),
  description: z.string().optional(),
  pattern: validPattern.optional(),
  severity: z.enum(["error", "suggestion", "warning", "info"]).optional(),
  enabled: z.boolean().optional(),
});

export function createReposRoutes(): Hono {
  const app = new Hono();

  app.get("/api/repos", async (c) => {
    const parsed = parsePaginationParams(c.req.query("page"), c.req.query("limit"));
    if ("error" in parsed) return c.json(parsed.error, 400);

    const repos = await listRepos();
    return c.json(paginate(repos, parsed.page, parsed.limit));
  });

  app.get("/api/repos/:owner/:repo/prs", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { owner, repo, id } = params;

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      return c.json(apiError("GitHub token not configured"), 400);
    }

    try {
      const client = new GitHubClient(token);
      const prs = await client.listPRs(owner, repo, { state: "open" });
      return c.json(prs.map((pr: { number: number; title: string; user?: { login?: string }; html_url?: string; created_at?: string; state?: string }) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || "unknown",
        createdAt: pr.created_at || new Date().toISOString(),
        url: pr.html_url || "",
        state: pr.state || "open",
      })));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to fetch PRs", { owner, repo, error: errorMessage });
      return c.json(apiError(`Failed to fetch PRs: ${errorMessage}`), 502);
    }
  });

  app.post("/api/repos", zValidator("json", createRepoSchema), async (c) => {
    const body = c.req.valid("json");

    try {
      const repoConfig = await coreAddRepo(body.owner, body.repo, body.buddyId);
      return c.json(repoConfig, 201);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to add repo", { owner: body.owner, repo: body.repo, error: errorMessage });
      return c.json(apiError(errorMessage), 409);
    }
  });

  app.delete("/api/repos/:owner/:repo", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { owner, repo } = params;

    try {
      await coreRemoveRepo(owner, repo);
      return c.json({ deleted: `${owner}/${repo}` });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to remove repo", { owner, repo, error: errorMessage });
      return c.json(apiError(errorMessage), 404);
    }
  });

  app.patch("/api/repos/:owner/:repo", zValidator("json", updateRepoSchema), async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const body = c.req.valid("json");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;
    const { config, repoConfig } = resolved;

    if (body.buddyId !== undefined) {
      repoConfig.buddyId = body.buddyId;
      repoConfig.buddies = [body.buddyId];
    }
    if (body.autoReview !== undefined) repoConfig.autoReview = body.autoReview;
    if (body.triggerMode !== undefined) repoConfig.triggerMode = body.triggerMode;

    await saveConfig(config);
    return c.json(repoConfig);
  });

  app.post("/api/repos/:owner/:repo/schedule", zValidator("json", scheduleSchema), async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const body = c.req.valid("json");
    const { schedules } = await import("../jobs/state.js");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;
    const { config, repoConfig } = resolved;

    const existing = schedules.get(id);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    if (body.enabled) {
      const timer = setInterval(() => {
        checkForOpenPRs(id).catch((err) => {
          logger.error("Scheduled check threw unhandled error", { repoId: id, error: getErrorMessage(err) });
        });
      }, body.intervalMinutes * 60 * 1000);

      schedules.set(id, {
        repoId: id,
        enabled: true,
        intervalMinutes: body.intervalMinutes,
        lastRun: new Date().toISOString(),
        timer,
      });
    } else {
      schedules.delete(id);
    }

    repoConfig.schedule = {
      enabled: body.enabled,
      intervalMinutes: body.intervalMinutes,
    };
    await saveConfig(config);

    return c.json({ repoId: id, schedule: repoConfig.schedule }, 201);
  });

  app.get("/api/repos/:owner/:repo/schedule", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;

    return c.json({ schedule: resolved.repoConfig.schedule });
  });

  app.delete("/api/repos/:owner/:repo/schedule", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const { schedules } = await import("../jobs/state.js");

    const existing = schedules.get(id);
    if (existing?.timer) {
      clearInterval(existing.timer);
    }
    schedules.delete(id);

    const { config, repoConfig } = await loadRepoConfig(id);
    if (repoConfig) {
      repoConfig.schedule = undefined;
      await saveConfig(config);
    }

    return c.json({ deleted: true });
  });

  app.get("/api/repos/:owner/:repo/rules", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;

    return c.json({ rules: resolved.repoConfig.customRules || [] });
  });

  app.post("/api/repos/:owner/:repo/rules", zValidator("json", createRuleSchema), async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const body = c.req.valid("json");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;
    const { config, repoConfig } = resolved;

    if (!repoConfig.customRules) repoConfig.customRules = [];

    const newRule = {
      id: body.id,
      name: body.name,
      description: body.description || "",
      pattern: body.pattern,
      severity: (body.severity || "suggestion") as "error" | "suggestion" | "warning" | "info",
      enabled: body.enabled !== false,
    };

    repoConfig.customRules.push(newRule);
    await saveConfig(config);

    return c.json({ rule: newRule }, 201);
  });

  app.delete("/api/repos/:owner/:repo/rules/:ruleId", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const ruleId = c.req.param("ruleId");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;
    const { config, repoConfig } = resolved;

    if (!repoConfig.customRules) return c.json(apiError("Rule not found"), 404);

    repoConfig.customRules = repoConfig.customRules.filter((r: CustomRule) => r.id !== ruleId);
    await saveConfig(config);

    return c.json({ deleted: true });
  });

  app.patch("/api/repos/:owner/:repo/rules/:ruleId", zValidator("json", updateRuleSchema), async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;
    const { config, repoConfig } = resolved;

    if (!repoConfig.customRules) return c.json(apiError("Rule not found"), 404);

    const ruleIndex = repoConfig.customRules.findIndex((r: CustomRule) => r.id === ruleId);
    if (ruleIndex === -1) return c.json(apiError("Rule not found"), 404);

    const existingRule = repoConfig.customRules[ruleIndex];
    const updatedRule = {
      ...existingRule,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.pattern !== undefined && { pattern: body.pattern }),
      ...(body.severity !== undefined && { severity: body.severity }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
    };

    repoConfig.customRules[ruleIndex] = updatedRule;
    await saveConfig(config);

    return c.json({ rule: updatedRule });
  });

  app.post("/api/repos/:owner/:repo/reviews", zValidator("json", reviewRequestSchema), async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { id } = params;
    const buddyId = c.req.query("buddyId");
    const body = c.req.valid("json");

    const resolved = await requireRepoConfig(id, c);
    if (resolved instanceof Response) return resolved;

    const buddyIds = buddyId ? [buddyId] : (resolved.repoConfig.buddies || (resolved.repoConfig.buddyId ? [resolved.repoConfig.buddyId] : []));

    if (buddyIds.length === 0) {
      return c.json(apiError("No buddy assigned to this repo"), 400);
    }

    for (const bid of buddyIds) {
      const job: ReviewJob = {
        ...createJobBase(),
        repoId: id,
        prNumber: body.prNumber,
        buddyId: bid,
        reviewType: body.reviewType,
      };
      reviewJobs.set(job.id, job);

      processReviewJob(job.id, id, body.prNumber, bid, body.reviewType).catch((err) => {
        logger.error("Review job failed", { jobId: job.id, repoId: id, prNumber: body.prNumber, buddyId: bid, error: getErrorMessage(err) });
      });
    }

    return c.json({ message: `Queued reviews for ${buddyIds.length} buddy(s)`, buddyIds }, 202);
  });

  return app;
}
