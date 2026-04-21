import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
import { promises as fs } from "node:fs";

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    repos: [],
    server: { port: 3000, host: "0.0.0.0" },
  }),
  BuddyFileSystemStorage: class {
    init = vi.fn().mockResolvedValue(undefined);
    listBuddies = vi.fn().mockResolvedValue([]);
  },
  createLLMProvider: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue({ content: "pong", usage: { inputTokens: 1, outputTokens: 1 } }),
  }),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

describe("Doctor Command", () => {
  let program: Command;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    global.fetch = vi.fn();

    program = new Command();
    const { registerDoctorCommand } = await import("../commands/doctor.js");
    registerDoctorCommand(program);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("doctor command is registered", () => {
    const cmd = program.commands.find((c) => c.name() === "doctor");
    expect(cmd).toBeDefined();
  });

  it("reports missing GITHUB_TOKEN", async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;

    let output = "";
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation((msg) => { output += msg + "\n"; });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(output).toContain("GITHUB_TOKEN");
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("reports missing ANTHROPIC_API_KEY", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    delete process.env.ANTHROPIC_API_KEY;

    let output = "";
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation((msg) => { output += msg + "\n"; });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(output).toContain("ANTHROPIC_API_KEY");
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("reports success when all checks pass", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok" }),
    } as Response);

    vi.spyOn(fs, "access").mockResolvedValue(undefined);

    let output = "";
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation((msg) => { output += msg + "\n"; });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(output).toContain("GITHUB_TOKEN");
    expect(output).toContain("LLM Provider");
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("reports server connectivity failure", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    process.env.ANTHROPIC_API_KEY = "test-key";

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));

    vi.spyOn(fs, "access").mockResolvedValue(undefined);

    let output = "";
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation((msg) => { output += msg + "\n"; });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await program.parseAsync(["node", "test", "doctor"]);

    expect(output).toContain("Server");
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
