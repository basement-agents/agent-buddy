import type { LLMMessage, LLMOptions, LLMProvider, LLMResponse } from "./types.js";
import { Logger, getErrorMessage, retryWithBackoff, DEFAULT_BASE_DELAY_MS } from "../utils/index.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicClaudeProvider implements LLMProvider {
  private apiKey: string;
  private defaultModel: string;
  private maxRetries: number;
  private timeoutMs: number;
  private logger: Logger;

  constructor(apiKey: string, defaultModel = DEFAULT_MODEL, maxRetries = DEFAULT_MAX_RETRIES, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.logger = new Logger("anthropic-provider");
  }

  private isRetryableError(error: Error): boolean {
    const statusMatch = error.message.match(/API error (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      return status === 429 || (status >= 500 && status < 600);
    }
    const msg = error.message.toLowerCase();
    if (msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("econnrefused") || msg.includes("socket hang up") || msg.includes("network") || msg.includes("fetch failed")) {
      return true;
    }
    return false;
  }

  async generate(
    messages: LLMMessage[],
    options: LLMOptions = {}
  ): Promise<LLMResponse> {
    return retryWithBackoff(async () => {
      const model = options.model || this.defaultModel;

      const systemMessage = messages.find((m) => m.role === "system")?.content || options.systemPrompt;

      const nonSystemMessages = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model,
        max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
        messages: nonSystemMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (systemMessage) {
        body.system = systemMessage;
      }

      if (options.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(`LLM request timed out after ${this.timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage: { input_tokens: number; output_tokens: number };
        model: string;
      };

      return {
        content: data.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
        model: data.model,
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
    options: LLMOptions = {}
  ): Promise<{ content: T; usage: LLMResponse["usage"]; model: string }> {
    const enhancedMessages: LLMMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "You must respond with valid JSON only. No markdown, no code fences, no explanation - just the raw JSON object.",
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
      this.logger.error("Failed to parse structured response as JSON", { error: getErrorMessage(err), snippet: response.content.slice(0, 200) });
      throw new Error(
        `Failed to parse structured response as JSON: ${response.content.slice(0, 200)}`
      );
    }

    return {
      content: parsed,
      usage: response.usage,
      model: response.model,
    };
  }
}
