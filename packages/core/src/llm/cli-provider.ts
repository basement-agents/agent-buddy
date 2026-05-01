import { spawn } from "node:child_process";
import type { LLMMessage, LLMOptions, LLMProvider, LLMResponse } from "./types.js";
import { Logger, getErrorMessage } from "../utils/index.js";

const DEFAULT_TIMEOUT_MS = 300_000;

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export type CliParseFormat = "single-json" | "jsonl-opencode" | "jsonl-codex";

export interface CliProviderOptions {
  command: string;
  args?: string[];
  interactiveShell?: boolean;
  parseFormat?: CliParseFormat;
  responsePath?: string;
  usageInputPath?: string;
  usageOutputPath?: string;
  modelPath?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class CliProvider implements LLMProvider {
  private command: string;
  private args: string[];
  private interactiveShell: boolean;
  private parseFormat: CliParseFormat;
  private responsePath?: string;
  private usageInputPath?: string;
  private usageOutputPath?: string;
  private modelPath?: string;
  private defaultModel: string;
  private timeoutMs: number;
  private logger: Logger;

  constructor(opts: CliProviderOptions) {
    this.command = opts.command;
    this.args = opts.args ?? [];
    this.interactiveShell = opts.interactiveShell ?? false;
    this.parseFormat = opts.parseFormat ?? "single-json";
    this.responsePath = opts.responsePath;
    this.usageInputPath = opts.usageInputPath;
    this.usageOutputPath = opts.usageOutputPath;
    this.modelPath = opts.modelPath;
    this.defaultModel = opts.defaultModel ?? opts.command;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = new Logger("cli-provider");
  }

  async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
    const prompt = this.formatPrompt(messages, options);
    const stdout = await this.execCli(prompt);
    return this.parseOutput(stdout);
  }

  async generateStructured<T>(
    messages: LLMMessage[],
    options: LLMOptions = {},
  ): Promise<{ content: T; usage: LLMResponse["usage"]; model: string }> {
    const enhanced: LLMMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "You must respond with valid JSON only. No markdown, no code fences, no explanation - just the raw JSON object.",
      },
    ];
    const response = await this.generate(enhanced, options);
    let parsed: T;
    try {
      let jsonStr = response.content.trim();
      const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (fenceMatch) jsonStr = fenceMatch[1].trim();
      parsed = JSON.parse(jsonStr) as T;
    } catch (err) {
      const snippet = response.content.slice(0, 500);
      this.logger.error("Failed to parse structured response as JSON", {
        error: getErrorMessage(err),
        snippet,
      });
      throw new Error(
        `Failed to parse CLI structured response as JSON: ${getErrorMessage(err)}. Response: ${snippet}`,
      );
    }
    return { content: parsed, usage: response.usage, model: response.model };
  }

  private formatPrompt(messages: LLMMessage[], options: LLMOptions): string {
    const system = messages.find((m) => m.role === "system")?.content || options.systemPrompt;
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => (m.role === "assistant" ? `[assistant]\n${m.content}` : m.content))
      .join("\n\n");
    return system ? `${system}\n\n${rest}` : rest;
  }

  private spawnChild(): ReturnType<typeof spawn> {
    if (this.interactiveShell) {
      const shell = process.env.SHELL || "/bin/zsh";
      const fullCmd = [this.command, ...this.args].map(shellQuote).join(" ");
      return spawn(shell, ["-i", "-c", fullCmd], { stdio: ["pipe", "pipe", "pipe"] });
    }
    return spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });
  }

  private execCli(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.spawnChild();
      const label = this.interactiveShell
        ? `${process.env.SHELL || "shell"} -ic '${this.command} ...'`
        : this.command;
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000);
        reject(new Error(`CLI '${label}' timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn '${label}': ${err.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const trimmedErr = stderr.slice(0, 500).trim();
          reject(
            new Error(
              `CLI '${label}' exited with code ${code}${trimmedErr ? `: ${trimmedErr}` : ""}`,
            ),
          );
          return;
        }
        resolve(stdout);
      });
      try {
        child.stdin?.write(prompt);
        child.stdin?.end();
      } catch (err) {
        clearTimeout(timer);
        reject(new Error(`Failed to write prompt to '${label}' stdin: ${getErrorMessage(err)}`));
      }
    });
  }

  private parseOutput(stdout: string): LLMResponse {
    if (this.parseFormat === "jsonl-opencode") return this.parseOpencodeJsonl(stdout);
    if (this.parseFormat === "jsonl-codex") return this.parseCodexJsonl(stdout);
    if (!this.responsePath) {
      return {
        content: stdout.trim(),
        usage: { inputTokens: 0, outputTokens: 0 },
        model: this.defaultModel,
      };
    }
    let json: JsonValue;
    try {
      json = JSON.parse(stdout) as JsonValue;
    } catch (err) {
      const snippet = stdout.slice(0, 500);
      throw new Error(`CLI output not valid JSON: ${getErrorMessage(err)}. Output: ${snippet}`);
    }
    const content = String(this.getPath(json, this.responsePath) ?? "");
    const inputTokens = this.usageInputPath
      ? Number(this.getPath(json, this.usageInputPath)) || 0
      : 0;
    const outputTokens = this.usageOutputPath
      ? Number(this.getPath(json, this.usageOutputPath)) || 0
      : 0;
    const model = this.modelPath
      ? String(this.getPath(json, this.modelPath) ?? this.defaultModel)
      : this.defaultModel;
    return { content, usage: { inputTokens, outputTokens }, model };
  }

  private parseJsonlEvents(stdout: string): JsonValue[] {
    const events: JsonValue[] = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as JsonValue);
      } catch {
        // skip malformed lines
      }
    }
    return events;
  }

  private parseOpencodeJsonl(stdout: string): LLMResponse {
    const events = this.parseJsonlEvents(stdout);
    const textParts: string[] = [];
    let model: string | undefined;
    for (const evt of events) {
      if (!isJsonObject(evt)) continue;
      if (evt.type === "text") {
        const part = evt.part;
        if (isJsonObject(part) && typeof part.text === "string") {
          textParts.push(part.text);
        }
      }
      if (evt.type === "message.updated") {
        const props = evt.properties;
        if (isJsonObject(props)) {
          const info = props.info;
          if (isJsonObject(info) && typeof info.modelID === "string") {
            model = info.modelID;
          }
        }
      }
    }
    return {
      content: textParts.join(""),
      usage: { inputTokens: 0, outputTokens: 0 },
      model: model ?? this.defaultModel,
    };
  }

  private parseCodexJsonl(stdout: string): LLMResponse {
    const events = this.parseJsonlEvents(stdout);
    let content = "";
    let inputTokens = 0;
    let outputTokens = 0;
    for (const evt of events) {
      if (!isJsonObject(evt)) continue;
      if (evt.type === "item.completed") {
        const item = evt.item;
        if (isJsonObject(item) && item.type === "agent_message" && typeof item.text === "string") {
          content = item.text;
        }
      }
      if (evt.type === "turn.completed") {
        const usage = evt.usage;
        if (isJsonObject(usage)) {
          inputTokens = Number(usage.input_tokens) || 0;
          outputTokens = Number(usage.output_tokens) || 0;
        }
      }
    }
    return {
      content,
      usage: { inputTokens, outputTokens },
      model: this.defaultModel,
    };
  }

  private getPath(obj: JsonValue, path: string): JsonValue | undefined {
    const keys = path.split(".");
    let current: JsonValue | undefined = obj;
    for (const key of keys) {
      if (!isJsonObject(current)) return undefined;
      current = current[key];
    }
    return current;
  }
}
