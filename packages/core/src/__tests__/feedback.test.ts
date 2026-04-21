import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

describe("Feedback system", () => {
  const feedbackDir = path.join(os.homedir(), ".agent-buddy", "feedback");

  const testFiles: string[] = [];

  async function cleanFile(buddyId: string) {
    const f = path.join(feedbackDir, `${buddyId}.jsonl`);
    try { await fs.unlink(f); } catch { /* ignore */ }
    return f;
  }

  beforeEach(async () => {
    for (const id of ["test-user", "test-recent", "malformed-user", "malformed-recent", "patterns-user", "empty-user", "count-user"]) {
      testFiles.push(await cleanFile(id));
    }
  });

  afterEach(async () => {
    for (const f of testFiles) {
      try { await fs.unlink(f); } catch { /* ignore */ }
    }
  });

  it("recordFeedback stores feedback correctly", async () => {
    const { recordFeedback, getRecentFeedback } = await import("../learning/feedback.js");

    await recordFeedback({
      buddyId: "test-user",
      reviewId: "r1",
      commentId: "c1",
      wasHelpful: true,
      userResponse: "Great suggestion",
      timestamp: "2026-01-15T10:00:00Z",
    });
    await recordFeedback({
      buddyId: "test-user",
      reviewId: "r2",
      commentId: "c2",
      wasHelpful: false,
      userResponse: "Not relevant",
      timestamp: "2026-01-16T10:00:00Z",
    });

    const recent = await getRecentFeedback("test-user", 10);
    expect(recent.length).toBe(2);
    expect(recent[0].reviewId).toBe("r2");
    expect(recent[0].wasHelpful).toBe(false);
    expect(recent[0].userResponse).toBe("Not relevant");
    expect(recent[1].reviewId).toBe("r1");
    expect(recent[1].wasHelpful).toBe(true);
    expect(recent[1].userResponse).toBe("Great suggestion");
  });

  it("getFeedbackSummary aggregates helpful/notHelpful counts", async () => {
    const { recordFeedback, getFeedbackSummary } = await import("../learning/feedback.js");

    for (let i = 0; i < 3; i++) {
      await recordFeedback({
        buddyId: "count-user",
        reviewId: `r-helpful-${i}`,
        commentId: `c-${i}`,
        wasHelpful: true,
        timestamp: new Date().toISOString(),
      });
    }
    for (let i = 0; i < 2; i++) {
      await recordFeedback({
        buddyId: "count-user",
        reviewId: `r-not-${i}`,
        commentId: `c-not-${i}`,
        wasHelpful: false,
        timestamp: new Date().toISOString(),
      });
    }

    const summary = await getFeedbackSummary("count-user");
    expect(summary.helpful).toBe(3);
    expect(summary.notHelpful).toBe(2);
  });

  it("getRecentFeedback returns most recent entries sorted by timestamp", async () => {
    const { recordFeedback, getRecentFeedback } = await import("../learning/feedback.js");

    await recordFeedback({
      buddyId: "test-recent",
      reviewId: "r-old",
      commentId: "c1",
      wasHelpful: true,
      timestamp: "2026-01-01T00:00:00Z",
    });
    await recordFeedback({
      buddyId: "test-recent",
      reviewId: "r-new",
      commentId: "c2",
      wasHelpful: false,
      timestamp: "2026-01-10T00:00:00Z",
    });
    await recordFeedback({
      buddyId: "test-recent",
      reviewId: "r-mid",
      commentId: "c3",
      wasHelpful: true,
      timestamp: "2026-01-05T00:00:00Z",
    });

    const recent = await getRecentFeedback("test-recent", 2);
    expect(recent.length).toBe(2);
    expect(recent[0].reviewId).toBe("r-new");
    expect(recent[1].reviewId).toBe("r-mid");
  });

  it("getFeedbackSummary extracts patterns from user responses", async () => {
    const { recordFeedback, getFeedbackSummary } = await import("../learning/feedback.js");

    await recordFeedback({
      buddyId: "patterns-user",
      reviewId: "r1",
      commentId: "c1",
      wasHelpful: true,
      userResponse: "The suggestion about TypeScript types was very helpful for improving code quality",
      timestamp: "2026-01-01T00:00:00Z",
    });
    await recordFeedback({
      buddyId: "patterns-user",
      reviewId: "r2",
      commentId: "c2",
      wasHelpful: true,
      userResponse: "TypeScript types suggestion was good for code quality improvements",
      timestamp: "2026-01-02T00:00:00Z",
    });
    await recordFeedback({
      buddyId: "patterns-user",
      reviewId: "r3",
      commentId: "c3",
      wasHelpful: false,
      userResponse: "The TypeScript suggestion was not relevant to the refactoring",
      timestamp: "2026-01-03T00:00:00Z",
    });

    const summary = await getFeedbackSummary("patterns-user");
    expect(summary.helpful).toBe(2);
    expect(summary.notHelpful).toBe(1);
    expect(summary.patterns).toContain("typescript");
    expect(summary.patterns.length).toBeGreaterThan(0);
  });

  it("handles empty feedback gracefully", async () => {
    const { getFeedbackSummary, getRecentFeedback } = await import("../learning/feedback.js");

    const summary = await getFeedbackSummary("empty-user");
    expect(summary.helpful).toBe(0);
    expect(summary.notHelpful).toBe(0);
    expect(summary.patterns).toEqual([]);

    const recent = await getRecentFeedback("empty-user");
    expect(recent).toEqual([]);
  });

  it("getFeedbackSummary skips malformed JSON lines", async () => {
    const { getFeedbackSummary } = await import("../learning/feedback.js");
    await fs.mkdir(feedbackDir, { recursive: true });

    const testFile = path.join(feedbackDir, "malformed-user.jsonl");
    await fs.writeFile(testFile,
      JSON.stringify({ buddyId: "malformed-user", reviewId: "r1", commentId: "c1", wasHelpful: true, timestamp: "2025-01-01T00:00:00Z" }) + "\n" +
      "THIS IS NOT JSON\n" +
      JSON.stringify({ buddyId: "malformed-user", reviewId: "r2", commentId: "c2", wasHelpful: false, timestamp: "2025-01-02T00:00:00Z" }) + "\n"
    );

    const summary = await getFeedbackSummary("malformed-user");
    expect(summary.helpful).toBe(1);
    expect(summary.notHelpful).toBe(1);

    await fs.unlink(testFile).catch(() => {});
  });

  it("getRecentFeedback skips malformed JSON lines", async () => {
    const { getRecentFeedback } = await import("../learning/feedback.js");
    await fs.mkdir(feedbackDir, { recursive: true });

    const testFile = path.join(feedbackDir, "malformed-recent.jsonl");
    await fs.writeFile(testFile,
      JSON.stringify({ buddyId: "malformed-recent", reviewId: "r1", commentId: "c1", wasHelpful: true, timestamp: "2025-01-01T00:00:00Z" }) + "\n" +
      "{broken json\n" +
      JSON.stringify({ buddyId: "malformed-recent", reviewId: "r2", commentId: "c2", wasHelpful: false, timestamp: "2025-01-02T00:00:00Z" }) + "\n"
    );

    const recent = await getRecentFeedback("malformed-recent", 5);
    expect(recent.length).toBe(2);

    await fs.unlink(testFile).catch(() => {});
  });
});
