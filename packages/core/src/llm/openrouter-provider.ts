import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, defaultModel = DEFAULT_MODEL, maxRetries?: number, timeoutMs?: number) {
    super(apiKey, defaultModel, "OpenRouter", maxRetries, timeoutMs);
  }

  protected get apiUrl(): string {
    return API_URL;
  }
}
