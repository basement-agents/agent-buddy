import { loadConfig, saveConfig } from "@agent-buddy/core";
import { GitHubClient, Logger, getErrorMessage, sleep } from "@agent-buddy/core";
import { reviewHistory, reviewJobs, schedules, createJobBase } from "./state.js";
import { processReviewJob } from "./review.js";

const logger = new Logger("scheduler");

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

import { RepoConfig } from "@agent-buddy/core";

export async function checkForOpenPRs(repoId: string): Promise<void> {
  const config = await loadConfig();
  const repoConfig = config.repos.find((r: RepoConfig) => r.id === repoId);
  if (!repoConfig || !repoConfig.schedule?.enabled) return;

  const [owner, repo] = repoId.split("/");
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const schedule = schedules.get(repoId);
  const currentRetryCount = schedule?.retryCount ?? 0;

  try {
    const client = new GitHubClient(token);
    const prs = await client.listPRs(owner, repo, { state: "open" });

    for (const pr of prs) {
      const hasRecentReview = reviewHistory.some(
        (r) => r.metadata.prNumber === pr.number &&
        r.metadata.repo === repo &&
        r.metadata.owner === owner &&
        (Date.now() - new Date(r.reviewedAt).getTime()) < 24 * 60 * 60 * 1000
      );

      if (!hasRecentReview) {
        const buddyIds = repoConfig.buddies || (repoConfig.buddyId ? [repoConfig.buddyId] : []);

        for (const buddyId of buddyIds) {
          const job = {
            ...createJobBase(),
            repoId,
            prNumber: pr.number,
            buddyId,
          };
          reviewJobs.set(job.id, job);

          processReviewJob(job.id, repoId, pr.number, buddyId).catch((err) => {
            logger.error("Scheduled review job failed", { jobId: job.id, repoId, prNumber: pr.number, buddyId, error: getErrorMessage(err) });
          });
        }
      }
    }

    if (schedule) {
      schedule.lastRun = new Date().toISOString();
      schedule.retryCount = 0;
      schedule.lastError = undefined;
    }

    if (repoConfig.schedule) {
      repoConfig.schedule.lastRun = new Date().toISOString();
      await saveConfig(config);
    }
  } catch (err) {
    const errorMsg = getErrorMessage(err);
    logger.error("Scheduled check failed", { repoId, attempt: currentRetryCount + 1, error: errorMsg });

    if (currentRetryCount < MAX_RETRIES) {
      const delayMs = BASE_DELAY_MS * Math.pow(2, currentRetryCount);
      const nextAttempt = currentRetryCount + 1;

      logger.info(`Retrying scheduled check in ${delayMs}ms`, { repoId, attempt: nextAttempt, maxRetries: MAX_RETRIES });

      if (schedule) {
        schedule.retryCount = nextAttempt;
        schedule.lastError = errorMsg;
      }

      await sleep(delayMs);
      return checkForOpenPRs(repoId);
    } else {
      logger.error("Scheduled check failed after max retries", { repoId, retryCount: currentRetryCount, error: errorMsg });

      if (schedule) {
        schedule.retryCount = 0;
        schedule.lastError = errorMsg;
      }
    }
  }
}

export function initializeSchedules(config: { repos: Array<{ id: string; schedule?: { enabled: boolean; intervalMinutes: number; lastRun?: string } }> }): void {
  for (const repo of config.repos) {
    if (repo.schedule?.enabled && repo.schedule.intervalMinutes > 0) {
      const timer = setInterval(() => {
        checkForOpenPRs(repo.id).catch((err) => {
          logger.error("Scheduled check threw unhandled error", { repoId: repo.id, error: getErrorMessage(err) });
        });
      }, repo.schedule.intervalMinutes * 60 * 1000);

      schedules.set(repo.id, {
        repoId: repo.id,
        enabled: true,
        intervalMinutes: repo.schedule.intervalMinutes,
        lastRun: repo.schedule.lastRun,
        timer,
      });
    }
  }
}

export function cleanupSchedules(): void {
  for (const schedule of schedules.values()) {
    if (schedule.timer) {
      clearInterval(schedule.timer);
    }
  }
}
