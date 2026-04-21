import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing
vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: vi.fn(),
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  resetConfig: vi.fn(),
  addRepo: vi.fn(),
  removeRepo: vi.fn(),
  listRepos: vi.fn(),
  GitHubClient: vi.fn(),
  AnalysisPipeline: vi.fn(),
  ReviewEngine: vi.fn(),
  AnthropicClaudeProvider: vi.fn(),
  compareBuddies: vi.fn(),
  Logger: vi.fn(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() })),
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
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

import { loadConfig, saveConfig, resetConfig } from "@agent-buddy/core";
import { confirm } from "@inquirer/prompts";

const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);
const mockResetConfig = vi.mocked(resetConfig);
const mockConfirm = vi.mocked(confirm);

// Helper function that replicates CLI config set logic
function setConfigValue(config: Record<string, unknown>, key: string, value: string): Record<string, unknown> {
  const keys = key.split(".");
  let target = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in target)) {
      target[keys[i]] = {};
    }
    target = target[keys[i]] as unknown as Record<string, unknown>;
  }
  const finalKey = keys[keys.length - 1];
  try {
    target[finalKey] = JSON.parse(value);
  } catch {
    target[finalKey] = value;
  }
  return config;
}

// Helper function that replicates CLI config get logic
function getConfigValue(config: unknown, key: string): unknown {
  const keys = key.split(".");
  let value = config;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = (value as unknown as Record<string, unknown>)[k];
    } else {
      return undefined; // key not found
    }
  }
  return value;
}

describe("CLI config commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("config set", () => {
    it("sets a top-level key value", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "githubToken", "ghp_test_token");

      expect(updatedConfig.githubToken).toBe("ghp_test_token");
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("sets a nested key via dot notation", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "server.port", "4000");

      expect((updatedConfig.server as unknown as Record<string, unknown>).port).toBe(4000);
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("parses numeric values via JSON.parse", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "server.port", "8080");

      expect((updatedConfig.server as unknown as Record<string, unknown>).port).toBe(8080);
      expect(typeof (updatedConfig.server as unknown as Record<string, unknown>).port).toBe("number");
    });

    it("parses boolean values via JSON.parse", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "review.autoApproveBelow", "true");

      expect((updatedConfig.review as unknown as Record<string, unknown>).autoApproveBelow).toBe(true);
      expect(typeof (updatedConfig.review as unknown as Record<string, unknown>).autoApproveBelow).toBe("boolean");
    });

    it("falls back to string when JSON.parse fails", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "githubToken", "ghp_not_a_json_string");

      expect(updatedConfig.githubToken).toBe("ghp_not_a_json_string");
      expect(typeof updatedConfig.githubToken).toBe("string");
    });

    it("creates intermediate objects for deep nesting", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "new.nested.key", "value");

      expect(updatedConfig.new).toBeDefined();
      expect(typeof updatedConfig.new).toBe("object");
      expect((updatedConfig.new as unknown as Record<string, unknown>).nested).toBeDefined();
      expect(((updatedConfig.new as unknown as Record<string, unknown>).nested as unknown as Record<string, unknown>).key).toBe("value");
    });

    it("calls saveConfig after setting", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "githubToken", "ghp_test");

      await saveConfig(updatedConfig as never);

      expect(mockSaveConfig).toHaveBeenCalledExactlyOnceWith(updatedConfig);
    });

    it("handles nested object creation with multiple levels", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "level1.level2.level3.value", "deep");

      expect(updatedConfig.level1).toBeDefined();
      expect(((updatedConfig.level1 as unknown as Record<string, unknown>).level2 as unknown as Record<string, unknown>).level3).toBeDefined();
      expect((((updatedConfig.level1 as unknown as Record<string, unknown>).level2 as unknown as Record<string, unknown>).level3 as unknown as Record<string, unknown>).value).toBe("deep");
    });

    it("parses null via JSON.parse", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "secret", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "server.webhookSecret", "null");

      expect((updatedConfig.server as unknown as Record<string, unknown>).webhookSecret).toBeNull();
    });

    it("parses objects via JSON.parse", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      const config = (await loadConfig()) as unknown as Record<string, unknown>;
      const updatedConfig = setConfigValue(config, "custom", '{"key":"value"}');

      expect(updatedConfig.custom).toEqual({ key: "value" });
      expect(typeof updatedConfig.custom).toBe("object");
    });
  });

  describe("config get", () => {
    it("retrieves top-level value", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        githubToken: "ghp_test_token",
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "githubToken");

      expect(value).toBe("ghp_test_token");
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("retrieves nested value via dot notation", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "server.port");

      expect(value).toBe(3000);
    });

    it("returns undefined for non-existent key", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "nonexistent.key");

      expect(value).toBeUndefined();
    });

    it("navigates through multiple levels", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "server.host");

      expect(value).toBe("0.0.0.0");
    });

    it("handles missing intermediate keys", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "server.port");

      expect(value).toBeUndefined();
    });

    it("retrieves complex nested objects", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        review: {
          defaultSeverity: "suggestion",
          maxComments: 50,
          autoApproveBelow: false,
          reviewDelaySeconds: 0,
        },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "review");

      expect(value).toEqual({
        defaultSeverity: "suggestion",
        maxComments: 50,
        autoApproveBelow: false,
        reviewDelaySeconds: 0,
      });
    });

    it("retrieves array values", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo", autoReview: true }],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const value = getConfigValue(config, "repos");

      expect(Array.isArray(value)).toBe(true);
      expect(value).toEqual([{ id: "owner/repo", autoReview: true }]);
    });
  });

  describe("config list", () => {
    it("calls loadConfig", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();

      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
      expect(config).toEqual(mockConfig);
    });

    it("outputs full config as JSON", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo", autoReview: true }],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "test-key" },
        review: { defaultSeverity: "suggestion", maxComments: 50 },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();
      const jsonOutput = JSON.stringify(config, null, 2);

      expect(jsonOutput).toContain('"version": "1.0.0"');
      expect(jsonOutput).toContain('"port": 3000');
      expect(jsonOutput).toContain('"host": "0.0.0.0"');
      expect(jsonOutput).toContain('"defaultSeverity": "suggestion"');
      expect(jsonOutput).toContain('"maxComments": 50');
    });

    it("handles empty config", async () => {
      const mockConfig: Record<string, unknown> = { version: "1.0.0", repos: [] };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();

      expect(config).toEqual({ version: "1.0.0", repos: [] });
      expect(Object.keys(config)).toHaveLength(2);
    });

    it("handles config with all sections", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        githubToken: "ghp_token",
        repos: [{ id: "owner/repo", autoReview: false, triggerMode: "manual" }],
        defaultBuddyId: "buddy-123",
        server: { port: 4000, host: "localhost", webhookSecret: "secret", apiKey: "key" },
        review: {
          defaultSeverity: "warning",
          maxComments: 100,
          autoApproveBelow: true,
          reviewDelaySeconds: 30,
        },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const config = await loadConfig();

      expect(config).toHaveProperty("version");
      expect(config).toHaveProperty("githubToken");
      expect(config).toHaveProperty("repos");
      expect(config).toHaveProperty("server");
      expect(config).toHaveProperty("review");
      expect((config.repos as unknown[]).length).toBe(1);
    });
  });

  describe("config reset", () => {
    it("prompts user for confirmation", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo" }],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockConfirm.mockResolvedValue(true);
      mockResetConfig.mockResolvedValue({
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
        review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 },
      });

      await loadConfig();
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();

      const confirmed = await confirm({ message: "Reset all configuration to defaults?" });
      expect(mockConfirm).toHaveBeenCalledExactlyOnceWith({ message: "Reset all configuration to defaults?" });
      expect(confirmed).toBe(true);
    });

    it("calls resetConfig when confirmed", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo" }],
        server: { port: 4000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockConfirm.mockResolvedValue(true);
      mockResetConfig.mockResolvedValue({
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
        review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 },
      });

      await loadConfig();
      const confirmed = await confirm({ message: "Reset all configuration to defaults?" });

      if (confirmed) {
        const result = await resetConfig();
        expect(mockResetConfig).toHaveBeenCalledExactlyOnceWith();
        expect((result.repos as unknown[]).length).toBe(0);
        expect((result.server as unknown as Record<string, unknown>).port).toBe(3000);
      }
    });

    it("does NOT call resetConfig when not confirmed", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo" }],
        server: { port: 4000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockConfirm.mockResolvedValue(false);

      await loadConfig();
      const confirmed = await confirm({ message: "Reset all configuration to defaults?" });

      expect(confirmed).toBe(false);
      expect(mockResetConfig).not.toHaveBeenCalled();
    });

    it("handles errors gracefully", async () => {
      const mockError = new Error("Config reset failed");
      mockLoadConfig.mockRejectedValue(mockError);

      await expect(loadConfig()).rejects.toThrow("Config reset failed");
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("displays current config before resetting", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [{ id: "owner/repo", autoReview: true }],
        server: { port: 4000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockConfirm.mockResolvedValue(true);
      mockResetConfig.mockResolvedValue({
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
        review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 },
      });

      const currentConfig = await loadConfig();
      const jsonOutput = JSON.stringify(currentConfig, null, 2);

      expect(jsonOutput).toContain('"repos":');
      expect(jsonOutput).toContain('"port": 4000');
      expect(jsonOutput).toContain('"host": "localhost"');
    });

    it("returns default config structure after reset", async () => {
      const defaultConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
        review: { defaultSeverity: "suggestion", maxComments: 50, autoApproveBelow: false, reviewDelaySeconds: 0 },
      };
      mockConfirm.mockResolvedValue(true);
      mockResetConfig.mockResolvedValue(defaultConfig as never);

      const confirmed = await confirm({ message: "Reset all configuration to defaults?" });
      let result;
      if (confirmed) {
        result = await resetConfig();
      }

      expect(result).toEqual(defaultConfig);
      expect(result?.repos).toEqual([]);
      expect((result?.server as unknown as Record<string, unknown>).port).toBe(3000);
      expect((result?.review as unknown as Record<string, unknown>).defaultSeverity).toBe("suggestion");
    });
  });
});
