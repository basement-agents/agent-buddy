import { getErrorMessage, loadConfig, createLLMProvider } from "@agent-buddy/core";

export interface HealthCheckResult {
  status: "ok" | "error";
  provider?: string;
  message?: string;
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export async function checkProviderHealth(): Promise<HealthCheckResult> {
  try {
    const config = await loadConfig();
    const llmConfig = config.llm;

    if (!llmConfig?.apiKey && !process.env[llmConfig?.provider === "openrouter" ? "OPENROUTER_API_KEY" : llmConfig?.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"]) {
      return { status: "error", provider: llmConfig?.provider || "anthropic", message: "API key not configured" };
    }

    const provider = createLLMProvider(llmConfig);
    const providerName = llmConfig?.provider || "anthropic";

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT_MS)
    );

    await Promise.race([
      provider.generate([{ role: "user", content: "Hi" }], { maxTokens: 1 }),
      timeoutPromise,
    ]);

    return { status: "ok", provider: providerName };
  } catch (error) {
    const message = getErrorMessage(error);
    const config = await loadConfig().catch(() => null);
    return {
      status: "error",
      provider: config?.llm?.provider || "anthropic",
      message: message.includes("timeout") ? "Connection timeout" : message,
    };
  }
}

export async function performHealthChecks(): Promise<{ provider: HealthCheckResult }> {
  const provider = await checkProviderHealth().catch((error) => ({
    status: "error" as const,
    message: getErrorMessage(error),
  }));

  return { provider };
}
