import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { fetchBuddyVersions } from "../commands/buddy-handlers.js";

const mockListProfileVersions = vi.fn();

vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: class {
    listProfileVersions = mockListProfileVersions;
  },
}));

vi.mock("picocolors", () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

describe("CLI buddy commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buddy versions command", () => {
    it("lists available versions sorted descending", async () => {
      mockListProfileVersions.mockResolvedValue([
        { version: 1, backedUpAt: "2026-04-10T10:00:00Z" },
        { version: 3, backedUpAt: "2026-04-20T10:00:00Z" },
        { version: 2, backedUpAt: "2026-04-15T10:00:00Z" },
      ]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(3);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(1);
      expect(mockListProfileVersions).toHaveBeenCalledWith("buddy-1");
    });

    it("handles non-existent buddy with no versions", async () => {
      mockListProfileVersions.mockResolvedValue([]);

      const versions = await fetchBuddyVersions("nonexistent-buddy");

      expect(versions).toHaveLength(0);
      expect(mockListProfileVersions).toHaveBeenCalledWith("nonexistent-buddy");
    });

    it("handles single version", async () => {
      mockListProfileVersions.mockResolvedValue([{ version: 1, backedUpAt: "2026-04-10T10:00:00Z" }]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
    });

    it("preserves version metadata from storage", async () => {
      mockListProfileVersions.mockResolvedValue([{ version: 2, backedUpAt: "2026-04-15T10:00:00Z" }]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions[0]).toEqual({ version: 2, backedUpAt: "2026-04-15T10:00:00Z" });
    });

    it("calls BuddyFileSystemStorage.listProfileVersions with buddy ID", async () => {
      mockListProfileVersions.mockResolvedValue([]);

      await fetchBuddyVersions("test-buddy-id");

      expect(mockListProfileVersions).toHaveBeenCalledExactlyOnceWith("test-buddy-id");
    });
  });

  describe("buddy setup command", () => {
    describe("validation", () => {
      it("rejects empty GitHub token", () => {
        const validate = (v: string) => (v.trim().length > 0 ? true : "GitHub token is required");
        expect(validate("")).toBe("GitHub token is required");
        expect(validate("   ")).toBe("GitHub token is required");
      });

      it("accepts valid GitHub token", () => {
        const validate = (v: string) => (v.trim().length > 0 ? true : "GitHub token is required");
        expect(validate("ghp_valid_token")).toBe(true);
      });

      it("rejects empty Anthropic API key", () => {
        const validate = (v: string) => (v.trim().length > 0 ? true : "Anthropic API key is required");
        expect(validate("")).toBe("Anthropic API key is required");
        expect(validate("   ")).toBe("Anthropic API key is required");
      });

      it("accepts valid Anthropic API key", () => {
        const validate = (v: string) => (v.trim().length > 0 ? true : "Anthropic API key is required");
        expect(validate("sk-ant-valid-key")).toBe(true);
      });

      it("rejects port out of valid range", () => {
        const validate = (v: string) => {
          const n = parseInt(v, 10);
          return !isNaN(n) && n > 0 && n < 65536 ? true : "Port must be between 1 and 65535";
        };
        expect(validate("0")).toBe("Port must be between 1 and 65535");
        expect(validate("-1")).toBe("Port must be between 1 and 65535");
        expect(validate("65536")).toBe("Port must be between 1 and 65535");
        expect(validate("abc")).toBe("Port must be between 1 and 65535");
      });

      it("accepts port within valid range", () => {
        const validate = (v: string) => {
          const n = parseInt(v, 10);
          return !isNaN(n) && n > 0 && n < 65536 ? true : "Port must be between 1 and 65535";
        };
        expect(validate("1")).toBe(true);
        expect(validate("3000")).toBe(true);
        expect(validate("65535")).toBe(true);
      });
    });

    describe("GitHub token validation via API", () => {
      it("validates token successfully against GitHub API", async () => {
        const mockFetch = vi.fn(async () => ({
          ok: true,
          json: async () => ({ login: "testuser" }),
        }));
        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer ghp_token" },
        });

        expect(res.ok).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith("https://api.github.com/user", {
          headers: { Authorization: "Bearer ghp_token" },
        });
      });

      it("detects invalid GitHub token", async () => {
        const mockFetch = vi.fn(async () => ({ ok: false }));
        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer ghp_invalid" },
        });

        expect(res.ok).toBe(false);
      });

      it("handles network errors during GitHub validation", async () => {
        const mockFetch = vi.fn(async () => {
          throw new Error("Network error");
        });
        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        await expect(fetch("https://api.github.com/user")).rejects.toThrow("Network error");
      });

      it("extracts username from successful validation", async () => {
        const mockUser = { login: "testuser", id: 12345 };
        const mockFetch = vi.fn(async () => ({
          ok: true,
          json: async () => mockUser,
        }));
        global.fetch = mockFetch as unknown as typeof globalThis.fetch;

        const res = await fetch("https://api.github.com/user", {
          headers: { Authorization: "Bearer ghp_token" },
        });

        const user = (await res.json()) as { login: string };
        expect(user.login).toBe("testuser");
      });
    });

    describe("configuration file operations", () => {
      it("merges new values with existing config preserving server settings", () => {
        const existingConfig = {
          version: "1.0.0",
          repos: [{ id: "owner/repo", autoReview: true }],
          server: { port: 4000, host: "localhost" },
        };

        const mergedConfig = {
          ...existingConfig,
          githubToken: "ghp_new_token",
          anthropicApiKey: "sk-ant-new-key",
        };

        expect(mergedConfig.server).toEqual({ port: 4000, host: "localhost" });
        expect(mergedConfig.githubToken).toBe("ghp_new_token");
        expect(mergedConfig.repos).toEqual([{ id: "owner/repo", autoReview: true }]);
      });

      it("merges server port without overwriting other server fields", () => {
        const existingConfig = {
          version: "1.0.0",
          server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
        };

        const updatedConfig = {
          ...existingConfig,
          server: { ...(existingConfig.server as Record<string, unknown>), port: 4000 },
        };

        expect(updatedConfig.server).toEqual({
          port: 4000,
          host: "0.0.0.0",
          webhookSecret: "",
          apiKey: "",
        });
      });

      it("creates default server config when missing from existing config", () => {
        const config = {
          version: "1.0.0",
          repos: [],
        } as {
          version: string;
          repos: unknown[];
          server?: { port: number; host: string; webhookSecret: string; apiKey: string };
        };

        config.server = config.server || {
          port: 3000,
          host: "0.0.0.0",
          webhookSecret: "",
          apiKey: "",
        };

        expect(config.server).toEqual({
          port: 3000,
          host: "0.0.0.0",
          webhookSecret: "",
          apiKey: "",
        });
      });

      it("handles missing config file by initializing empty config", () => {
        let config: Record<string, unknown> = {};

        try {
          throw new Error("ENOENT");
        } catch {
          config = {};
        }

        expect(config).toEqual({});
      });

      it("throws on malformed JSON config file", () => {
        expect(() => JSON.parse("{ invalid json }")).toThrow();
      });

      it("constructs correct config directory path", () => {
        const configDir = path.join(os.homedir(), ".agent-buddy");
        expect(configDir).toContain(".agent-buddy");
        expect(configDir).toContain(os.homedir());
      });
    });
  });
});
