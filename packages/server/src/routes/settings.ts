import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loadConfig, saveConfig, Logger, getErrorMessage, createLLMProvider } from "@agent-buddy/core";
import type { AgentBuddyConfig, ReviewConfig, ServerConfig, LLMProviderConfig } from "@agent-buddy/core";
import { apiError } from "../lib/api-response.js";

const logger = new Logger("routes:settings");

function maskSensitiveServerConfig(server: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!server) return undefined;
  return {
    ...server,
    apiKey: server.apiKey ? "configured" : "not set",
    webhookSecret: server.webhookSecret ? "configured" : "not set",
  };
}

function maskLLMConfig(llm: LLMProviderConfig | undefined): Record<string, unknown> | undefined {
  if (!llm) return undefined;
  return {
    ...llm,
    apiKey: llm.apiKey ? "configured" : "not set",
  };
}

function formatSettingsResponse(config: AgentBuddyConfig) {
  return {
    githubToken: config.githubToken ? "configured" : "not set",
    server: maskSensitiveServerConfig(config.server as Record<string, unknown> | undefined),
    review: config.review,
    llm: maskLLMConfig(config.llm),
  };
}

function mergeWithoutUndefined<T extends object>(target: T, source: Partial<T>): T {
  const filtered = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined)) as Partial<T>;
  return { ...target, ...filtered };
}

const githubAppSchema = z.object({
  githubAppId: z.string().min(1, "GitHub App ID is required"),
  githubAppPrivateKey: z.string().min(1, "GitHub App Private Key is required"),
  githubAppInstallationId: z.string().min(1, "GitHub App Installation ID is required"),
});

const settingsPatchSchema = z.object({
  githubToken: z.string().optional(),
  server: z.object({
    port: z.number().optional(),
    host: z.string().optional(),
    webhookSecret: z.string().optional(),
    apiKey: z.string().optional(),
  }).optional(),
  review: z.object({
    defaultSeverity: z.enum(["info", "suggestion", "warning", "error"]).optional(),
    maxComments: z.number().optional(),
    autoApproveBelow: z.boolean().optional(),
    reviewDelaySeconds: z.number().optional(),
    quietHours: z.object({
      start: z.string(),
      end: z.string(),
      timezone: z.string(),
    }).optional(),
  }).optional(),
  llm: z.object({
    provider: z.enum(["anthropic", "openrouter", "openai", "cli"]).optional(),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    defaultModel: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    interactiveShell: z.boolean().optional(),
    parseFormat: z.enum(["single-json", "jsonl-opencode", "jsonl-codex"]).optional(),
    responsePath: z.string().optional(),
    usageInputPath: z.string().optional(),
    usageOutputPath: z.string().optional(),
    modelPath: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  }).optional(),
}).partial();

export function createSettingsRoutes(): Hono {
  const app = new Hono();

  app.get("/api/settings", async (c) => {
    try {
      const config = await loadConfig();
      return c.json(formatSettingsResponse(config));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to load settings", { error: errorMessage });
      return c.json(apiError(errorMessage), 500);
    }
  });

  app.patch("/api/settings", zValidator("json", settingsPatchSchema), async (c) => {
    const body = c.req.valid("json");

    try {
      const config = await loadConfig();

      if (body.githubToken) {
        config.githubToken = body.githubToken;
      }

      if (body.server) {
        config.server = mergeWithoutUndefined(
          config.server ?? { port: 3000, host: "localhost", webhookSecret: "", apiKey: "" } as ServerConfig,
          body.server
        );
      }

      if (body.review) {
        config.review = mergeWithoutUndefined(
          config.review ?? { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 } as ReviewConfig,
          body.review
        );
      }

      if (body.llm) {
        const existingLlm = config.llm ?? { provider: "anthropic" as const } as LLMProviderConfig;
        config.llm = mergeWithoutUndefined(existingLlm, body.llm);
      }

      await saveConfig(config);

      logger.info("Settings updated successfully");
      return c.json(formatSettingsResponse(config));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to update settings", { error: errorMessage });
      return c.json(apiError(errorMessage), 500);
    }
  });

  app.post("/api/settings/github-app", zValidator("json", githubAppSchema), async (c) => {
    const body = c.req.valid("json");

    try {
      const config = await loadConfig();
      config.githubAppId = body.githubAppId;
      config.githubAppPrivateKey = body.githubAppPrivateKey;
      config.githubAppInstallationId = body.githubAppInstallationId;
      await saveConfig(config);

      logger.info("GitHub App configured successfully");
      return c.json({
        configured: true,
        githubAppId: config.githubAppId,
        githubAppInstallationId: config.githubAppInstallationId,
      }, 201);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to configure GitHub App", { error: errorMessage });
      return c.json(apiError(errorMessage), 500);
    }
  });

  app.post("/api/settings/llm/test", async (c) => {
    try {
      const config = await loadConfig();
      const provider = createLLMProvider(config.llm);
      const start = Date.now();
      const providerName = config.llm?.provider || "anthropic";

      try {
        await provider.generate([
          { role: "user", content: "Hi" },
        ], { maxTokens: 1 });

        return c.json({
          success: true,
          provider: providerName,
          model: config.llm?.defaultModel || "default",
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        const errorMsg = getErrorMessage(err).replace(/sk-[a-zA-Z0-9-]+/g, "sk-...");
        return c.json({
          success: false,
          provider: providerName,
          error: errorMsg,
          latencyMs: Date.now() - start,
        }, 400);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logger.error("Failed to test LLM connection", { error: errorMessage });
      return c.json(apiError(errorMessage), 500);
    }
  });

  return app;
}
