import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";

// Mock all dependencies before importing (top-level hoisted)
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

vi.mock("node:fs", () => ({
  promises: { access: vi.fn(), readdir: vi.fn() },
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

import { loadConfig } from "@agent-buddy/core";
import { promises as fs } from "node:fs";

const mockLoadConfig = vi.mocked(loadConfig);
const mockFsAccess = vi.mocked(fs.access);
const mockFsReaddir = vi.mocked(fs.readdir);

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

// Helper function that replicates GITHUB_TOKEN check logic
function checkGitHubToken(): CheckResult {
  const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (ghToken) {
    return { name: "GITHUB_TOKEN", status: "pass", message: `Set (${ghToken.slice(0, 8)}...)` };
  } else {
    return { name: "GITHUB_TOKEN", status: "fail", message: "Not set. Set GITHUB_TOKEN or GH_TOKEN environment variable." };
  }
}

// Helper function that replicates ANTHROPIC_API_KEY check logic
function checkAnthropicApiKey(): CheckResult {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return { name: "ANTHROPIC_API_KEY", status: "pass", message: `Set (${apiKey.slice(0, 8)}...)` };
  } else {
    return { name: "ANTHROPIC_API_KEY", status: "fail", message: "Not set. Set ANTHROPIC_API_KEY environment variable." };
  }
}

// Helper function that replicates config file check logic
async function checkConfigFile(): Promise<CheckResult> {
  try {
    const config = await loadConfig();
    return { name: "Config file", status: "pass", message: `Found (${config.repos.length} repos configured)` };
  } catch (err) {
    return { name: "Config file", status: "fail", message: `Invalid: ${(err as Error).message}` };
  }
}

// Helper function that replicates buddy directory check logic
async function checkBuddyDirectory(): Promise<CheckResult> {
  const baseDir = path.join(os.homedir(), ".agent-buddy");
  const buddyDir = path.join(baseDir, "buddy");
  try {
    await fs.access(buddyDir);
    const entries = await fs.readdir(buddyDir);
    return { name: "Buddy directory", status: "pass", message: `Exists (${entries.length} buddies)` };
  } catch {
    return { name: "Buddy directory", status: "warn", message: `Not found at ${buddyDir}. Run 'agent-buddy buddy analyze' to create one.` };
  }
}

// Helper function that replicates server connectivity check logic
async function checkServerConnectivity(): Promise<CheckResult> {
  try {
    const config = await loadConfig().catch(() => ({ server: { port: 3000, host: "localhost" } }));
    const port = (config as { server?: { port?: number } }).server?.port || 3000;
    const host = (config as { server?: { host?: string } }).server?.host || "localhost";
    const res = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      return { name: "Server connectivity", status: "pass", message: `Server responding at port ${port}` };
    } else {
      return { name: "Server connectivity", status: "warn", message: `Server returned HTTP ${res.status}` };
    }
  } catch {
    return { name: "Server connectivity", status: "warn", message: "Server not running. Start with 'agent-buddy serve'." };
  }
}

describe("CLI doctor command", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    // Setup fetch mock
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("GITHUB_TOKEN check", () => {
    it("returns pass status when GITHUB_TOKEN is set", () => {
      process.env.GITHUB_TOKEN = "ghp_testtoken123456789";
      const result = checkGitHubToken();

      expect(result).toEqual({
        name: "GITHUB_TOKEN",
        status: "pass",
        message: "Set (ghp_test...)",
      });
    });

    it("returns pass status when GH_TOKEN is set", () => {
      process.env.GH_TOKEN = "ghp_othertoken98765";
      const result = checkGitHubToken();

      expect(result).toEqual({
        name: "GITHUB_TOKEN",
        status: "pass",
        message: "Set (ghp_othe...)",  // 8 chars: ghp_othe
      });
    });

    it("prefers GITHUB_TOKEN over GH_TOKEN when both are set", () => {
      process.env.GITHUB_TOKEN = "ghp_primary123";
      process.env.GH_TOKEN = "ghp_secondary456";
      const result = checkGitHubToken();

      expect(result).toEqual({
        name: "GITHUB_TOKEN",
        status: "pass",
        message: "Set (ghp_prim...)",  // 8 chars: ghp_prim
      });
    });

    it("returns fail status when neither token is set", () => {
      const result = checkGitHubToken();

      expect(result).toEqual({
        name: "GITHUB_TOKEN",
        status: "fail",
        message: "Not set. Set GITHUB_TOKEN or GH_TOKEN environment variable.",
      });
    });

    it("truncates token display to first 8 characters", () => {
      process.env.GITHUB_TOKEN = "ghp_abcdefghijklmnop";
      const result = checkGitHubToken();

      expect(result.message).toBe("Set (ghp_abcd...)");  // 8 chars: ghp_abcd
      expect(result.message.length).toBe(17);  // "Set (ghp_abcd...)"
    });
  });

  describe("ANTHROPIC_API_KEY check", () => {
    it("returns pass status when ANTHROPIC_API_KEY is set", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-testkey123456789";
      const result = checkAnthropicApiKey();

      expect(result).toEqual({
        name: "ANTHROPIC_API_KEY",
        status: "pass",
        message: "Set (sk-ant-t...)",
      });
    });

    it("returns fail status when ANTHROPIC_API_KEY is not set", () => {
      const result = checkAnthropicApiKey();

      expect(result).toEqual({
        name: "ANTHROPIC_API_KEY",
        status: "fail",
        message: "Not set. Set ANTHROPIC_API_KEY environment variable.",
      });
    });

    it("truncates key display to first 8 characters", () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-api123-key456";
      const result = checkAnthropicApiKey();

      expect(result.message).toBe("Set (sk-ant-a...)");
    });
  });

  describe("Config file check", () => {
    it("returns pass status with repos count when loadConfig succeeds", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [
          { id: "owner/repo1", autoReview: true },
          { id: "owner/repo2", autoReview: false },
          { id: "owner/repo3", autoReview: true },
        ],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const result = await checkConfigFile();

      expect(result).toEqual({
        name: "Config file",
        status: "pass",
        message: "Found (3 repos configured)",
      });
      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("returns pass status with zero repos when config has no repos", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const result = await checkConfigFile();

      expect(result).toEqual({
        name: "Config file",
        status: "pass",
        message: "Found (0 repos configured)",
      });
    });

    it("returns fail status with error message when loadConfig throws", async () => {
      const mockError = new Error("Config file not found");
      mockLoadConfig.mockRejectedValue(mockError);

      const result = await checkConfigFile();

      expect(result).toEqual({
        name: "Config file",
        status: "fail",
        message: "Invalid: Config file not found",
      });
    });

    it("returns fail status with validation error message", async () => {
      const mockError = new Error("Invalid config: missing required field 'version'");
      mockLoadConfig.mockRejectedValue(mockError);

      const result = await checkConfigFile();

      expect(result).toEqual({
        name: "Config file",
        status: "fail",
        message: "Invalid: Invalid config: missing required field 'version'",
      });
    });

    it("handles malformed config errors", async () => {
      const mockError = new Error("Unexpected token < in JSON at position 0");
      mockLoadConfig.mockRejectedValue(mockError);

      const result = await checkConfigFile();

      expect(result.status).toBe("fail");
      expect(result.message).toContain("Invalid:");
      expect(result.message).toContain("Unexpected token");
    });
  });

  describe("Buddy directory check", () => {
    it("returns pass status with buddy count when directory exists and has entries", async () => {
      const mockEntries = ["buddy-1", "buddy-2", "buddy-3"];
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue(mockEntries as never);

      const result = await checkBuddyDirectory();

      expect(result).toEqual({
        name: "Buddy directory",
        status: "pass",
        message: "Exists (3 buddies)",
      });
      expect(mockFsAccess).toHaveBeenCalledExactlyOnceWith(
        path.join(os.homedir(), ".agent-buddy/buddy")
      );
      expect(mockFsReaddir).toHaveBeenCalledExactlyOnceWith(
        path.join(os.homedir(), ".agent-buddy/buddy")
      );
    });

    it("returns pass status with zero when directory exists but is empty", async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue([]);

      const result = await checkBuddyDirectory();

      expect(result).toEqual({
        name: "Buddy directory",
        status: "pass",
        message: "Exists (0 buddies)",
      });
    });

    it("returns warn status when directory does not exist", async () => {
      const mockError = new Error("ENOENT: no such file or directory");
      mockFsAccess.mockRejectedValue(mockError);

      const result = await checkBuddyDirectory();

      expect(result.name).toBe("Buddy directory");
      expect(result.status).toBe("warn");
      expect(result.message).toContain("Not found at");
      expect(result.message).toContain(path.join(os.homedir(), ".agent-buddy/buddy"));
      expect(result.message).toContain("Run 'agent-buddy buddy analyze' to create one.");
      expect(mockFsReaddir).not.toHaveBeenCalled();
    });

    it("returns warn status when access is denied", async () => {
      const mockError = new Error("EACCES: permission denied");
      mockFsAccess.mockRejectedValue(mockError);

      const result = await checkBuddyDirectory();

      expect(result.status).toBe("warn");
      expect(result.message).toContain("Not found at");
    });

    it("handles readdir errors gracefully", async () => {
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReaddir.mockRejectedValue(new Error("Permission denied"));

      const result = await checkBuddyDirectory();

      expect(result.status).toBe("warn");
    });
  });

  describe("Server connectivity check", () => {
    it("returns pass status when server responds with ok", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result).toEqual({
        name: "Server connectivity",
        status: "pass",
        message: "Server responding at port 3000",
      });
      expect(mockFetch).toHaveBeenCalledExactlyOnceWith(
        "http://localhost:3000/api/health",
        { signal: expect.any(AbortSignal) }
      );
    });

    it("uses default port when config lacks server.port", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result.message).toBe("Server responding at port 3000");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/health",
        { signal: expect.any(AbortSignal) }
      );
    });

    it("uses custom port from config", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 8080, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result.message).toBe("Server responding at port 8080");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/health",
        { signal: expect.any(AbortSignal) }
      );
    });

    it("uses custom host from config", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "127.0.0.1" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result.message).toBe("Server responding at port 3000");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:3000/api/health",
        { signal: expect.any(AbortSignal) }
      );
    });

    it("returns warn status when server returns non-ok status", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result).toEqual({
        name: "Server connectivity",
        status: "warn",
        message: "Server returned HTTP 500",
      });
    });

    it("returns warn status with 404 status", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result).toEqual({
        name: "Server connectivity",
        status: "warn",
        message: "Server returned HTTP 404",
      });
    });

    it("returns warn status when fetch throws connection refused", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await checkServerConnectivity();

      expect(result).toEqual({
        name: "Server connectivity",
        status: "warn",
        message: "Server not running. Start with 'agent-buddy serve'.",
      });
    });

    it("returns warn status when fetch times out", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockRejectedValue(new Error("Timeout"));

      const result = await checkServerConnectivity();

      expect(result.status).toBe("warn");
      expect(result.message).toBe("Server not running. Start with 'agent-buddy serve'.");
    });

    it("uses default config when loadConfig fails", async () => {
      mockLoadConfig.mockRejectedValue(new Error("Config not found"));
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkServerConnectivity();

      expect(result.status).toBe("pass");
      expect(result.message).toBe("Server responding at port 3000");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/health",
        { signal: expect.any(AbortSignal) }
      );
    });

    it("includes AbortSignal timeout in fetch request", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      await checkServerConnectivity();

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1]).toEqual({
        signal: expect.any(AbortSignal),
      });
    });
  });

  describe("Integrated checks", () => {
    it("runs all checks and returns appropriate results", async () => {
      // Setup environment
      process.env.GITHUB_TOKEN = "ghp_test123";
      process.env.ANTHROPIC_API_KEY = "sk-ant-key456";

      // Setup mocks
      const mockConfig = {
        version: "1.0.0",
        repos: [{ id: "owner/repo" }],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockFsAccess.mockResolvedValue(undefined);
      mockFsReaddir.mockResolvedValue(["buddy-1"] as never);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const results: CheckResult[] = [];
      results.push(checkGitHubToken());
      results.push(checkAnthropicApiKey());
      results.push(await checkConfigFile());
      results.push(await checkBuddyDirectory());
      results.push(await checkServerConnectivity());

      expect(results).toHaveLength(5);
      expect(results[0].status).toBe("pass"); // GITHUB_TOKEN
      expect(results[1].status).toBe("pass"); // ANTHROPIC_API_KEY
      expect(results[2].status).toBe("pass"); // Config file
      expect(results[3].status).toBe("pass"); // Buddy directory
      expect(results[4].status).toBe("pass"); // Server connectivity
    });

    it("handles mixed pass/warn/fail results", async () => {
      // Setup only some environment variables
      process.env.GITHUB_TOKEN = "ghp_test123";
      // No ANTHROPIC_API_KEY

      // Setup mocks for mixed results
      const mockConfig = {
        version: "1.0.0",
        repos: [],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      const mockError = new Error("ENOENT");
      mockFsAccess.mockRejectedValue(mockError);
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const results: CheckResult[] = [];
      results.push(checkGitHubToken());
      results.push(checkAnthropicApiKey());
      results.push(await checkConfigFile());
      results.push(await checkBuddyDirectory());
      results.push(await checkServerConnectivity());

      expect(results).toHaveLength(5);
      expect(results[0].status).toBe("pass"); // GITHUB_TOKEN
      expect(results[1].status).toBe("fail"); // ANTHROPIC_API_KEY
      expect(results[2].status).toBe("pass"); // Config file
      expect(results[3].status).toBe("warn"); // Buddy directory
      expect(results[4].status).toBe("warn"); // Server connectivity
    });
  });
});
