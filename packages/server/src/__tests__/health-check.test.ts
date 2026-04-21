import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAnthropicHealth, performHealthChecks } from "../lib/health-check.js";

describe("Health Check Utility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("should return error when API key is not configured", async () => {
    // Delete the API key from environment
    delete process.env.ANTHROPIC_API_KEY;

    const result = await checkAnthropicHealth();
    expect(result.status).toBe("error");
    expect(result.message).toBe("API key not configured");
  });

  it("should return ok when API call succeeds", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    const result = await checkAnthropicHealth();
    expect(result.status).toBe("ok");
    expect(result.message).toBeUndefined();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
  });

  it("should return error when API call fails with 401", async () => {
    process.env.ANTHROPIC_API_KEY = "invalid-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    global.fetch = mockFetch;

    const result = await checkAnthropicHealth();
    expect(result.status).toBe("error");
    expect(result.message).toBe("Invalid API key");
  });

  it("should return error when API call fails with 429", async () => {
    process.env.ANTHROPIC_API_KEY = "rate-limited-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    global.fetch = mockFetch;

    const result = await checkAnthropicHealth();
    expect(result.status).toBe("error");
    expect(result.message).toBe("Rate limit exceeded");
  });

  it("should return error when API call times out", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const mockFetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          // Never resolve, simulating timeout
          setTimeout(() => resolve({ ok: true, status: 200 }), 10000);
        })
    );
    global.fetch = mockFetch;

    const result = await checkAnthropicHealth();
    expect(result.status).toBe("error");
    expect(result.message).toBe("Connection timeout");
  }, 10000);

  it("should perform all health checks in parallel", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    global.fetch = mockFetch;

    const result = await performHealthChecks();

    expect(result).toHaveProperty("anthropic");
    expect(result.anthropic.status).toBe("ok");
  });
});
