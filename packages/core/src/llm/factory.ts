import type { LLMProvider } from "./types.js";
import type { LLMProviderConfig, LLMProviderType } from "../config/types.js";
import { AnthropicClaudeProvider } from "./provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { CliProvider } from "./cli-provider.js";

const DEFAULT_MODELS: Record<Exclude<LLMProviderType, "cli">, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "anthropic/claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

const ENV_KEYS: Record<Exclude<LLMProviderType, "cli">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
};

const KEY_PREFIXES: Record<Exclude<LLMProviderType, "cli">, string> = {
  anthropic: "sk-ant-",
  openrouter: "sk-or-",
  openai: "sk-",
};

export function createLLMProvider(config?: LLMProviderConfig): LLMProvider {
  const provider = config?.provider || "anthropic";

  if (provider === "cli") {
    if (!config?.command) {
      throw new Error("CLI provider requires 'command' to be set in llm.command");
    }
    return new CliProvider({
      command: config.command,
      args: config.args,
      interactiveShell: config.interactiveShell,
      parseFormat: config.parseFormat,
      responsePath: config.responsePath,
      usageInputPath: config.usageInputPath,
      usageOutputPath: config.usageOutputPath,
      modelPath: config.modelPath,
      defaultModel: config.defaultModel,
      timeoutMs: config.timeoutMs,
    });
  }

  const apiKey = config?.apiKey || process.env[ENV_KEYS[provider]] || "";
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider}. Set ${ENV_KEYS[provider]} environment variable or configure in settings.`
    );
  }

  if (!apiKey.startsWith(KEY_PREFIXES[provider])) {
    throw new Error(
      `Invalid ${provider} API key format. Expected '${KEY_PREFIXES[provider]}' prefix.`
    );
  }

  const defaultModel = config?.defaultModel || DEFAULT_MODELS[provider];

  switch (provider) {
    case "openrouter":
      return new OpenRouterProvider(apiKey, defaultModel);
    case "openai":
      return new OpenAIProvider(apiKey, defaultModel, config?.baseUrl);
    case "anthropic":
      return new AnthropicClaudeProvider(apiKey, defaultModel);
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Supported: anthropic, openrouter, openai, cli`);
  }
}
