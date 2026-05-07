import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { Logger } from "@agent-buddy/core";
import { authMiddleware } from "./middleware/auth.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { rateLimitMiddleware, getRateLimitStatus } from "./middleware/rate-limit.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.js";
import { createReposRoutes } from "./routes/repos.js";
import { createBuddiesRoutes } from "./routes/buddies.js";
import { createReviewsRoutes } from "./routes/reviews.js";
import { createWebhooksRoutes } from "./routes/webhooks.js";
import { createSettingsRoutes } from "./routes/settings.js";
import { createMetricsRoutes } from "./routes/metrics.js";
import { createSearchRoutes } from "./routes/search.js";
import { apiError, notFound as apiNotFound } from "./lib/api-response.js";
import { performHealthChecks } from "./lib/health-check.js";
import { initializeSchedules, cleanupSchedules } from "./jobs/scheduler.js";
import { loadConfig, getErrorMessage } from "@agent-buddy/core";
import { reviewJobs, analysisJobs } from "./jobs/state.js";
import type { ReviewJob, AnalysisJob } from "./jobs/state.js";
import { loadAllJobs, cleanupCompletedJobs, saveJob } from "./jobs/persistence.js";
import { serveStatic } from "./lib/static.js";

const app = new Hono();
const logger = new Logger("server");

let isShuttingDown = false;
let dashboardDirRef: string | null = null;

const PERSIST_INTERVAL_MS = 2_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const JOB_CHECK_INTERVAL_MS = 1_000;

function getRunningJobs(): (ReviewJob | AnalysisJob)[] {
  return [...reviewJobs.values(), ...analysisJobs.values()].filter((j) => j.status === "running");
}

export function getIsShuttingDown(): boolean {
  return isShuttingDown;
}

app.use("*", requestIdMiddleware());
app.use("*", securityHeadersMiddleware());
app.use("*", cors());
app.use("*", honoLogger());
app.use("/api/*", rateLimitMiddleware());
app.use("/api/*", authMiddleware);

app.use("*", async (c, next) => {
  if (!dashboardDirRef) return next();
  const handler = serveStatic(dashboardDirRef, { spaFallback: false });
  return handler(c, next);
});

app.get("/api/health", async (c) => {
  const rateLimitStatus = getRateLimitStatus();

  const healthChecks = await performHealthChecks().catch(() => ({
    provider: { status: "error" as const, message: "Health check failed" },
  }));

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    rateLimit: rateLimitStatus,
    dependencies: {
      provider: healthChecks.provider,
    },
  });
});

app.route("/", createReposRoutes());
app.route("/", createBuddiesRoutes());
app.route("/", createReviewsRoutes());
app.route("/", createSearchRoutes());
app.route("/", createWebhooksRoutes());
app.route("/", createSettingsRoutes());
app.route("/", createMetricsRoutes());

app.onError((err, c) => {
  logger.error("Request error", {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });
  const message = process.env.NODE_ENV !== "production" ? (err.message || "Internal server error") : "Internal server error";
  return c.json(apiError(message), 500);
});

app.notFound(async (c) => {
  if (dashboardDirRef && (c.req.method === "GET" || c.req.method === "HEAD") && !c.req.path.startsWith("/api/")) {
    const handler = serveStatic(dashboardDirRef, { spaFallback: true });
    const res = await handler(c, async () => undefined as unknown as Response);
    if (res && res.status === 200) return res;
  }
  return c.json(apiNotFound("route", c.req.path), 404);
});

export interface ServeOptions {
  port?: number;
  dashboardDir?: string;
}

export async function serve(options: ServeOptions = {}): Promise<void> {
  dashboardDirRef = options.dashboardDir ?? null;
  const config = await loadConfig();
  const actualPort = options.port || config.server?.port || 3000;

  logger.info(`Server starting on port ${actualPort}`);
  process.env.PORT = String(actualPort);

  try {
    const persisted = await loadAllJobs();
    let recovered = 0;
    const recoverIfRunning = (data: ReviewJob | AnalysisJob) => {
      if (data.status !== "running") return false;
      data.status = "failed";
      data.error = "Server restarted while job was running";
      data.completedAt = new Date();
      recovered++;
      return true;
    };
    for (const job of persisted) {
      const needsSave = recoverIfRunning(job.data);
      if (needsSave) await saveJob(job.data);
      if (job.type === "review") {
        reviewJobs.set(job.data.id, job.data);
      } else {
        analysisJobs.set(job.data.id, job.data);
      }
    }
    if (recovered > 0) {
      logger.info(`Recovered ${recovered} running jobs as failed`);
    }
    if (persisted.length > 0) {
      logger.info(`Loaded ${persisted.length} persisted jobs`);
    }
    const cleaned = await cleanupCompletedJobs();
    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired completed jobs`);
    }
  } catch (err) {
    logger.error("Failed to recover persisted jobs", { error: getErrorMessage(err) });
  }

  initializeSchedules(config);

  const persistenceInterval = setInterval(() => {
    for (const job of getRunningJobs()) {
      saveJob(job).catch((err) => {
        logger.error("Failed to persist job", { jobId: job.id, error: getErrorMessage(err) });
      });
    }
  }, PERSIST_INTERVAL_MS);

  const { createServer } = await import("node:http");
  type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${actualPort}`);
    const headers: Record<string, string> = {};
    const rawHeaders = req.headers as IncomingHttpHeaders;
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (value !== undefined) headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    const rawBody = chunks.length > 0 ? Buffer.concat(chunks) : null;

    const request = new Request(url.toString(), {
      method: req.method || "GET",
      headers,
      body: rawBody && rawBody.length > 0 ? rawBody : undefined,
    });

    try {
      const response = await app.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      const body = Buffer.from(await response.arrayBuffer());
      res.end(body);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      logger.error("Server request failed", { error: error.message, stack: error.stack });
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(actualPort, () => {
    logger.info(`Server listening on http://localhost:${actualPort}`);
  });

  const shutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("Shutting down server... Waiting for running jobs to complete");

    cleanupSchedules();
    clearInterval(persistenceInterval);

    const runningJobs = getRunningJobs();

    if (runningJobs.length > 0) {
      logger.info(`Waiting for ${runningJobs.length} running jobs to complete (max 30s)...`);

      const forceExit = setTimeout(() => {
        logger.warn("Force exiting after 30s shutdown timeout");
        server.close(() => process.exit(1));
      }, SHUTDOWN_TIMEOUT_MS);

      const checkInterval = setInterval(() => {
        const stillRunning = getRunningJobs();
        if (stillRunning.length === 0) {
          clearInterval(checkInterval);
          clearTimeout(forceExit);
          logger.info("All jobs completed, shutting down");
          server.close(() => process.exit(0));
        }
      }, JOB_CHECK_INTERVAL_MS);
    } else {
      server.close(() => process.exit(0));
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export default app;
