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

export const llmProviderConfigSchema = z.object({
  provider: z.enum(["anthropic", "openrouter", "openai", "cli"]).default("anthropic"),
  apiKey: z.string().min(20, "API key too short").max(500, "API key too long").optional(),
  baseUrl: z.string().url("Invalid URL format").optional()
    .refine((val) => !val || val.startsWith("https://"), { message: "baseUrl must use HTTPS" })
    .refine((val) => {
      if (!val) return true;
      try {
        const hostname = new URL(val).hostname;
        if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") return false;
        if (hostname.startsWith("169.254.") || hostname.startsWith("10.") || hostname.startsWith("192.168.")) return false;
        if (hostname.match(/^172\.(1[6-9]|2\d|3[01])\./)) return false;
        if (hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe")) return false;
        return true;
      } catch {
        return false;
      }
    }, { message: "baseUrl must not point to internal/private network" }),
  defaultModel: z.string().regex(/^[a-zA-Z0-9._/:@-]+$/, "Invalid model name").optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  interactiveShell: z.boolean().optional(),
  parseFormat: z.enum(["single-json", "jsonl-opencode", "jsonl-codex"]).optional(),
  responsePath: z.string().optional(),
  usageInputPath: z.string().optional(),
  usageOutputPath: z.string().optional(),
  modelPath: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.provider === "cli" && !data.command) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["command"],
      message: "command is required when provider is 'cli'",
    });
  }
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
  llm: llmProviderConfigSchema.optional(),
});

export type ValidatedConfig = z.infer<typeof configSchema>;
