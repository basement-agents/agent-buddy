import type { LLMProvider } from "./types.js";
import type { LLMProviderConfig, LLMProviderType } from "../config/types.js";
import { AnthropicClaudeProvider } from "./provider.js";
import { OpenRouterProvider } from "./openrouter-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openrouter: "anthropic/claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

const ENV_KEYS: Record<LLMProviderType, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
};

export function createLLMProvider(config?: LLMProviderConfig): LLMProvider {
  const provider = config?.provider || "anthropic";
  const apiKey = config?.apiKey || process.env[ENV_KEYS[provider]] || "";

  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider}. Set ${ENV_KEYS[provider]} environment variable or configure in settings.`
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
      throw new Error(`Unknown LLM provider: ${provider}. Supported: anthropic, openrouter, openai`);
  }
}
