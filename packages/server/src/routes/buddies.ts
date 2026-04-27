import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  BuddyFileSystemStorage,
  recordFeedback,
  getFeedbackSummary,
  getRecentFeedback,
  compareBuddies,
  loadConfig,
  Logger,
  getErrorMessage,
} from "@agent-buddy/core";
import type { AnalysisJob } from "../jobs/state.js";
import { analysisJobs, createJobBase } from "../jobs/state.js";
import { processAnalysisJob, processUpdateJob } from "../jobs/analysis.js";
import { parsePaginationParams, paginate, apiError } from "../lib/api-response.js";

const logger = new Logger("routes:buddies");

const createBuddySchema = z.object({
  username: z.string().min(1, "Username is required"),
  repo: z.string().min(1, "Repo is required (format: owner/repo)"),
  maxPrs: z.number().int().positive().optional().default(20),
});

const updateBuddySchema = z.object({
  repo: z.string().optional(),
});

const feedbackSchema = z.object({
  reviewId: z.string().min(1, "reviewId is required"),
  commentId: z.string().min(1, "commentId is required"),
  wasHelpful: z.boolean(),
  userResponse: z.string().optional(),
});

const importProfileSchema = z.object({
  profile: z.string().min(1, "Profile JSON is required"),
  newId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,49}$/, "Invalid buddy ID format").optional(),
});

export function createBuddiesRoutes(): Hono {
  const app = new Hono();

  app.get("/api/buddies", async (c) => {
    const parsed = parsePaginationParams(c.req.query("page"), c.req.query("limit"));
    if ("error" in parsed) return c.json(parsed.error, 400);

    const storage = new BuddyFileSystemStorage();
    const buddies = await storage.listBuddies();
    return c.json(paginate(buddies, parsed.page, parsed.limit));
  });

  app.get("/api/buddies/:id", async (c) => {
    const id = c.req.param("id");
    const storage = new BuddyFileSystemStorage();
    const profile = await storage.readProfile(id);

    if (!profile) return c.json(apiError("Buddy not found"), 404);
    return c.json(profile);
  });

  app.post("/api/buddies", zValidator("json", createBuddySchema), async (c) => {
    const body = c.req.valid("json");
    const { username, repo, maxPrs } = body;

    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) return c.json(apiError("Invalid repo format. Use owner/repo"), 400);

    const config = await loadConfig();
    const token = config.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return c.json(apiError("GitHub token must be set"), 500);
    }

    const job: AnalysisJob = {
      ...createJobBase(),
      buddyId: username,
      repo,
    };
    analysisJobs.set(job.id, job);

    processAnalysisJob(job.id, username, owner, repoName, token, maxPrs).catch((err) => {
      logger.error("Analysis job failed", { jobId: job.id, username, owner, repo: repoName, error: getErrorMessage(err) });
    });

    return c.json({ jobId: job.id, status: "queued" }, 202);
  });

  app.delete("/api/buddies/:id", async (c) => {
    const id = c.req.param("id");
    const storage = new BuddyFileSystemStorage();

    try {
      const profile = await storage.readProfile(id);
      if (!profile) return c.json(apiError(`Buddy not found: ${id}`), 404);
      await storage.deleteBuddy(id);
      return c.json({ deleted: id });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to delete buddy", { id, error: errorMessage });
      return c.json(apiError(errorMessage), 500);
    }
  });

  app.post("/api/buddies/:id/update", zValidator("json", updateBuddySchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const config = await loadConfig();
    const token = config.githubToken || process.env.GITHUB_TOKEN;

    if (!token) return c.json(apiError("GitHub token must be set"), 500);

    const job: AnalysisJob = {
      ...createJobBase(),
      buddyId: id,
      repo: body.repo || "",
    };
    analysisJobs.set(job.id, job);

    processUpdateJob(job.id, id, body.repo, token).catch((err) => {
      logger.error("Update job failed", { jobId: job.id, buddyId: id, repo: body.repo, error: getErrorMessage(err) });
    });

    return c.json({ jobId: job.id, status: "queued" }, 202);
  });

  app.get("/api/buddies/:id/status", async (c) => {
    const id = c.req.param("id");
    const jobs = [...analysisJobs.values()].filter((j) => j.buddyId === id);
    const latest = jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!latest) return c.json({ status: "no_jobs" });
    return c.json({
      jobId: latest.id,
      status: latest.status,
      progress: latest.progress,
      progressStage: latest.progressStage,
      progressPercentage: latest.progressPercentage,
      error: latest.error
    });
  });

  app.post("/api/buddies/:id/feedback", zValidator("json", feedbackSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const feedback = {
      buddyId: id,
      reviewId: body.reviewId,
      commentId: body.commentId,
      wasHelpful: body.wasHelpful,
      userResponse: body.userResponse,
      timestamp: new Date().toISOString(),
    };

    await recordFeedback(feedback);
    return c.json({ recorded: true }, 201);
  });

  app.get("/api/buddies/:id/feedback", async (c) => {
    const id = c.req.param("id");
    const summary = await getFeedbackSummary(id);
    const recent = await getRecentFeedback(id, 10);
    return c.json({
      helpfulCount: summary.helpful,
      notHelpfulCount: summary.notHelpful,
      recentFeedback: recent.map((f: { commentId: string; reviewId: string; wasHelpful: boolean; userResponse?: string; timestamp: string }) => ({
        id: f.commentId,
        reviewId: f.reviewId,
        helpful: f.wasHelpful,
        comment: f.userResponse,
        createdAt: f.timestamp,
      })),
    });
  });

  app.get("/api/buddies/:id/export", async (c) => {
    const id = c.req.param("id");
    const storage = new BuddyFileSystemStorage();

    try {
      const json = await storage.exportProfile(id);
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        logger.error("Failed to parse exported buddy profile", { id, error: getErrorMessage(err) });
        return c.json(apiError("Exported profile contains invalid JSON"), 500);
      }
      return c.json(parsed);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to export buddy", { id, error: errorMessage });
      if (errorMessage.includes("not found")) {
        return c.json(apiError(errorMessage), 404);
      }
      return c.json(apiError(errorMessage), 500);
    }
  });

  app.post("/api/buddies/import", zValidator("json", importProfileSchema), async (c) => {
    const body = c.req.valid("json");

    const storage = new BuddyFileSystemStorage();

    try {
      const newId = await storage.importProfile(body.profile, body.newId);
      return c.json({ imported: true, id: newId }, 201);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to import buddy", { error: errorMessage });
      return c.json(apiError(errorMessage), 400);
    }
  });

  app.get("/api/buddies/:id/compare/:otherId", async (c) => {
    const id = c.req.param("id");
    const otherId = c.req.param("otherId");

    if (id === otherId) {
      return c.json(apiError("Cannot compare a buddy with itself"), 400);
    }

    const storage = new BuddyFileSystemStorage();
    const [buddy1, buddy2] = await Promise.all([
      storage.readProfile(id),
      storage.readProfile(otherId),
    ]);

    if (!buddy1) return c.json(apiError(`Buddy not found: ${id}`), 404);
    if (!buddy2) return c.json(apiError(`Buddy not found: ${otherId}`), 404);

    const result = compareBuddies(buddy1, buddy2);
    return c.json(result);
  });

  return app;
}
