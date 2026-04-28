import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentBuddyConfig, RepoConfig } from "./types.js";
import { configSchema } from "./schema.js";
import { ConfigError, BASE_DIR, Logger } from "../utils/index.js";

const logger = new Logger("config");

const CONFIG_PATH = path.join(BASE_DIR, "config.json");

let cachedConfig: AgentBuddyConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;

const DEFAULT_CONFIG: AgentBuddyConfig = {
  version: "1.0.0",
  repos: [],
  server: {
    port: 3000,
    host: "0.0.0.0",
    webhookSecret: "",
    apiKey: "",
  },
  review: {
    defaultSeverity: "suggestion",
    maxComments: 50,
    autoApproveBelow: false,
    reviewDelaySeconds: 0,
  },
};

export async function loadConfig(): Promise<AgentBuddyConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const result = configSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new ConfigError(`Invalid configuration:\n${errors}`);
    }
    const config = { ...DEFAULT_CONFIG, ...result.data };
    if (!config.githubToken) {
      config.githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    }
    cachedConfig = config;
    cachedAt = now;
    return config;
  } catch (err) {
    if (err instanceof ConfigError) {
      throw err;
    }
    if (err instanceof SyntaxError) {
      logger.warn("Config file has invalid JSON, using defaults");
    }
    const config = { ...DEFAULT_CONFIG };
    config.githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    cachedConfig = config;
    cachedAt = now;
    return config;
  }
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

export async function saveConfig(config: AgentBuddyConfig): Promise<void> {
  await fs.mkdir(BASE_DIR, { recursive: true });
  config.version = "1.0.0";
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  invalidateConfigCache();
}

export async function addRepo(
  owner: string,
  repo: string,
  buddyId?: string
): Promise<RepoConfig> {
  const config = await loadConfig();
  const id = `${owner}/${repo}`;

  if (config.repos.some((r) => r.id === id)) {
    throw new Error(`Repo ${id} already configured`);
  }

  const repoConfig: RepoConfig = {
    id,
    owner,
    repo,
    buddyId,
    autoReview: false,
    triggerMode: "manual",
  };

  config.repos.push(repoConfig);
  await saveConfig(config);
  return repoConfig;
}

export async function removeRepo(owner: string, repo: string): Promise<void> {
  const config = await loadConfig();
  const id = `${owner}/${repo}`;
  const index = config.repos.findIndex((r) => r.id === id);
  if (index === -1) throw new Error(`Repo ${id} not found`);

  config.repos.splice(index, 1);
  await saveConfig(config);
}

export async function listRepos(): Promise<RepoConfig[]> {
  const config = await loadConfig();
  return config.repos;
}

export async function resetConfig(): Promise<AgentBuddyConfig> {
  const defaults: AgentBuddyConfig = {
    ...structuredClone(DEFAULT_CONFIG),
    repos: [],
  };
  await saveConfig(defaults);
  return defaults;
}

export async function assignBuddy(
  repoId: string,
  buddyId: string
): Promise<void> {
  const config = await loadConfig();
  const repo = config.repos.find((r) => r.id === repoId);
  if (!repo) throw new Error(`Repo ${repoId} not found`);

  repo.buddyId = buddyId;
  repo.buddies = [buddyId];
  await saveConfig(config);
}
