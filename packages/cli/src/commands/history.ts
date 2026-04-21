import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export interface PersistedJob {
  type: string;
  data: {
    id: string;
    status: string;
    repoId?: string;
    buddyId?: string;
    prNumber?: number;
    createdAt: string;
    completedAt?: string;
    result?: { comments?: unknown[] };
  };
}

export interface HistoryOptions {
  repo?: string;
  buddy?: string;
  since?: string;
  until?: string;
  json: boolean;
}

export interface ReviewSummary {
  id: string;
  repo: string | undefined;
  prNumber: number | undefined;
  buddyId: string | undefined;
  state: string;
  commentCount: number;
  date: string;
}

export interface HistoryDeps {
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string, encoding: string) => Promise<string>;
  joinPath: (...parts: string[]) => string;
  getHomeDir: () => string;
}

const defaultDeps: HistoryDeps = {
  readdir: (p) => fs.readdir(p),
  readFile: (p, enc) => fs.readFile(p, enc as BufferEncoding),
  joinPath: (...parts) => path.join(...parts),
  getHomeDir: () => os.homedir(),
};

function parseDate(dateStr: string): Date {
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: "${dateStr}". Use YYYY-MM-DD.`);
  }
  return parsed;
}

export async function readPersistedJobs(deps: HistoryDeps = defaultDeps): Promise<PersistedJob[]> {
  const jobsDir = deps.joinPath(deps.getHomeDir(), ".agent-buddy", "jobs");
  const files = await deps.readdir(jobsDir).catch(() => [] as string[]);

  const jobs: PersistedJob[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await deps.readFile(deps.joinPath(jobsDir, file), "utf-8").catch(() => null);
    if (raw !== null) {
      try {
        jobs.push(JSON.parse(raw));
      } catch (err) {
        console.error(`Skipping malformed history file: ${file}`, err);
      }
    }
  }

  return jobs;
}

export async function fetchReviewHistory(opts: HistoryOptions, deps: HistoryDeps = defaultDeps): Promise<ReviewSummary[]> {
  const jobs = await readPersistedJobs(deps);

  let reviews = jobs.filter((j) => j.type === "review" && j.data.status !== "queued");

  if (opts.repo) {
    reviews = reviews.filter((j) => j.data.repoId === opts.repo);
  }
  if (opts.buddy) {
    reviews = reviews.filter((j) => j.data.buddyId === opts.buddy);
  }
  if (opts.since) {
    const sinceDate = parseDate(opts.since);
    reviews = reviews.filter((j) => new Date(j.data.createdAt) >= sinceDate);
  }
  if (opts.until) {
    const endOfDay = new Date(parseDate(opts.until));
    endOfDay.setHours(23, 59, 59, 999);
    reviews = reviews.filter((j) => new Date(j.data.createdAt) <= endOfDay);
  }

  reviews.sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());
  const last10 = reviews.slice(0, 10);

  return last10.map((j) => ({
    id: j.data.id,
    repo: j.data.repoId,
    prNumber: j.data.prNumber,
    buddyId: j.data.buddyId,
    state: j.data.status,
    commentCount: (j.data.result?.comments as unknown[] | undefined)?.length ?? 0,
    date: j.data.createdAt,
  }));
}
