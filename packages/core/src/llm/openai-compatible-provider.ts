import type { LLMMessage, LLMOptions, LLMProvider, LLMResponse } from "./types.js";
import { Logger, getErrorMessage, retryWithBackoff, DEFAULT_BASE_DELAY_MS } from "../utils/index.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 4096;

export abstract class OpenAICompatibleProvider implements LLMProvider {
  protected apiKey: string;
  protected defaultModel: string;
  private maxRetries: number;
  private timeoutMs: number;
  private logger: Logger;

  constructor(
    apiKey: string,
    defaultModel: string,
    protected readonly providerName: string,
    maxRetries = DEFAULT_MAX_RETRIES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.providerName = providerName;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.logger = new Logger(`${providerName.toLowerCase()}-provider`);
  }

  protected abstract get apiUrl(): string;

  async generate(
    messages: LLMMessage[],
    options: LLMOptions = {},
  ): Promise<LLMResponse> {
    return retryWithBackoff(async () => {
      const model = options.model || this.defaultModel;
      const systemMessage = messages.find((m) => m.role === "system")?.content || options.systemPrompt;
      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      const apiMessages: Array<{ role: string; content: string }> = [];
      if (systemMessage) {
        apiMessages.push({ role: "system", content: systemMessage });
      }
      for (const m of nonSystemMessages) {
        apiMessages.push({ role: m.role, content: m.content });
      }

      const body: Record<string, unknown> = {
        model,
        max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
        messages: apiMessages,
      };

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(`${this.providerName} request timed out after ${this.timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        const sanitized = errorText.replace(/sk-[a-zA-Z0-9-]{20,}/g, "sk-...").replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "eyJ...");
        throw new Error(`${this.providerName} API error ${response.status}: ${sanitized}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };

      return {
        content: data.choices[0]?.message?.content || "",
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
        },
        model: data.model || "unknown",
      };
    }, {
      maxRetries: options.maxRetries ?? this.maxRetries,
      baseDelayMs: DEFAULT_BASE_DELAY_MS,
      isRetryable: (err) => this.isRetryableError(err),
      onRetry: (err, attempt, delayMs) => {
        this.logger.warn(`Retry attempt ${attempt + 1} after ${delayMs}ms`, { error: err.message });
      },
    });
  }

  async generateStructured<T>(
    messages: LLMMessage[],
    options: LLMOptions = {},
  ): Promise<{ content: T; usage: LLMResponse["usage"]; model: string }> {
    const enhancedMessages: LLMMessage[] = [
      ...messages,
      {
        role: "user",
        content: "You must respond with valid JSON only. No markdown, no code fences, no explanation - just the raw JSON object.",
      },
    ];

    const response = await this.generate(enhancedMessages, {
      ...options,
      temperature: 0,
    });

    let parsed: T;
    try {
      let jsonStr = response.content.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }
      parsed = JSON.parse(jsonStr) as T;
    } catch (err) {
      const snippet = response.content.slice(0, 500);
      this.logger.error("Failed to parse structured response as JSON", { error: getErrorMessage(err), snippet });
      throw new Error(
        `Failed to parse structured response as JSON: ${getErrorMessage(err)}. Response: ${snippet}`,
      );
    }

    return {
      content: parsed,
      usage: response.usage,
      model: response.model,
    };
  }

  private isRetryableError(error: Error): boolean {
    const statusMatch = error.message.match(/API error (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return status === 429 || (status >= 500 && status < 600);
    }
    const msg = error.message.toLowerCase();
    return msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("econnrefused") || msg.includes("socket hang up") || msg.includes("network") || msg.includes("fetch failed");
  }
}
