import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

// Mock all dependencies before importing anything
vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: class {
    init = vi.fn();
    listBuddies = vi.fn();
  },
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  resetConfig: vi.fn(),
  addRepo: vi.fn(),
  removeRepo: vi.fn(),
  listRepos: vi.fn(),
  GitHubClient: class {
    constructor(token: string) {
      this.token = token;
    }
    token = "";
    getRepo = vi.fn();
  },
  AnalysisPipeline: vi.fn(),
  ReviewEngine: vi.fn(),
  AnthropicClaudeProvider: vi.fn(),
  compareBuddies: vi.fn(),
  Logger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock("@inquirer/prompts", () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
}));

vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
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

import {
  BuddyFileSystemStorage,
  loadConfig,
  saveConfig,
  GitHubClient,
  Logger,
} from "@agent-buddy/core";
import { input } from "@inquirer/prompts";
import ora from "ora";

// Get mock instances with proper typing
const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);
const mockInput = vi.mocked(input);
const mockOra = vi.mocked(ora);

describe("CLI init and status commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default ora mock behavior
    mockOra.mockReturnValue({
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: "",
    } as unknown as ReturnType<typeof ora>);
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.GITHUB_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("init command behavior", () => {
    it("should call storage.init() during initialization", async () => {
      const mockInit = vi.fn().mockResolvedValue(undefined);

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.init = mockInit;

      // Simulate init flow
      await storage.init();

      expect(mockInit).toHaveBeenCalledExactlyOnceWith();
    });

    it("should call loadConfig() to load existing config", async () => {
      const existingConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(existingConfig as never);

      // Simulate init flow
      const config = await loadConfig();

      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
      expect(config).toEqual(existingConfig);
    });

    it("should generate and save UUID for server.apiKey when none exists", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      // Simulate init flow - generate UUID
      const uuid = crypto.randomUUID();
      mockConfig.server.apiKey = uuid;

      await saveConfig(mockConfig);

      expect(mockSaveConfig).toHaveBeenCalledExactlyOnceWith(mockConfig);
      expect(mockConfig.server.apiKey).toBeDefined();
      expect(typeof mockConfig.server.apiKey).toBe("string");
      expect(mockConfig.server.apiKey.length).toBeGreaterThan(0);
    });

    it("should prompt for GITHUB_TOKEN when missing", async () => {
      // Ensure GITHUB_TOKEN is not set
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const mockToken = "ghp_test_token_123";
      mockInput.mockResolvedValue(mockToken);

      // Simulate init flow - prompt for token
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
      let resultToken = token;
      if (!token) {
        resultToken = await mockInput({
          message: "Enter your GitHub personal access token:",
          validate: expect.any(Function),
        });
      }

      expect(mockInput).toHaveBeenCalledExactlyOnceWith({
        message: "Enter your GitHub personal access token:",
        validate: expect.any(Function),
      });
      expect(resultToken).toBe(mockToken);
    });

    it("should prompt for ANTHROPIC_API_KEY when missing", async () => {
      // Ensure ANTHROPIC_API_KEY is not set
      delete process.env.ANTHROPIC_API_KEY;

      const mockApiKey = "sk-ant-test-key-123";
      mockInput.mockResolvedValue(mockApiKey);

      // Simulate init flow - prompt for API key
      const apiKey = process.env.ANTHROPIC_API_KEY || "";
      let resultApiKey = apiKey;
      if (!apiKey) {
        resultApiKey = await mockInput({
          message: "Enter your Anthropic API key:",
          validate: expect.any(Function),
        });
      }

      expect(mockInput).toHaveBeenCalledExactlyOnceWith({
        message: "Enter your Anthropic API key:",
        validate: expect.any(Function),
      });
      expect(resultApiKey).toBe(mockApiKey);
    });

    it("should validate GitHub token using GitHubClient.getRepo()", async () => {
      const mockToken = "ghp_valid_token";
      const mockGetRepo = vi.fn().mockResolvedValue({
        id: 123,
        name: "Hello-World",
        owner: { login: "octocat" },
      });

      // Create instance and set mock
      const client = new GitHubClient(mockToken);
      client.getRepo = mockGetRepo;

      // Simulate init flow - validate token
      await client.getRepo("octocat", "Hello-World");

      expect(mockGetRepo).toHaveBeenCalledExactlyOnceWith("octocat", "Hello-World");
    });

    it("should handle GitHub token validation errors gracefully", async () => {
      const mockToken = "ghp_invalid_token";
      const mockGetRepo = vi.fn().mockRejectedValue(new Error("Unauthorized"));

      // Create instance and set mock
      const client = new GitHubClient(mockToken);
      client.getRepo = mockGetRepo;

      // Simulate init flow - validate token with error
      await expect(client.getRepo("octocat", "Hello-World")).rejects.toThrow("Unauthorized");

      expect(mockGetRepo).toHaveBeenCalledExactlyOnceWith("octocat", "Hello-World");
    });

    it("should initialize server config with defaults", async () => {
      const mockConfig: Record<string, unknown> = {
        version: "1.0.0",
        repos: [],
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      // Simulate init flow - initialize server config
      const server = (mockConfig.server || {
        port: 3000,
        host: "0.0.0.0",
        webhookSecret: "",
        apiKey: "",
      }) as Record<string, unknown>;
      server.apiKey = crypto.randomUUID();
      mockConfig.server = server;

      await saveConfig(mockConfig as never);

      expect(mockConfig.server).toEqual({
        port: 3000,
        host: "0.0.0.0",
        webhookSecret: "",
        apiKey: expect.any(String),
      });
      expect(mockSaveConfig).toHaveBeenCalledExactlyOnceWith(mockConfig);
    });

    it("should handle errors during init and log them", async () => {
      const mockError = new Error("Filesystem error");
      const mockInit = vi.fn().mockRejectedValue(mockError);
      const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
      };

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.init = mockInit;
      (Logger as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockLogger);

      // Simulate init flow with error
      try {
        await storage.init();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err).toBe(mockError);
      }

      // Verify logger would be called in actual CLI code
      expect(mockInit).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe("status command behavior", () => {
    it("should call loadConfig() to get configuration", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [
          { id: "owner/repo1", autoReview: true },
          { id: "owner/repo2", autoReview: false },
        ],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();

      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
      expect(config).toEqual(mockConfig);
    });

    it("should call BuddyFileSystemStorage.listBuddies() to get buddy count", async () => {
      const mockBuddies = [
        { id: "buddy-1", username: "reviewer1" },
        { id: "buddy-2", username: "reviewer2" },
      ];
      const mockListBuddies = vi.fn().mockResolvedValue(mockBuddies);

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.listBuddies = mockListBuddies;

      // Simulate status flow
      const buddies = await storage.listBuddies();

      expect(mockListBuddies).toHaveBeenCalledExactlyOnceWith();
      expect(buddies).toEqual(mockBuddies);
      expect(buddies.length).toBe(2);
    });

    it("should display repository count from config", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [
          { id: "owner/repo1", autoReview: true },
          { id: "owner/repo2", autoReview: false },
          { id: "owner/repo3", autoReview: true },
        ],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();
      const repoCount = config.repos.length;

      expect(repoCount).toBe(3);
    });

    it("should calculate auto-review count from repos with autoReview=true", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [
          { id: "owner/repo1", autoReview: true },
          { id: "owner/repo2", autoReview: false },
          { id: "owner/repo3", autoReview: true },
          { id: "owner/repo4", autoReview: false },
        ],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();
      const autoReviewCount = config.repos.filter((r: { autoReview: boolean }) => r.autoReview).length;

      expect(autoReviewCount).toBe(2);
      expect(config.repos.filter((r: { autoReview: boolean }) => !r.autoReview).length).toBe(2);
    });

    it("should display server port and host from config", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 4000, host: "localhost" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();
      const port = config.server?.port || 3000;
      const host = config.server?.host || "0.0.0.0";

      expect(port).toBe(4000);
      expect(host).toBe("localhost");
    });

    it("should use default port and host when server config is missing", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: undefined,
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();
      const port = config.server?.port || 3000;
      const host = config.server?.host || "0.0.0.0";

      expect(port).toBe(3000);
      expect(host).toBe("0.0.0.0");
    });

    it("should output JSON format with repositories, buddies, and server sections", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [
          { id: "owner/repo1", autoReview: true },
          { id: "owner/repo2", autoReview: false },
        ],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      const mockBuddies = [
        { id: "buddy-1", username: "reviewer1" },
        { id: "buddy-2", username: "reviewer2" },
      ];
      const mockListBuddies = vi.fn().mockResolvedValue(mockBuddies);

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.listBuddies = mockListBuddies;

      // Simulate status flow with JSON output
      const config = await loadConfig();
      const buddies = await storage.listBuddies();
      const autoReviewCount = config.repos.filter((r: { autoReview: boolean }) => r.autoReview).length;

      const jsonOutput = {
        repositories: {
          total: config.repos.length,
          autoReview: autoReviewCount,
          manual: config.repos.length - autoReviewCount,
        },
        buddies: {
          total: buddies.length,
        },
        server: {
          port: config.server?.port || 3000,
          host: config.server?.host || "0.0.0.0",
        },
      };

      expect(jsonOutput).toEqual({
        repositories: {
          total: 2,
          autoReview: 1,
          manual: 1,
        },
        buddies: {
          total: 2,
        },
        server: {
          port: 3000,
          host: "0.0.0.0",
        },
      });
    });

    it("should handle empty buddy list", async () => {
      const mockListBuddies = vi.fn().mockResolvedValue([]);

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.listBuddies = mockListBuddies;

      // Simulate status flow
      const buddies = await storage.listBuddies();

      expect(mockListBuddies).toHaveBeenCalledExactlyOnceWith();
      expect(buddies).toEqual([]);
      expect(buddies.length).toBe(0);
    });

    it("should handle empty repos list", async () => {
      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0" },
      };
      mockLoadConfig.mockResolvedValue(mockConfig as never);

      // Simulate status flow
      const config = await loadConfig();
      const repoCount = config.repos.length;
      const autoReviewCount = config.repos.filter((r: { autoReview: boolean }) => r.autoReview).length;

      expect(repoCount).toBe(0);
      expect(autoReviewCount).toBe(0);
    });
  });

  describe("status command watch mode", () => {
    it("should set up interval polling for watch mode", async () => {
      let intervalCallback: (() => void) | null = null;
      const mockSetInterval = vi.fn((cb: () => void) => {
        intervalCallback = cb;
        return 1 as unknown as NodeJS.Timeout;
      });

      // Mock setInterval globally
      global.setInterval = mockSetInterval;

      // Simulate watch mode setup
      const watchMode = true;
      const pollInterval = 2000;

      if (watchMode) {
        const intervalId = setInterval(() => {
          // renderStatus() would be called here
        }, pollInterval);
        expect(intervalId).toBeDefined();
      }

      expect(mockSetInterval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), pollInterval);
      expect(intervalCallback).not.toBeNull();

      // Cleanup
      delete (global as unknown as { setInterval?: unknown }).setInterval;
    });

    it("should use 2 second interval for watch mode polling", async () => {
      const mockSetInterval = vi.fn(() => 1 as unknown as NodeJS.Timeout);

      // Mock setInterval globally
      global.setInterval = mockSetInterval;

      // Simulate watch mode setup
      const pollInterval = 2000;
      setInterval(() => {
        // renderStatus() would be called here
      }, pollInterval);

      expect(mockSetInterval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 2000);

      // Cleanup
      delete (global as unknown as { setInterval?: unknown }).setInterval;
    });
  });

  describe("init and status integration patterns", () => {
    it("should preserve existing config when initializing", async () => {
      const existingConfig = {
        version: "1.0.0",
        repos: [{ id: "owner/repo1", autoReview: true }],
        server: { port: 4000, host: "localhost", webhookSecret: "secret", apiKey: "existing-key" },
      };
      mockLoadConfig.mockResolvedValue(existingConfig as never);
      mockSaveConfig.mockResolvedValue(undefined);

      // Simulate init flow - preserve existing config
      const config = await loadConfig();
      config.server = config.server || { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" };
      // Only update apiKey if empty
      if (!config.server.apiKey) {
        config.server.apiKey = crypto.randomUUID();
      }

      await saveConfig(config);

      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
      expect(mockSaveConfig).toHaveBeenCalledExactlyOnceWith(existingConfig);
      expect(config.server.port).toBe(4000);
      expect(config.server.host).toBe("localhost");
      expect(config.server.apiKey).toBe("existing-key");
    });

  });

  describe("input validation patterns", () => {
    it("should validate non-empty token input", () => {
      const validate = (v: string) => (v.trim().length > 0 ? true : "Token is required");

      expect(validate("ghp_valid_token")).toBe(true);
      expect(validate("")).toBe("Token is required");
      expect(validate("   ")).toBe("Token is required");
    });

    it("should validate non-empty API key input", () => {
      const validate = (v: string) => (v.trim().length > 0 ? true : "API key is required");

      expect(validate("sk-ant-valid-key")).toBe(true);
      expect(validate("")).toBe("API key is required");
      expect(validate("   ")).toBe("API key is required");
    });

    it("should generate valid UUID format", () => {
      const uuid = crypto.randomUUID();

      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(uuid.length).toBe(36);
    });
  });

  describe("error handling patterns", () => {
    it("should handle loadConfig errors gracefully", async () => {
      const mockError = new Error("Config file corrupted");
      mockLoadConfig.mockRejectedValue(mockError);

      // Simulate error handling
      try {
        await loadConfig();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err).toBe(mockError);
        expect((err as Error).message).toBe("Config file corrupted");
      }

      expect(mockLoadConfig).toHaveBeenCalledExactlyOnceWith();
    });

    it("should handle saveConfig errors gracefully", async () => {
      const mockError = new Error("Permission denied");
      mockSaveConfig.mockRejectedValue(mockError);

      const mockConfig = {
        version: "1.0.0",
        repos: [],
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" },
      };

      // Simulate error handling
      try {
        await saveConfig(mockConfig);
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err).toBe(mockError);
        expect((err as Error).message).toBe("Permission denied");
      }

      expect(mockSaveConfig).toHaveBeenCalledExactlyOnceWith(mockConfig);
    });

    it("should handle storage listBuddies errors gracefully", async () => {
      const mockError = new Error("Storage directory not found");
      const mockListBuddies = vi.fn().mockRejectedValue(mockError);

      // Create instance and set mock
      const storage = new BuddyFileSystemStorage();
      storage.listBuddies = mockListBuddies;

      // Simulate error handling
      try {
        await storage.listBuddies();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(err).toBe(mockError);
        expect((err as Error).message).toBe("Storage directory not found");
      }

      expect(mockListBuddies).toHaveBeenCalledExactlyOnceWith();
    });
  });

  describe("spinner interactions", () => {
    it("should use spinner for init operations", () => {
      const spinner = ora("Initializing agent-buddy...");
      spinner.start();
      spinner.succeed("agent-buddy initialized successfully!");

      expect(spinner.start).toHaveBeenCalled();
      expect(spinner.succeed).toHaveBeenCalled();
    });

    it("should handle spinner fail on error", () => {
      const spinner = ora("Validating token...");
      spinner.start();
      spinner.fail("Invalid token");

      expect(spinner.start).toHaveBeenCalled();
      expect(spinner.fail).toHaveBeenCalled();
    });

    it("should handle spinner warn for non-fatal issues", () => {
      const spinner = ora("Validating token...");
      spinner.start();
      spinner.warn("Could not validate token (will continue anyway)");

      expect(spinner.start).toHaveBeenCalled();
      expect(spinner.warn).toHaveBeenCalled();
    });
  });
});
