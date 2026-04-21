import { describe, it, expect } from "vitest";

describe("Core module exports", () => {
  it("GitHubClient is a constructor", async () => {
    const { GitHubClient } = await import("../github/client.js");
    expect(typeof GitHubClient).toBe("function");
  });

  it("AnalysisPipeline is a constructor", async () => {
    const { AnalysisPipeline } = await import("../analysis/pipeline.js");
    expect(typeof AnalysisPipeline).toBe("function");
  });

  it("ReviewEngine is a constructor", async () => {
    const { ReviewEngine } = await import("../review/engine.js");
    expect(typeof ReviewEngine).toBe("function");
  });

  it("AnthropicClaudeProvider is a constructor", async () => {
    const { AnthropicClaudeProvider } = await import("../llm/provider.js");
    expect(typeof AnthropicClaudeProvider).toBe("function");
  });

  it("BuddyFileSystemStorage is a constructor", async () => {
    const { BuddyFileSystemStorage } = await import("../buddy/storage.js");
    expect(typeof BuddyFileSystemStorage).toBe("function");
  });

  it("FileContextCache is a constructor", async () => {
    const { FileContextCache } = await import("../cache/file-cache.js");
    expect(typeof FileContextCache).toBe("function");
  });
});
