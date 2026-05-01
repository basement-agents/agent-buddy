import { Hono } from "hono";
import { reviewHistory } from "../jobs/state.js";
import { webhookValidationFailures } from "./webhooks.js";
import { getQueueStats } from "../jobs/queue.js";
import { apiError } from "../lib/api-response.js";
import { githubCache } from "@agent-buddy/core";

export function createMetricsRoutes(): Hono {
  const app = new Hono();

  app.get("/api/metrics", async (c) => {
    const since = c.req.query("since");
    const until = c.req.query("until");

    if (since && isNaN(new Date(since).getTime())) {
      return c.json(apiError("Invalid 'since' date format. Use ISO-8601."), 400);
    }
    if (until && isNaN(new Date(until).getTime())) {
      return c.json(apiError("Invalid 'until' date format. Use ISO-8601."), 400);
    }

    const sinceDate = since ? new Date(since) : null;
    const untilDate = until ? new Date(until) : null;

    const filtered = reviewHistory.filter((r) => {
      const reviewedAt = new Date(r.reviewedAt);
      if (sinceDate && reviewedAt < sinceDate) return false;
      if (untilDate && reviewedAt > untilDate) return false;
      return true;
    });

    const totalReviews = filtered.length;
    const errorCount = filtered.filter((r) => r.metadata && r.metadata.durationMs === 0 && (!r.comments || r.comments.length === 0)).length;
    const completedReviews = totalReviews - errorCount;

    const totalDurationMs = filtered.reduce((sum, r) => sum + (r.metadata?.durationMs || 0), 0);
    const averageDurationMs = totalReviews > 0 ? totalDurationMs / totalReviews : 0;

    const totalTokens = filtered.reduce((sum, r) => sum + (r.metadata?.tokenUsage?.totalTokens || 0), 0);
    const averageTokensPerReview = totalReviews > 0 ? Math.round(totalTokens / totalReviews) : 0;

    type EntityStats = { reviews: number; avgDurationMs: number; states: Record<string, number> };
    const perBuddy: Record<string, EntityStats> = {};
    const perRepo: Record<string, EntityStats> = {};

    function trackEntity(map: Record<string, EntityStats>, key: string, duration: number, state: string): void {
      if (!map[key]) map[key] = { reviews: 0, avgDurationMs: 0, states: {} };
      const entry = map[key];
      entry.reviews++;
      entry.avgDurationMs = (entry.avgDurationMs * (entry.reviews - 1) + duration) / entry.reviews;
      entry.states[state] = (entry.states[state] || 0) + 1;
    }

    for (const review of filtered) {
      const duration = review.metadata.durationMs || 0;
      if (review.buddyId) trackEntity(perBuddy, review.buddyId, duration, review.state);
      trackEntity(perRepo, `${review.metadata.owner}/${review.metadata.repo}`, duration, review.state);
    }

    const errorRate = totalReviews > 0 ? errorCount / totalReviews : 0;

    const queueStats = getQueueStats();
    const cacheStats = githubCache.stats();

    return c.json({
      totalReviews,
      completedReviews,
      errorCount,
      errorRate,
      averageDurationMs: Math.round(averageDurationMs),
      averageTokensPerReview,
      perBuddy,
      perRepo,
      webhookValidationFailuresTotal: webhookValidationFailures.event_type + webhookValidationFailures.signature + webhookValidationFailures.payload,
      jobQueue: queueStats,
      githubCache: cacheStats,
      since: sinceDate?.toISOString() ?? null,
      until: untilDate?.toISOString() ?? null,
    });
  });

  return app;
}
