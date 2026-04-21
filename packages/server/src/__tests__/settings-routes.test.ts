import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentBuddyConfig } from "@agent-buddy/core";

// Mock @agent-buddy/core at top level before imports
vi.mock("@agent-buddy/core", () => {
  return {
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
    getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
    Logger: class {
      info = vi.fn();
      error = vi.fn();
      warn = vi.fn();
      constructor() {}
    },
  };
});

import { loadConfig, saveConfig } from "@agent-buddy/core";
import { createSettingsRoutes } from "../routes/settings.js";

describe("Settings Routes", () => {
  let mockConfig: AgentBuddyConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      version: "1.0.0",
      githubToken: "ghp_test_token",
      repos: [],
      server: {
        port: 3000,
        host: "localhost",
        webhookSecret: "secret123",
        apiKey: "key123",
      },
      review: {
        defaultSeverity: "suggestion",
        maxComments: 50,
        autoApproveBelow: false,
        reviewDelaySeconds: 0,
      },
    };
    vi.mocked(loadConfig).mockResolvedValue(mockConfig);
    vi.mocked(saveConfig).mockResolvedValue(undefined);
  });

  describe("GET /api/settings", () => {
    it("should return current config with githubToken masked", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const data = await res.json() as { githubToken: string; server: typeof mockConfig.server; review: typeof mockConfig.review };
      expect(data).toEqual({
        githubToken: "configured",
        server: { ...mockConfig.server, apiKey: "configured", webhookSecret: "configured" },
        review: mockConfig.review,
      });
    });

    it("should return 'not set' when githubToken is undefined", async () => {
      vi.mocked(loadConfig).mockResolvedValue({ ...mockConfig, githubToken: undefined });
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const data = await res.json() as { githubToken: string };
      expect(data.githubToken).toBe("not set");
    });

    it("should return 'not set' when githubToken is empty string", async () => {
      vi.mocked(loadConfig).mockResolvedValue({ ...mockConfig, githubToken: "" });
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings");

      expect(res.status).toBe(200);
      const data = await res.json() as { githubToken: string };
      expect(data.githubToken).toBe("not set");
    });

    it("should return 500 on loadConfig error", async () => {
      vi.mocked(loadConfig).mockRejectedValue(new Error("Failed to load config"));
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings");

      expect(res.status).toBe(500);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Failed to load config");
    });
  });

  describe("PATCH /api/settings", () => {
    it("should update githubToken field", async () => {
      const app = createSettingsRoutes();
      const newToken = "ghp_new_token";
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: newToken }),
      });

      expect(res.status).toBe(200);
      expect(saveConfig).toHaveBeenCalled();
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.githubToken).toBe(newToken);

      const data = await res.json() as { githubToken: string };
      expect(data.githubToken).toBe("configured");
    });

    it("should merge server fields", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { port: 4000 } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.server?.port).toBe(4000);
      expect(savedConfig.server?.host).toBe("localhost"); // preserved
    });

    it("should merge review fields", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { maxComments: 100 } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.review?.maxComments).toBe(100);
      expect(savedConfig.review?.defaultSeverity).toBe("suggestion"); // preserved
    });

    it("should initialize server config if undefined", async () => {
      vi.mocked(loadConfig).mockResolvedValue({ ...mockConfig, server: undefined });
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { port: 5000 } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.server).toBeDefined();
      expect(savedConfig.server?.port).toBe(5000);
      expect(savedConfig.server?.host).toBe("localhost");
    });

    it("should initialize review config if undefined", async () => {
      vi.mocked(loadConfig).mockResolvedValue({ ...mockConfig, review: undefined });
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { defaultSeverity: "warning" } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.review).toBeDefined();
      expect(savedConfig.review?.defaultSeverity).toBe("warning");
      expect(savedConfig.review?.maxComments).toBe(50);
    });

    it("should support quietHours in review config", async () => {
      const app = createSettingsRoutes();
      const quietHours = { start: "22:00", end: "08:00", timezone: "America/New_York" };
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { quietHours } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.review?.quietHours).toEqual(quietHours);
    });

    it("should return masked githubToken in response", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { port: 4000 } }),
      });

      expect(res.status).toBe(200);
      const data = await res.json() as { githubToken: string };
      expect(data.githubToken).toBe("configured");
    });

    it("should return 500 on saveConfig error", async () => {
      vi.mocked(saveConfig).mockRejectedValue(new Error("Failed to save"));
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: "new_token" }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Failed to save");
    });

    it("should return 400 for invalid server.port (string)", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { port: "not_a_number" } }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid review.defaultSeverity", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { defaultSeverity: "invalid" } }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid review.maxComments (string)", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { maxComments: "not_a_number" } }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid review.reviewDelaySeconds (string)", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { reviewDelaySeconds: "not_a_number" } }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid review.autoApproveBelow (string)", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: { autoApproveBelow: "not_boolean" } }),
      });

      expect(res.status).toBe(400);
    });

    it("should accept empty body (partial update with no fields)", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(saveConfig).toHaveBeenCalled();
    });

    it("should accept partial server config updates", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: { host: "0.0.0.0" } }),
      });

      expect(res.status).toBe(200);
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.server?.host).toBe("0.0.0.0");
    });
  });

  describe("POST /api/settings/github-app", () => {
    it("should configure GitHub App settings", async () => {
      const app = createSettingsRoutes();
      const githubAppData = {
        githubAppId: "app_123",
        githubAppPrivateKey: "private_key",
        githubAppInstallationId: "install_456",
      };
      const res = await app.request("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(githubAppData),
      });

      expect(res.status).toBe(201);
      expect(saveConfig).toHaveBeenCalled();
      const savedConfig = vi.mocked(saveConfig).mock.calls[0][0];
      expect(savedConfig.githubAppId).toBe("app_123");
      expect(savedConfig.githubAppPrivateKey).toBe("private_key");
      expect(savedConfig.githubAppInstallationId).toBe("install_456");

      const data = await res.json() as { configured: boolean; githubAppId: string; githubAppInstallationId: string };
      expect(data.configured).toBe(true);
      expect(data.githubAppId).toBe("app_123");
      expect(data.githubAppInstallationId).toBe("install_456");
    });

    it("should return 400 for missing githubAppId", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubAppPrivateKey: "private_key",
          githubAppInstallationId: "install_456",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for missing githubAppPrivateKey", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubAppId: "app_123",
          githubAppInstallationId: "install_456",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 400 for missing githubAppInstallationId", async () => {
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubAppId: "app_123",
          githubAppPrivateKey: "private_key",
        }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 500 on saveConfig error", async () => {
      vi.mocked(saveConfig).mockRejectedValue(new Error("Save failed"));
      const app = createSettingsRoutes();
      const res = await app.request("/api/settings/github-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubAppId: "app_123",
          githubAppPrivateKey: "private_key",
          githubAppInstallationId: "install_456",
        }),
      });

      expect(res.status).toBe(500);
      const data = await res.json() as { error: string };
      expect(data.error).toBe("Save failed");
    });
  });
});
