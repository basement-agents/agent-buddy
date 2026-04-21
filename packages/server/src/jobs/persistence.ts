import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Logger, getErrorMessage } from "@agent-buddy/core";
import type { ReviewJob, AnalysisJob } from "./state.js";

const logger = new Logger("jobs:persistence");

const JOBS_DIR = path.join(os.homedir(), ".agent-buddy", "jobs");

async function ensureJobsDir(): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

interface PersistedReviewJob {
  type: "review";
  data: ReviewJob;
}

interface PersistedAnalysisJob {
  type: "analysis";
  data: AnalysisJob;
}

type PersistedJob = PersistedReviewJob | PersistedAnalysisJob;

function isPersistedJob(data: unknown): data is PersistedJob {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (obj.type !== "review" && obj.type !== "analysis") return false;
  if (typeof obj.data !== "object" || obj.data === null) return false;
  return true;
}

export async function saveJob(job: ReviewJob | AnalysisJob): Promise<void> {
  await ensureJobsDir();
  const filePath = path.join(JOBS_DIR, `${job.id}.json`);
  const persisted: PersistedJob =
    "repoId" in job
      ? { type: "review", data: job }
      : { type: "analysis", data: job };
  await fs.writeFile(filePath, JSON.stringify(persisted, null, 2));
}

export async function loadJob(jobId: string): Promise<PersistedJob | null> {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return isPersistedJob(parsed) ? parsed : null;
  } catch (err) {
    logger.debug("Failed to load job file", { jobId, error: getErrorMessage(err) });
    return null;
  }
}

export async function deleteJob(jobId: string): Promise<void> {
  try {
    const filePath = path.join(JOBS_DIR, `${jobId}.json`);
    await fs.unlink(filePath);
  } catch (err) {
    logger.debug("Failed to delete job file", { jobId, error: getErrorMessage(err) });
  }
}

export async function loadAllJobs(): Promise<PersistedJob[]> {
  await ensureJobsDir();
  const files = await fs.readdir(JOBS_DIR);
  const jobs: PersistedJob[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (isPersistedJob(parsed)) jobs.push(parsed);
    } catch (err) {
      logger.warn("Skipping corrupted job file", { file, error: getErrorMessage(err) });
    }
  }

  return jobs;
}

export async function cleanupCompletedJobs(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  await ensureJobsDir();
  const files = await fs.readdir(JOBS_DIR);
  const now = Date.now();
  let removed = 0;

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, file), "utf-8");
      const parsed = JSON.parse(raw);
      if (!isPersistedJob(parsed)) continue;
      const job = parsed;
      const completedAt = job.data.completedAt;

      if (
        job.data.status === "completed" ||
        job.data.status === "failed"
      ) {
        const isOldEnough = completedAt
          ? (now - new Date(completedAt).getTime()) > maxAgeMs
          : true;

        if (isOldEnough) {
          await fs.unlink(path.join(JOBS_DIR, file));
          removed++;
        }
      }
    } catch (err) {
      logger.warn("Skipping corrupted job file during cleanup", { file, error: getErrorMessage(err) });
    }
  }

  return removed;
}
