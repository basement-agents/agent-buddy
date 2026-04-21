import { type Context } from "hono";
import { loadConfig } from "@agent-buddy/core";
import { validateRepoId, apiError } from "./api-response.js";

export function validateRepoParams(c: Context): { owner: string; repo: string; id: string } | Response {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  if (!owner || !repo) return c.json(apiError("Missing owner or repo parameter"), 400);
  const validationError = validateRepoId(owner, repo);
  if (validationError) return c.json(validationError, 400);
  return { owner, repo, id: `${owner}/${repo}` };
}

export async function loadRepoConfig(id: string) {
  const config = await loadConfig();
  const repoConfig = config.repos.find((r) => r.id === id) ?? null;
  return { config, repoConfig };
}

type ResolvedRepo = { config: Awaited<ReturnType<typeof loadRepoConfig>>["config"]; repoConfig: NonNullable<Awaited<ReturnType<typeof loadRepoConfig>>["repoConfig"]> };

export async function requireRepoConfig(id: string, c: Context): Promise<ResolvedRepo | Response> {
  const { config, repoConfig } = await loadRepoConfig(id);
  if (!repoConfig) return c.json(apiError("Repo not found"), 404);
  return { config, repoConfig };
}
