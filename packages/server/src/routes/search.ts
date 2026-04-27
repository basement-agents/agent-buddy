import { Hono } from "hono";
import { listRepos, BuddyFileSystemStorage, Logger, getErrorMessage, RepoConfig, BuddySummary } from "@agent-buddy/core";
import { reviewHistory } from "../jobs/state.js";
import { apiError } from "../lib/api-response.js";

const logger = new Logger("routes:search");

export function createSearchRoutes(): Hono {
  const app = new Hono();

  app.get("/api/search", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) {
      return c.json({ repos: [], buddies: [], reviews: [] });
    }

    if (q.length > 200) {
      return c.json(apiError("Query too long (max 200 characters)"), 400);
    }

    const lower = q.toLowerCase();

    try {
      const [repos, buddies] = await Promise.all([
        listRepos(),
        new BuddyFileSystemStorage().listBuddies(),
      ]);

      const matchingRepos = repos
        .filter((r: RepoConfig) => r.owner && r.repo && (r.owner.toLowerCase().includes(lower) || r.repo.toLowerCase().includes(lower)))
        .slice(0, 5)
        .map((r: RepoConfig) => ({ id: r.id, owner: r.owner, repo: r.repo }));

      const matchingBuddies = buddies
        .filter((b: BuddySummary) => b.username && b.id && (b.username.toLowerCase().includes(lower) || b.id.toLowerCase().includes(lower)))
        .slice(0, 5)
        .map((b: BuddySummary) => ({ id: b.id, username: b.username }));

      const matchingReviews = reviewHistory
        .filter(
          (r) =>
            r.metadata && r.summary &&
            (r.metadata.owner.toLowerCase().includes(lower) ||
            r.metadata.repo.toLowerCase().includes(lower) ||
            r.summary.toLowerCase().includes(lower) ||
            String(r.metadata.prNumber).includes(lower))
        )
        .slice(0, 5)
        .map((r) => ({
          owner: r.metadata.owner,
          repo: r.metadata.repo,
          prNumber: r.metadata.prNumber,
          summary: r.summary,
        }));

      return c.json({ repos: matchingRepos, buddies: matchingBuddies, reviews: matchingReviews });
    } catch (error) {
      logger.warn("Search failed", { error: getErrorMessage(error) });
      return c.json(apiError("Search failed"), 500);
    }
  });

  return app;
}
