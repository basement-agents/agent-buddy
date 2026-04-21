import { describe, it, expect } from "vitest";
import { configSchema } from "../config/schema.js";

describe("Config validation with Zod", () => {
  it("should validate a minimal config", () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0.0");
      expect(result.data.repos).toEqual([]);
      expect(result.data.server?.port).toBe(3000);
      expect(result.data.review?.defaultSeverity).toBe("suggestion");
    }
  });

  it("should validate a full config", () => {
    const config = {
      version: "1.0.0",
      repos: [
        {
          id: "owner/repo",
          owner: "owner",
          repo: "repo",
          autoReview: true,
          triggerMode: "pr_opened",
          buddyId: "buddy-1",
        },
      ],
      server: {
        port: 8080,
        host: "0.0.0.0",
        webhookSecret: "secret123",
        apiKey: "key123",
      },
      review: {
        defaultSeverity: "error",
        maxComments: 100,
        autoApproveBelow: true,
        reviewDelaySeconds: 5,
        maxTokensPerReview: 16000,
      },
    };

    const result = configSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repos).toHaveLength(1);
      expect(result.data.repos[0].autoReview).toBe(true);
      expect(result.data.server?.port).toBe(8080);
      expect(result.data.review?.maxComments).toBe(100);
      expect(result.data.review?.maxTokensPerReview).toBe(16000);
    }
  });

  it("should reject invalid severity values", () => {
    const result = configSchema.safeParse({
      review: { defaultSeverity: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid trigger mode", () => {
    const result = configSchema.safeParse({
      repos: [{ id: "test", owner: "o", repo: "r", triggerMode: "invalid" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative port", () => {
    const result = configSchema.safeParse({
      server: { port: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("should reject zero maxComments", () => {
    const result = configSchema.safeParse({
      review: { maxComments: 0 },
    });
    expect(result.success).toBe(false);
  });

  it("should apply default values for missing optional fields", () => {
    const result = configSchema.safeParse({
      repos: [{ id: "test", owner: "o", repo: "r" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const repo = result.data.repos[0];
      expect(repo.autoReview).toBe(false);
      expect(repo.triggerMode).toBe("manual");
      expect(repo.customRules).toBeUndefined();
    }
  });

  it("should validate custom rules in repo config", () => {
    const result = configSchema.safeParse({
      repos: [{
        id: "test",
        owner: "o",
        repo: "r",
        customRules: [{
          id: "rule-1",
          name: "No console.log",
          pattern: "console\\.log",
          severity: "error",
          enabled: true,
        }],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.repos[0].customRules).toHaveLength(1);
      expect(result.data.repos[0].customRules![0].severity).toBe("error");
    }
  });

  it("should validate quiet hours config", () => {
    const result = configSchema.safeParse({
      review: {
        quietHours: {
          start: "22:00",
          end: "08:00",
          timezone: "America/New_York",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.review?.quietHours?.timezone).toBe("America/New_York");
    }
  });

  it("should produce descriptive error messages", () => {
    const result = configSchema.safeParse({
      server: { port: "not-a-number" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(result.error.issues[0].message).toBeDefined();
    }
  });
});
