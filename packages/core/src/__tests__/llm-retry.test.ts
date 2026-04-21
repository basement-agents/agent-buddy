import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicClaudeProvider } from "../llm/provider.js";
import type { LLMMessage } from "../llm/types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe("AnthropicClaudeProvider Retry Logic", () => {
  let provider: AnthropicClaudeProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AnthropicClaudeProvider("test-api-key", undefined, undefined, 5000);
  });

  it("should return result after successful retry on 500 error", async () => {
    let attemptCount = 0;

    mockFetch.mockImplementation(async () => {
      attemptCount++;

      if (attemptCount < 3) {
        // Fail with 500 for first two attempts
        return {
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        } as Response;
      }

      // Succeed on third attempt
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Success after retries" }],
          usage: { input_tokens: 10, output_tokens: 20 },
          model: "claude-sonnet-4-20250514",
        }),
      } as Response;
    });

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    const result = await provider.generate(messages);

    expect(attemptCount).toBe(3);
    expect(result.content).toBe("Success after retries");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(20);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should return result after successful retry on 429 rate limit error", async () => {
    let attemptCount = 0;

    mockFetch.mockImplementation(async () => {
      attemptCount++;

      if (attemptCount < 2) {
        // Fail with 429 on first attempt
        return {
          ok: false,
          status: 429,
          text: async () => "Rate limit exceeded",
        } as Response;
      }

      // Succeed on second attempt
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Success after rate limit" }],
          usage: { input_tokens: 5, output_tokens: 15 },
          model: "claude-sonnet-4-20250514",
        }),
      } as Response;
    });

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    const result = await provider.generate(messages);

    expect(attemptCount).toBe(2);
    expect(result.content).toBe("Success after rate limit");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should throw error after max retries on persistent 500 errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    await expect(provider.generate(messages)).rejects.toThrow(
      "Anthropic API error 500: Internal Server Error"
    );

    // Should attempt default 3 retries + 1 initial = 4 total attempts
    expect(mockFetch).toHaveBeenCalledTimes(4);
  }, 10000);

  it("should NOT retry on 4xx errors (except 429)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    } as Response);

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    await expect(provider.generate(messages)).rejects.toThrow(
      "Anthropic API error 400: Bad Request"
    );

    // Should only attempt once (no retries for 4xx errors)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should NOT retry on 401 unauthorized error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    } as Response);

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    await expect(provider.generate(messages)).rejects.toThrow(
      "Anthropic API error 401: Unauthorized"
    );

    // Should only attempt once (no retries for 401)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should respect custom maxRetries option", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    await expect(provider.generate(messages, { maxRetries: 1 })).rejects.toThrow(
      "Anthropic API error 500: Internal Server Error"
    );

    // Should attempt 1 retry + 1 initial = 2 total attempts
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should apply retry logic to generateStructured method", async () => {
    let attemptCount = 0;

    mockFetch.mockImplementation(async () => {
      attemptCount++;

      if (attemptCount < 3) {
        return {
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: '{"key": "value"}' }],
          usage: { input_tokens: 10, output_tokens: 20 },
          model: "claude-sonnet-4-20250514",
        }),
      } as Response;
    });

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    const result = await provider.generateStructured<{ key: string }>(messages);

    expect(attemptCount).toBe(3);
    expect(result.content).toEqual({ key: "value" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff delays", async () => {
    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    // Capture setTimeout calls
    global.setTimeout = vi.fn((fn, delay) => {
      delays.push(delay as number);
      return originalSetTimeout(fn as () => void, delay);
    }) as unknown as typeof setTimeout;

    let requestCount = 0;
    mockFetch.mockImplementation(async () => {
      requestCount++;

      if (requestCount <= 2) {
        return {
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Success" }],
          usage: { input_tokens: 10, output_tokens: 20 },
          model: "claude-sonnet-4-20250514",
        }),
      } as Response;
    });

    const messages: LLMMessage[] = [
      { role: "user", content: "Test message" },
    ];

    await provider.generate(messages);

    // Should have backoff delays: 1000ms (2^0), 2000ms (2^1) — filter out per-request timeout setTimeout calls
    const backoffDelays = delays.filter((d) => d < 5000);
    expect(backoffDelays).toEqual([1000, 2000]);

    global.setTimeout = originalSetTimeout;
  });
});
