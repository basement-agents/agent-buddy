import { Logger } from "@agent-buddy/core";

const logger = new Logger("job-queue");

interface QueueEntry {
  id: string;
  fn: () => Promise<void>;
  type: "review" | "analysis";
}

const MAX_CONCURRENT_REVIEWS = 3;
const MAX_CONCURRENT_ANALYSIS = 1;

let runningReviews = 0;
let runningAnalysis = 0;
const pendingQueue: QueueEntry[] = [];

function canRun(type: "review" | "analysis"): boolean {
  if (type === "review") return runningReviews < MAX_CONCURRENT_REVIEWS;
  return runningAnalysis < MAX_CONCURRENT_ANALYSIS;
}

function startJob(entry: QueueEntry): void {
  if (entry.type === "review") runningReviews++;
  else runningAnalysis++;

  entry.fn().finally(() => {
    if (entry.type === "review") runningReviews--;
    else runningAnalysis--;
    processQueue();
  });
}

function processQueue(): void {
  while (pendingQueue.length > 0) {
    const next = pendingQueue[0];
    if (!canRun(next.type)) break;
    pendingQueue.shift();
    logger.info("Dequeuing job", { jobId: next.id, type: next.type, queueDepth: pendingQueue.length });
    startJob(next);
  }
}

export function enqueueJob(id: string, type: "review" | "analysis", fn: () => Promise<void>): void {
  if (canRun(type)) {
    startJob({ id, fn, type });
  } else {
    pendingQueue.push({ id, fn, type });
    logger.info("Job queued", { jobId: id, type, queueDepth: pendingQueue.length });
  }
}

export function getQueueStats(): { runningReviews: number; runningAnalysis: number; pending: number } {
  return {
    runningReviews,
    runningAnalysis,
    pending: pendingQueue.length,
  };
}
