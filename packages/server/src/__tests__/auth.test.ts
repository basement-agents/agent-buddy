import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  Logger: vi.fn(),
}));

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 503 when config has no apiKey", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      version: "1.0.0",
      repos: [],
    });

    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data).toEqual({ error: "Server not configured: API key is required. Run 'agent-buddy init' to set up." });
  });

  it("should pass through when apiKey is configured and request has correct key", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      version: "1.0.0",
      repos: [],
      server: {
        port: 3000,
        host: "localhost",
        webhookSecret: "test-secret",
        apiKey: "correct-key",
      },
    });

    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: {
        "x-api-key": "correct-key",
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it("should return 401 when apiKey is configured but request has no key", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      version: "1.0.0",
      repos: [],
      server: {
        port: 3000,
        host: "localhost",
        webhookSecret: "test-secret",
        apiKey: "secret-key",
      },
    });

    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });

  it("should return 403 when apiKey is configured but request has wrong key", async () => {
    const { loadConfig } = await import("@agent-buddy/core");
    vi.mocked(loadConfig).mockResolvedValue({
      version: "1.0.0",
      repos: [],
      server: {
        port: 3000,
        host: "localhost",
        webhookSecret: "test-secret",
        apiKey: "correct-key",
      },
    });

    const app = new Hono();
    app.use("/*", authMiddleware);
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", {
      headers: {
        "x-api-key": "wrong-key",
      },
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data).toEqual({ error: "Unauthorized" });
  });
});
