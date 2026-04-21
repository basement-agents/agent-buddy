import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn();

vi.mock("@agent-buddy/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agent-buddy/core")>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    createLLMProvider: vi.fn().mockReturnValue({ generate: mockGenerate }),
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  };
});

describe("Health Check Utility", () => {
  let createLLMProviderMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
    mockGenerate.mockReset();
    const { createLLMProvider } = await import("@agent-buddy/core");
    createLLMProviderMock = vi.mocked(createLLMProvider);
    createLLMProviderMock.mockReturnValue({ generate: mockGenerate });
  });

  it("should return error when no API key is configured", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({ llm: undefined } as never);
    createLLMProviderMock.mockImplementation(() => { throw new Error("No API key configured for anthropic"); });

    const { checkProviderHealth } = await import("../lib/health-check.js");
    const result = await checkProviderHealth();

    expect(result.status).toBe("error");
    expect(result.message).toBe("No API key configured for anthropic");
  });

  it("should return ok when provider connection succeeds", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      llm: { provider: "anthropic", apiKey: "test-key" },
    } as never);

    mockGenerate.mockResolvedValue({ content: "ok", usage: { inputTokens: 1, outputTokens: 1 }, model: "test" });

    const { checkProviderHealth } = await import("../lib/health-check.js");
    const result = await checkProviderHealth();

    expect(result.status).toBe("ok");
    expect(result.provider).toBe("anthropic");
  });

  it("should return error when provider connection fails", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      llm: { provider: "openrouter", apiKey: "bad-key" },
    } as never);

    mockGenerate.mockRejectedValue(new Error("Invalid API key"));

    const { checkProviderHealth } = await import("../lib/health-check.js");
    const result = await checkProviderHealth();

    expect(result.status).toBe("error");
    expect(result.provider).toBe("openrouter");
    expect(result.message).toBe("Invalid API key");
  });

  it("should return error on timeout", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      llm: { provider: "anthropic", apiKey: "test-key" },
    } as never);

    mockGenerate.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("Health check timeout")), 6000))
    );

    const { checkProviderHealth } = await import("../lib/health-check.js");
    const result = await checkProviderHealth();

    expect(result.status).toBe("error");
    expect(result.message).toBe("Connection timeout");
  }, 10000);

  it("performHealthChecks should return provider result", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      llm: { provider: "openai", apiKey: "test-key" },
    } as never);

    mockGenerate.mockResolvedValue({ content: "ok", usage: { inputTokens: 1, outputTokens: 1 }, model: "test" });

    const { performHealthChecks } = await import("../lib/health-check.js");
    const result = await performHealthChecks();

    expect(result).toHaveProperty("provider");
    expect(result.provider.status).toBe("ok");
    expect(result.provider.provider).toBe("openai");
  });
});
