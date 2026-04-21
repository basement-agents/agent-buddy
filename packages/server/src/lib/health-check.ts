import { getErrorMessage } from "@agent-buddy/core";

export interface HealthCheckResult {
  status: "ok" | "error";
  message?: string;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const HEALTH_CHECK_TIMEOUT_MS = 5000;

export async function checkAnthropicHealth(): Promise<HealthCheckResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { status: "error", message: "API key not configured" };
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT_MS)
    );

    const response = await Promise.race([
      fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
      }),
      timeoutPromise,
    ]);

    if (response.ok) return { status: "ok" };
    if (response.status === 401) return { status: "error", message: "Invalid API key" };
    if (response.status === 429) return { status: "error", message: "Rate limit exceeded" };
    return { status: "error", message: `API error ${response.status}` };
  } catch (error) {
    const message = getErrorMessage(error);
    return { status: "error", message: message.includes("timeout") ? "Connection timeout" : message };
  }
}

export async function performHealthChecks(): Promise<{ anthropic: HealthCheckResult }> {
  const [anthropic] = await Promise.all([
    checkAnthropicHealth().catch((error) => ({
      status: "error" as const,
      message: getErrorMessage(error),
    })),
  ]);

  return { anthropic };
}
