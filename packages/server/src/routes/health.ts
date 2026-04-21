import { Hono } from "hono";
import { reviewJobs, analysisJobs } from "../jobs/state.js";
import { BuddyFileSystemStorage } from "@agent-buddy/core";
import { Logger, getErrorMessage } from "@agent-buddy/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const logger = new Logger("health-check");

// Track server start time
export const SERVER_START_TIME = new Date();

// Load version from package.json
let PACKAGE_VERSION = "0.0.0";
try {
  const packagePath = join(import.meta.dirname, "../../package.json");
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    PACKAGE_VERSION = pkg.version || "0.0.0";
  }
} catch (err) {
  logger.warn("Failed to read package version", { error: getErrorMessage(err) });
}

async function getStorageStatus(): Promise<{ accessible: boolean; buddyDirectory: string; error?: string }> {
  const buddyDir = join(homedir(), ".agent-buddy", "buddy");
  try {
    const storage = new BuddyFileSystemStorage();
    // Try to access the storage by listing available buddies
    await storage.listBuddies();
    return { accessible: true, buddyDirectory: buddyDir };
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    return { accessible: false, buddyDirectory: buddyDir, error: errorMessage };
  }
}

function getGitHubApiStatus(): { configured: boolean; hasToken: boolean } {
  const hasToken = Boolean(process.env.GITHUB_TOKEN);
  return { configured: hasToken, hasToken };
}

function getJobQueueStatus() {
  const reviewJobsArray = Array.from(reviewJobs.values());
  const analysisJobsArray = Array.from(analysisJobs.values());

  const pending = reviewJobsArray.filter((j) => j.status === "queued").length + analysisJobsArray.filter((j) => j.status === "queued").length;
  const running = reviewJobsArray.filter((j) => j.status === "running").length + analysisJobsArray.filter((j) => j.status === "running").length;
  const completed = reviewJobsArray.filter((j) => j.status === "completed").length + analysisJobsArray.filter((j) => j.status === "completed").length;
  const failed = reviewJobsArray.filter((j) => j.status === "failed").length + analysisJobsArray.filter((j) => j.status === "failed").length;

  return { pending, running, completed, failed };
}

function getUptime(): number {
  return Date.now() - SERVER_START_TIME.getTime();
}

export function createHealthRoutes(): Hono {
  const app = new Hono();

  app.get("/api/health", async (c) => {
    const [storageStatus, gitHubStatus, queueStatus] = await Promise.all([
      getStorageStatus(),
      Promise.resolve(getGitHubApiStatus()),
      Promise.resolve(getJobQueueStatus()),
    ]);

    const uptimeMs = getUptime();
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: {
        milliseconds: uptimeMs,
        seconds: uptimeSeconds,
        startTime: SERVER_START_TIME.toISOString(),
      },
      version: PACKAGE_VERSION,
      systems: {
        storage: storageStatus,
        github: gitHubStatus,
      },
      jobQueue: queueStatus,
    });
  });

  return app;
}
