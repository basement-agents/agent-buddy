import { getErrorMessage, loadConfig, createLLMProvider } from "@agent-buddy/core";

export interface HealthCheckResult {
  status: "ok" | "error";
  provider?: string;
  message?: string;
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export async function checkProviderHealth(): Promise<HealthCheckResult> {
  const config = await loadConfig().catch(() => null);
  const llmConfig = config?.llm;
  const providerName = llmConfig?.provider || "anthropic";

  try {
    const provider = createLLMProvider(llmConfig);

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
    return {
      status: "error",
      provider: providerName,
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
