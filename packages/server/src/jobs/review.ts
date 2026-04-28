import { loadConfig, RepoConfig } from "@agent-buddy/core";
import {
  GitHubClient,
  BuddyFileSystemStorage,
  ReviewEngine,
  createLLMProvider,
  Logger,
  getErrorMessage,
  calculateBackoffDelay,
} from "@agent-buddy/core";
import type { CodeReview, ProgressReporter, ProgressUpdate } from "@agent-buddy/core";
import type { ErrorEntry, ReviewJob } from "./state.js";
import { addReview, reviewJobs } from "./state.js";
import { saveJob } from "./persistence.js";
import { isRetryableError, DEFAULT_MAX_RETRIES } from "./retry-helpers.js";

const logger = new Logger("review-job");

function persistJob(job: ReviewJob, context: string): void {
  saveJob(job).catch((err) => logger.error(`Failed to persist ${context}`, { jobId: job.id, error: getErrorMessage(err) }));
}

function updateProgress(job: ReviewJob, percentage: number, stage: string, detail: string): void {
  job.progressPercentage = percentage;
  job.progressStage = stage;
  job.progressDetail = detail;
}

function makeReviewReporter(job: ReviewJob): ProgressReporter {
  return {
    report(u: ProgressUpdate): void {
      if (u.stage !== undefined) job.progressStage = u.stage;
      if (u.detail !== undefined) job.progressDetail = u.detail;
      if (u.subStep !== undefined) job.subStep = u.subStep;
      if (u.elapsedMs !== undefined) job.elapsedMs = u.elapsedMs;
      if (u.model !== undefined) job.currentModel = u.model;
      if (typeof u.fraction === "number") {
        const clamped = Math.min(1, Math.max(0, u.fraction));
        job.progressPercentage = Math.round(50 + clamped * 30);
      }
    },
  };
}

function completeReviewJob(job: ReviewJob, result: CodeReview, diff: string): void {
  updateProgress(job, 100, "completed", "Review complete");
  addReview({ ...result, diff } as CodeReview);
  job.status = "completed";
  job.result = result;
  job.completedAt = new Date();
  persistJob(job, "completed job");
}

async function executeReview(
  jobId: string,
  repoId: string,
  prNumber: number,
  buddyId: string | undefined,
  reviewType: "low-context" | "high-context" | "auto" | undefined,
  attempt: number
): Promise<void> {
  const job = reviewJobs.get(jobId);
  if (!job) throw new Error(`Review job ${jobId} not found`);

  const [owner, repo] = repoId.split("/");
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("Missing GH_TOKEN");

  const config = await loadConfig();
  const repoConfig = config.repos.find((r: RepoConfig) => r.id === repoId);

  const client = new GitHubClient(token);
  const llm = createLLMProvider(config.llm);
  const engine = new ReviewEngine(llm, repoConfig?.customRules);
  const storage = new BuddyFileSystemStorage();

  updateProgress(job, 10, "fetching_pr_data", attempt > 0 ? `Retrying... (attempt ${attempt + 1})` : "Fetching PR diff...");

  const [pr, diff] = await Promise.all([
    client.getPR(owner, repo, prNumber),
    client.getPRDiff(owner, repo, prNumber),
  ]);

  updateProgress(job, 30, "loading_buddy_profile", attempt > 0 ? `Loading buddy profile (retry ${attempt + 1})...` : "Loading buddy profile...");

  let buddyProfile;
  if (buddyId) {
    buddyProfile = await storage.readProfile(buddyId);
    updateProgress(job, 40, "loading_buddy_profile", "Buddy profile loaded");
  }

  updateProgress(job, 50, "analyzing_code", attempt > 0 ? `Analyzing code (retry ${attempt + 1})...` : "Analyzing code changes...");

  let repoFiles: string[] | undefined;
  const effectiveReviewType = reviewType ?? "auto";
  if (effectiveReviewType === "high-context" || effectiveReviewType === "auto") {
    updateProgress(job, 60, "fetching_repo_context", "Fetching repository files for context...");
    try {
      const prFileList = await client.getPRFiles(owner, repo, prNumber);
      repoFiles = prFileList.map((f) => f.filename);
    } catch (err) {
      if (effectiveReviewType === "auto") {
        logger.warn("Failed to fetch repo files, falling back to low-context review", {
          jobId,
          error: getErrorMessage(err),
        });
        repoFiles = undefined;
      } else {
        throw err;
      }
    }
  }

  const reporter = makeReviewReporter(job);
  const review = await engine.performReview(pr, diff, buddyProfile ?? undefined, repoFiles, reporter);

  updateProgress(job, 80, "posting_review", attempt > 0 ? `Posting review (retry ${attempt + 1})...` : "Posting review to GitHub...");

  const ghReview = engine.formatForGitHub(review);
  await client.createReview(owner, repo, prNumber, ghReview);

  completeReviewJob(job, review, diff);
}

export async function processReviewJob(
  jobId: string,
  repoId: string,
  prNumber: number,
  buddyId?: string,
  reviewType?: "low-context" | "high-context" | "auto"
): Promise<void> {
  const job = reviewJobs.get(jobId);
  if (!job) throw new Error(`Review job ${jobId} not found`);

  if (job.retryCount === undefined) job.retryCount = 0;
  if (job.maxRetries === undefined) job.maxRetries = DEFAULT_MAX_RETRIES;
  if (!job.errorHistory) job.errorHistory = [];

  job.status = "running";
  updateProgress(job, 0, "fetching_pr_data", "Fetching PR information...");

  persistJob(job, "job state");

  try {
    await executeReview(jobId, repoId, prNumber, buddyId, reviewType, job.retryCount);
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    const attempt = job.retryCount;

    const errorEntry: ErrorEntry = {
      message: errorMessage,
      timestamp: new Date(),
      attempt: attempt + 1,
    };
    const errorHistory = job.errorHistory;
    if (errorHistory) errorHistory.push(errorEntry);
    job.error = errorMessage;

    logger.error("Review job failed", {
      jobId,
      repoId,
      prNumber,
      attempt: attempt + 1,
      maxRetries: job.maxRetries,
      error: errorMessage
    });

    const maxRetries = job.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (attempt < maxRetries && isRetryableError(err)) {
      job.status = "queued";
      job.progressStage = "queued";
      job.retryCount = attempt + 1;
      job.progressDetail = `Failed: ${errorMessage}. Retrying in ${calculateBackoffDelay(attempt) / 1000}s...`;

      persistJob(job, "queued job");

      const delay = calculateBackoffDelay(attempt);
      setTimeout(async () => {
        const currentJob = reviewJobs.get(jobId);
        if (!currentJob || currentJob.status !== "queued") return;

        try {
          await processReviewJob(jobId, repoId, prNumber, buddyId, reviewType);
        } catch (retryErr) {
          const retryJob = reviewJobs.get(jobId);
          if (retryJob) {
            retryJob.status = "failed";
            retryJob.completedAt = new Date();
            retryJob.error = getErrorMessage(retryErr);
            persistJob(retryJob, "failed job after retry");
          }
          logger.error("Retry attempt failed, job marked as failed", { jobId, attempt: attempt + 1, error: getErrorMessage(retryErr) });
        }
      }, delay);
    } else {
      job.status = "failed";
      job.completedAt = new Date();
      job.progressStage = "failed";
      job.progressDetail = `Failed after ${maxRetries} retries: ${errorMessage}`;
      persistJob(job, "failed job");
      logger.error("Review job failed permanently", {
        jobId,
        repoId,
        prNumber,
        totalAttempts: attempt + 1,
        error: errorMessage
      });
    }
  }
}
