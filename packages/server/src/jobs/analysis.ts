import {
  GitHubClient,
  BuddyFileSystemStorage,
  AnalysisPipeline,
  createLLMProvider,
  loadConfig,
  Logger,
  getErrorMessage,
  calculateBackoffDelay,
} from "@agent-buddy/core";
import { analysisJobs } from "./state.js";
import type { AnalysisJob, ErrorEntry } from "./state.js";
import { isRetryableError, DEFAULT_MAX_RETRIES } from "./retry-helpers.js";

const logger = new Logger("analysis-job");

function initRetryFields(job: AnalysisJob): void {
  if (job.retryCount === undefined) job.retryCount = 0;
  if (job.maxRetries === undefined) job.maxRetries = DEFAULT_MAX_RETRIES;
  if (!job.errorHistory) job.errorHistory = [];
}

function handleJobError(job: AnalysisJob, err: unknown, logContext: Record<string, unknown>): number | undefined {
  const errorMessage = getErrorMessage(err);
  const attempt = job.retryCount ?? 0;

  const errorEntry: ErrorEntry = {
    message: errorMessage,
    timestamp: new Date(),
    attempt: attempt + 1,
  };
  job.errorHistory?.push(errorEntry);
  job.error = errorMessage;

  logger.error("Analysis job failed", { ...logContext, attempt: attempt + 1, maxRetries: job.maxRetries, error: errorMessage });

  const maxRetries = job.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (attempt < maxRetries && isRetryableError(err)) {
    const delay = calculateBackoffDelay(attempt);
    job.status = "queued";
    job.progressStage = "queued";
    job.retryCount = attempt + 1;
    job.progressDetail = `Failed: ${errorMessage}. Retrying in ${delay / 1000}s...`;
    return delay;
  }

  failJob(job, errorMessage, logContext);
  return undefined;
}

function initJob(job: AnalysisJob, progress: string, detail: string): void {
  job.status = "running";
  job.progressStage = "fetching_reviews";
  job.progressPercentage = 0;
  job.progress = progress;
  job.progressDetail = detail;
}

function completeJob(job: AnalysisJob, detail: string): void {
  job.progressPercentage = 100;
  job.progressStage = "completed";
  job.progress = "Done";
  job.progressDetail = detail;
  job.status = "completed";
  job.completedAt = new Date();
}

function failJob(job: AnalysisJob, errorMessage: string, logContext: Record<string, unknown>): void {
  job.status = "failed";
  job.error = errorMessage;
  job.progressStage = "failed";
  job.progressDetail = `Failed: ${errorMessage}`;
  job.completedAt = new Date();
  logger.error("Job failed", logContext);
}

export async function processAnalysisJob(
  jobId: string,
  username: string,
  owner: string,
  repo: string,
  token: string,
  maxPrs: number
): Promise<void> {
  const job = analysisJobs.get(jobId);
  if (!job) throw new Error(`Analysis job ${jobId} not found`);
  initRetryFields(job);
  initJob(job, "Fetching review history...", "Fetching reviews from GitHub...");

  try {
    const config = await loadConfig();
    const client = new GitHubClient(token);
    const llm = createLLMProvider(config.llm);
    const pipeline = new AnalysisPipeline(llm);

    job.progressPercentage = 10;
    job.progressDetail = "Fetching PRs reviewed by user...";

    const reviewData = await client.getPRsReviewedBy(owner, repo, username, undefined, maxPrs);
    if (reviewData.length === 0) throw new Error("No reviews found for this user");

    job.progressStage = "analyzing_patterns";
    job.progressPercentage = 30;
    job.progress = `Analyzing ${reviewData.length} reviews...`;
    job.progressDetail = "Extracting review patterns and style...";

    const data = reviewData;

    job.progressPercentage = 60;
    job.progressDetail = "Generating buddy profile...";

    job.progressStage = "generating_profile";
    await pipeline.createBuddy(username, data, owner, repo);

    completeJob(job, "Buddy profile created successfully");
  } catch (err) {
    const delay = handleJobError(job, err, { jobId, username, owner, repo });
    if (delay !== undefined) {
      setTimeout(async () => {
        const currentJob = analysisJobs.get(jobId);
        if (!currentJob || currentJob.status !== "queued") return;
        try {
          await processAnalysisJob(jobId, username, owner, repo, token, maxPrs);
        } catch (retryErr) {
          logger.error("Analysis retry failed", { jobId, error: getErrorMessage(retryErr) });
          const retryJob = analysisJobs.get(jobId);
          if (retryJob) {
            retryJob.status = "failed";
            retryJob.completedAt = new Date();
          }
        }
      }, delay);
    }
  }
}

export async function processUpdateJob(
  jobId: string,
  buddyId: string,
  repoStr: string | undefined,
  token: string
): Promise<void> {
  const job = analysisJobs.get(jobId);
  if (!job) throw new Error(`Analysis job ${jobId} not found`);
  initRetryFields(job);
  initJob(job, "Loading buddy profile...", "Loading buddy profile...");

  try {
    const config = await loadConfig();
    const storage = new BuddyFileSystemStorage();
    const profile = await storage.readProfile(buddyId);
    if (!profile) throw new Error("Buddy not found");

    const repos = repoStr ? [repoStr] : profile.sourceRepos;
    if (repos.length === 0) throw new Error("No source repos");

    const client = new GitHubClient(token);
    const llm = createLLMProvider(config.llm);
    const pipeline = new AnalysisPipeline(llm);

    let totalReviews = 0;
    for (let i = 0; i < repos.length; i++) {
      const r = repos[i];
      const [owner, repo] = r.split("/");
      if (!owner || !repo) continue;

      job.progressDetail = `Fetching reviews from ${r}...`;
      job.progressPercentage = Math.floor((i / repos.length) * 50);

      const reviewData = await client.getPRsReviewedBy(owner, repo, buddyId, undefined, 50);
      if (reviewData.length > 0) {
        totalReviews += reviewData.length;
        job.progressDetail = `Updating from ${reviewData.length} reviews on ${r}...`;
        job.progressPercentage = Math.floor(((i + 0.5) / repos.length) * 50) + 50;

        job.progressStage = "analyzing_patterns";
        await pipeline.updateBuddy(buddyId, reviewData, owner, repo);
      }
    }

    completeJob(job, `Updated from ${totalReviews} reviews across ${repos.length} repo(s)`);
  } catch (err) {
    const delay = handleJobError(job, err, { jobId, buddyId, repoStr });
    if (delay !== undefined) {
      setTimeout(async () => {
        const currentJob = analysisJobs.get(jobId);
        if (!currentJob || currentJob.status !== "queued") return;
        try {
          await processUpdateJob(jobId, buddyId, repoStr, token);
        } catch (retryErr) {
          logger.error("Update retry failed", { jobId, error: getErrorMessage(retryErr) });
          const retryJob = analysisJobs.get(jobId);
          if (retryJob) {
            retryJob.status = "failed";
            retryJob.completedAt = new Date();
          }
        }
      }, delay);
    }
  }
}
