import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Logger, getErrorMessage } from "@agent-buddy/core";
import type { ReviewJob } from "../jobs/state.js";
import { reviewHistory, reviewJobs, analysisJobs, createJobBase } from "../jobs/state.js";
import { processReviewJob } from "../jobs/review.js";
import { enqueueJob } from "../jobs/queue.js";
import { saveJob } from "../jobs/persistence.js";
import { reviewRateLimitMiddleware } from "../middleware/rate-limit.js";
import { parsePaginationParams, paginate, apiError } from "../lib/api-response.js";
import { validateRepoParams } from "../lib/route-helpers.js";

const logger = new Logger("routes:reviews");

const reviewTriggerSchema = z.object({
  repoId: z.string().min(1, "repoId is required"),
  prNumber: z.number().int().positive("prNumber must be a positive integer"),
  buddyId: z.string().min(1, "buddyId is required"),
  reviewType: z.enum(["low-context", "high-context", "auto"]).optional(),
});

function getAnyJob(jobId: string) {
  return reviewJobs.get(jobId) || analysisJobs.get(jobId);
}

interface AnalyticsData {
  reviewsLast7Days: number;
  reviewsLast30Days: number;
  averageTurnaroundTimeMs: number;
  averageTurnaroundTimeSeconds: number;
  perBuddyCounts: Record<string, number>;
  perRepoCounts: Record<string, number>;
  reviewStates: Record<string, number>;
  totalReviews: number;
}

export function createReviewsRoutes(): Hono {
  const app = new Hono();

  app.post("/api/reviews/trigger", reviewRateLimitMiddleware(), zValidator("json", reviewTriggerSchema), async (c) => {
    const { repoId, prNumber, buddyId, reviewType } = c.req.valid("json");

    const job: ReviewJob = {
      ...createJobBase(),
      repoId,
      prNumber,
      buddyId,
      reviewType: reviewType || "low-context",
    };

    reviewJobs.set(job.id, job);
    saveJob(job).catch((err) => logger.error("Failed to persist new job", { jobId: job.id, error: getErrorMessage(err) }));

    enqueueJob(job.id, "review", () =>
      processReviewJob(job.id, repoId, prNumber, buddyId, reviewType).catch((err) => {
        logger.error("Review job processing failed", { jobId: job.id, error: getErrorMessage(err) });
      })
    );

    return c.json({
      success: true,
      jobId: job.id,
      message: "Review job queued for processing",
    });
  });

  app.get("/api/reviews/:owner/:repo/:prNumber", async (c) => {
    const params = validateRepoParams(c);
    if (params instanceof Response) return params;
    const { owner, repo } = params;
    const prNumber = parseInt(c.req.param("prNumber"), 10);

    if (isNaN(prNumber)) {
      return c.json(apiError("Invalid PR number"), 400);
    }

    const review = reviewHistory.find(
      (r) => r.metadata.owner === owner && r.metadata.repo === repo && r.metadata.prNumber === prNumber
    );

    if (!review) {
      return c.json(apiError("Review not found"), 404);
    }

    return c.json(review);
  });

  app.get("/api/reviews", async (c) => {
    const parsed = parsePaginationParams(c.req.query("page"), c.req.query("limit"));
    if ("error" in parsed) return c.json(parsed.error, 400);

    const repo = c.req.query("repo");
    const buddy = c.req.query("buddy");
    const status = c.req.query("status");

    let filtered = [...reviewHistory];
    if (repo) filtered = filtered.filter((r) => r.metadata.repo === repo);
    if (buddy) filtered = filtered.filter((r) => r.buddyId === buddy);
    if (status) filtered = filtered.filter((r) => r.state === status);

    const result = paginate(filtered, parsed.page, parsed.limit);
    return c.json({ ...result, reviews: result.data });
  });

  app.get("/api/jobs", async (c) => {
    const parsed = parsePaginationParams(c.req.query("page"), c.req.query("limit"));
    if ("error" in parsed) return c.json(parsed.error, 400);

    const statusFilter = c.req.query("status");
    const repoFilter = c.req.query("repoId");

    let allJobs = [
      ...[...reviewJobs.values()].map((j) => ({ ...j, type: "review" as const })),
      ...[...analysisJobs.values()].map((j) => ({ ...j, type: "analysis" as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (statusFilter) {
      allJobs = allJobs.filter((j) => j.status === statusFilter);
    }
    if (repoFilter) {
      allJobs = allJobs.filter((j) => ("repoId" in j ? j.repoId : j.repo) === repoFilter);
    }

    return c.json(paginate(allJobs, parsed.page, parsed.limit));
  });

  app.get("/api/jobs/:jobId", async (c) => {
    const jobId = c.req.param("jobId");
    const reviewJob = reviewJobs.get(jobId);
    if (reviewJob) return c.json(reviewJob);

    const analysisJob = analysisJobs.get(jobId);
    if (analysisJob) return c.json(analysisJob);

    return c.json(apiError("Job not found"), 404);
  });

  app.post("/api/jobs/:jobId/cancel", async (c) => {
    const jobId = c.req.param("jobId");
    const job = getAnyJob(jobId);

    if (!job) return c.json(apiError("Job not found"), 404);

    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return c.json(apiError(`Cannot cancel job with status '${job.status}'`), 400);
    }

    job.status = "cancelled";
    return c.json({ success: true, jobId, status: "cancelled" });
  });

  app.get("/api/jobs/:jobId/progress", async (c) => {
    const jobId = c.req.param("jobId");
    const job = getAnyJob(jobId);

    if (!job) return c.json(apiError("Job not found"), 404);

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-cache");
    headers.set("Connection", "keep-alive");

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          clearInterval(interval);
          clearTimeout(timeout);
          try { controller.close(); } catch { /* already closed */ }
        };

        const sendEvent = (data: unknown) => {
          if (closed) return;
          try {
            const payload = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(new TextEncoder().encode(payload));
          } catch (err) {
            logger.warn("Failed to send SSE event", { jobId, error: getErrorMessage(err) });
            cleanup();
          }
        };

        sendEvent(job);

        const interval = setInterval(() => {
          const updatedJob = getAnyJob(jobId);
          if (updatedJob) {
            sendEvent(updatedJob);
            if (updatedJob.status === "completed" || updatedJob.status === "failed" || updatedJob.status === "cancelled") {
              cleanup();
            }
          }
        }, 1000);

        const timeout = setTimeout(cleanup, 300000);

        const signal = c.req.raw.signal;
        if (signal) {
          signal.addEventListener("abort", cleanup, { once: true });
        }
      },
    });

    return new Response(stream, { headers });
  });

  app.get("/api/analytics", async (c) => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const reviewsLast7Days = reviewHistory.filter((r) => new Date(r.reviewedAt) >= sevenDaysAgo).length;
    const reviewsLast30Days = reviewHistory.filter((r) => new Date(r.reviewedAt) >= thirtyDaysAgo).length;

    const totalDurationMs = reviewHistory.reduce((sum, r) => sum + (r.metadata.durationMs || 0), 0);
    const averageTurnaroundTimeMs = reviewHistory.length > 0 ? totalDurationMs / reviewHistory.length : 0;

    const perBuddyCounts: Record<string, number> = {};
    for (const review of reviewHistory) {
      if (review.buddyId) {
        perBuddyCounts[review.buddyId] = (perBuddyCounts[review.buddyId] || 0) + 1;
      }
    }

    const perRepoCounts: Record<string, number> = {};
    for (const review of reviewHistory) {
      const repoKey = `${review.metadata.owner}/${review.metadata.repo}`;
      perRepoCounts[repoKey] = (perRepoCounts[repoKey] || 0) + 1;
    }

    const reviewStates: Record<string, number> = {};
    for (const review of reviewHistory) {
      reviewStates[review.state] = (reviewStates[review.state] || 0) + 1;
    }

    const analytics: AnalyticsData = {
      reviewsLast7Days,
      reviewsLast30Days,
      averageTurnaroundTimeMs,
      averageTurnaroundTimeSeconds: averageTurnaroundTimeMs / 1000,
      perBuddyCounts,
      perRepoCounts,
      reviewStates,
      totalReviews: reviewHistory.length,
    };

    return c.json(analytics);
  });

  return app;
}
