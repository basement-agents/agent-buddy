import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CodeReview } from "@agent-buddy/core";

vi.mock("../jobs/state.js", () => ({
  reviewHistory: [],
  reviewJobs: new Map(),
  analysisJobs: new Map(),
}));

vi.mock("../routes/webhooks.js", () => ({
  webhookValidationFailures: { event_type: 0, signature: 0, payload: 0 },
}));

import { reviewHistory } from "../jobs/state.js";
import { webhookValidationFailures } from "../routes/webhooks.js";
import { createMetricsRoutes } from "../routes/metrics.js";

interface MetricsResponse {
  totalReviews: number;
  completedReviews: number;
  errorCount: number;
  errorRate: number;
  averageDurationMs: number;
  averageTokensPerReview: number;
  perBuddy: Record<string, { reviews: number; avgDurationMs: number; states: Record<string, number> }>;
  perRepo: Record<string, { reviews: number; avgDurationMs: number; states: Record<string, number> }>;
  webhookValidationFailuresTotal: number;
  since: string | null;
  until: string | null;
}

describe("Metrics Routes", () => {
  const mockReview1: CodeReview = {
    summary: "Good review",
    state: "approved",
    comments: [],
    buddyId: "buddy-1",
    reviewedAt: new Date("2026-01-15T10:30:00Z"),
    metadata: {
      prNumber: 1,
      repo: "repo-a",
      owner: "org-1",
      reviewType: "low-context",
      llmModel: "claude-3-opus",
      tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
      durationMs: 5000,
    },
  };

  const mockReview2: CodeReview = {
    summary: "Changes needed",
    state: "changes_requested",
    comments: [],
    buddyId: "buddy-2",
    reviewedAt: new Date("2026-01-20T12:00:00Z"),
    metadata: {
      prNumber: 2,
      repo: "repo-b",
      owner: "org-1",
      reviewType: "high-context",
      llmModel: "claude-3-opus",
      tokenUsage: { inputTokens: 2000, outputTokens: 800, totalTokens: 2800 },
      durationMs: 8000,
    },
  };

  beforeEach(() => {
    reviewHistory.length = 0;
    webhookValidationFailures.event_type = 0;
    webhookValidationFailures.signature = 0;
    webhookValidationFailures.payload = 0;
  });

  describe("GET /api/metrics", () => {
    it("returns empty metrics when no reviews exist", async () => {
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(res.status).toBe(200);
      expect(data.totalReviews).toBe(0);
      expect(data.errorRate).toBe(0);
      expect(data.perBuddy).toEqual({});
      expect(data.perRepo).toEqual({});
    });

    it("returns correct review counts and per-buddy breakdown", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(data.totalReviews).toBe(2);
      expect(data.completedReviews).toBe(2);
      expect(data.perBuddy["buddy-1"].reviews).toBe(1);
      expect(data.perBuddy["buddy-2"].reviews).toBe(1);
    });

    it("returns per-repo breakdown", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(data.perRepo["org-1/repo-a"].reviews).toBe(1);
      expect(data.perRepo["org-1/repo-b"].reviews).toBe(1);
    });

    it("filters by since parameter", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics?since=2026-01-18T00:00:00Z");
      const data = await res.json() as MetricsResponse;

      expect(data.totalReviews).toBe(1);
      expect(data.perBuddy["buddy-2"].reviews).toBe(1);
      expect(data.perBuddy["buddy-1"]).toBeUndefined();
    });

    it("filters by until parameter", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics?until=2026-01-18T00:00:00Z");
      const data = await res.json() as MetricsResponse;

      expect(data.totalReviews).toBe(1);
      expect(data.perBuddy["buddy-1"].reviews).toBe(1);
    });

    it("calculates average duration and tokens correctly", async () => {
      reviewHistory.push(mockReview1, mockReview2);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(data.averageDurationMs).toBe(6500);
      expect(data.averageTokensPerReview).toBe(2150);
    });

    it("returns since/until in response when provided", async () => {
      reviewHistory.push(mockReview1);
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics?since=2026-01-01T00:00:00Z&until=2026-02-01T00:00:00Z");
      const data = await res.json() as MetricsResponse;

      expect(data.since).toBe("2026-01-01T00:00:00.000Z");
      expect(data.until).toBe("2026-02-01T00:00:00.000Z");
    });

    it("includes webhook validation failures total", async () => {
      webhookValidationFailures.event_type = 3;
      webhookValidationFailures.signature = 1;
      webhookValidationFailures.payload = 2;
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(data.webhookValidationFailuresTotal).toBe(6);
    });

    it("returns zero webhook validation failures when none recorded", async () => {
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics");
      const data = await res.json() as MetricsResponse;

      expect(data.webhookValidationFailuresTotal).toBe(0);
    });

    it("returns 400 for invalid since date format", async () => {
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics?since=not-a-date");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain("since");
    });

    it("returns 400 for invalid until date format", async () => {
      const app = createMetricsRoutes();
      const res = await app.request("/api/metrics?until=invalid");

      expect(res.status).toBe(400);
      const data = await res.json() as { error: string };
      expect(data.error).toContain("until");
    });
  });
});
