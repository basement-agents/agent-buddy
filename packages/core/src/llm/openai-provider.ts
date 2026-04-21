import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_BASE_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider extends OpenAICompatibleProvider {
  private baseUrl: string;

  constructor(apiKey: string, defaultModel = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, maxRetries?: number, timeoutMs?: number) {
    super(apiKey, defaultModel, "OpenAI", maxRetries, timeoutMs);
    this.baseUrl = baseUrl;
  }

  protected get apiUrl(): string {
    return this.baseUrl;
  }
}
