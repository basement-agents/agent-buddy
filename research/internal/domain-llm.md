# domain-llm

LLM provider abstraction for AI completions.

## Supported Providers

- `anthropic` - Anthropic Claude API
- `openrouter` - OpenRouter
- `openai` - OpenAI compatible

## Provider Interface

```typescript
interface LLMProvider {
  provider: string
  apiKey: string
  baseUrl?: string

  complete(prompt: string, options?: CompleteOptions): Promise<CompleteResult>
  completeStructured<T>(prompt: string, schema: z.ZodType, options?: CompleteOptions): Promise<T>
}

interface CompleteOptions {
  model?: string
  maxTokens?: number
  temperature?: number
  system?: string
}

interface CompleteResult {
  content: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  stopReason?: string
}
```

## Configuration

```typescript
interface LLMConfig {
  provider: "anthropic" | "openrouter" | "openai"
  apiKey: string
  baseUrl?: string          # OpenAI compatible only
  model?: string
  maxTokens?: number
  temperature?: number
}
```

## Factory

`LLMFactory.create(config: LLMConfig): LLMProvider`

Provider-specific:
- `anthropic`: Requires `sk-ant-...` key prefix
- `openrouter`: Requires `sk-or-...` key prefix
- `openai`: Requires `sk-...` key prefix

## Known Unknowns

- Rate limiting handling
- Cost tracking per provider
