import { z } from "zod";

export const customRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  pattern: z.string(),
  severity: z.enum(["info", "suggestion", "warning", "error"]).default("suggestion"),
  enabled: z.boolean().default(true),
});

export const repoConfigSchema = z.object({
  id: z.string(),
  owner: z.string(),
  repo: z.string(),
  buddyId: z.string().optional(),
  buddies: z.array(z.string()).optional(),
  autoReview: z.boolean().default(false),
  triggerMode: z.enum(["pr_opened", "mention", "review_requested", "manual"]).default("manual"),
  customRules: z.array(customRuleSchema).optional(),
  schedule: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().positive(),
    lastRun: z.string().optional(),
  }).optional(),
});

export const serverConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default("0.0.0.0"),
  webhookSecret: z.string().default(""),
  apiKey: z.string().default(""),
});

export const reviewConfigSchema = z.object({
  defaultSeverity: z.enum(["info", "suggestion", "warning", "error"]).default("suggestion"),
  maxComments: z.number().int().positive().default(50),
  autoApproveBelow: z.boolean().default(false),
  reviewDelaySeconds: z.number().int().min(0).default(0),
  maxTokensPerReview: z.number().int().positive().optional(),
  quietHours: z.object({
    start: z.string(),
    end: z.string(),
    timezone: z.string(),
  }).optional(),
});

export const configSchema = z.object({
  version: z.string().default("1.0.0"),
  githubToken: z.string().optional(),
  githubAppId: z.string().optional(),
  githubAppPrivateKey: z.string().optional(),
  githubAppInstallationId: z.string().optional(),
  repos: z.array(repoConfigSchema).default([]),
  defaultBuddyId: z.string().optional(),
  server: serverConfigSchema.optional().default(() => ({
    port: 3000,
    host: "0.0.0.0",
    webhookSecret: "",
    apiKey: "",
  })),
  review: reviewConfigSchema.optional().default(() => ({
    defaultSeverity: "suggestion" as const,
    maxComments: 50,
    autoApproveBelow: false,
    reviewDelaySeconds: 0,
  })),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
