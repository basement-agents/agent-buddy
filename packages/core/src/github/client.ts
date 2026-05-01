import crypto from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { createConcurrencyLimiter, getErrorMessage, Logger, sleep } from "../utils/index.js";
import { LRUCache, githubCache } from "./cache.js";
import type { CacheStats } from "./cache.js";

const logger = new Logger("github-client");
import type {
  PullRequest,
  PRFile,
  ReviewComment,
  IssueComment,
  PRReview,
  Repository,
  Contributor,
  CreateReviewRequest,
  WebhookEvent,
} from "./types.js";

const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
    public rateLimitRemaining?: number,
    public rateLimitReset?: number
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class GitHubClient {
  private token: string;
  private githubAppId?: string;
  private githubAppPrivateKey?: string;
  private githubAppInstallationId?: string;
  private rateLimitRemaining = 5000;
  private rateLimitReset = 0;
  private readonly maxPages: number;
  private readonly cache: LRUCache;

  constructor(
    token: string,
    appCredentials?: { appId: string; privateKey: string; installationId: string },
    maxPages = 10,
    cache?: LRUCache,
  ) {
    this.token = token;
    this.maxPages = maxPages;
    this.cache = cache ?? githubCache;
    if (appCredentials) {
      this.githubAppId = appCredentials.appId;
      this.githubAppPrivateKey = appCredentials.privateKey;
      this.githubAppInstallationId = appCredentials.installationId;
    }
  }

  private updateRateLimits(response: Response): void {
    this.rateLimitRemaining = parseInt(response.headers.get("x-ratelimit-remaining") || "5000", 10);
    this.rateLimitReset = parseInt(response.headers.get("x-ratelimit-reset") || "0", 10);
  }

  private async waitForRateLimitReset(): Promise<boolean> {
    if (this.rateLimitRemaining <= 0) {
      const waitMs = this.rateLimitReset * 1000 - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
        return true;
      }
    }
    return false;
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelayMs = 1000
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          await sleep(baseDelayMs * Math.pow(2, attempt));
        }
      }
    }
    throw lastError;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    retriedRateLimit = false
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, { ...options, headers });
    this.updateRateLimits(response);

    if (!retriedRateLimit && this.rateLimitRemaining <= 0 && await this.waitForRateLimitReset()) {
      return this.request<T>(path, options, true);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new GitHubError(
        response.status,
        `GitHub API error ${response.status}: ${body}`,
        this.rateLimitRemaining,
        this.rateLimitReset
      );
    }

    return response.json() as Promise<T>;
  }

  private async paginateRequest<T>(path: string, initialPerPage: number = 100): Promise<T[]> {
    const allResults: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= this.maxPages) {
      await this.waitForRateLimitReset();

      const url = new URL(path.startsWith("http") ? path : `${GITHUB_API}${path}`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(initialPerPage));

      const results = await this.request<T[]>(url.pathname + url.search);

      if (Array.isArray(results)) {
        allResults.push(...results);
        if (results.length < initialPerPage) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    return allResults;
  }

  async generateAppInstallationToken(): Promise<string> {
    if (!this.githubAppId || !this.githubAppPrivateKey || !this.githubAppInstallationId) {
      throw new Error("GitHub App credentials not configured");
    }

    try {
      const privateKey = await importPKCS8(this.githubAppPrivateKey, "RS256");

      const jwt = await new SignJWT({ iss: this.githubAppId })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      const response = await fetch(
        `${GITHUB_API}/app/installations/${this.githubAppInstallationId}/access_tokens`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!response.ok) {
        throw new GitHubError(response.status, "Failed to generate installation token");
      }

      const data = await response.json() as { token: string };
      return data.token;
    } catch (error) {
      throw new Error(`Failed to generate GitHub App token: ${getErrorMessage(error)}`);
    }
  }

  async useAppInstallation(): Promise<void> {
    const token = await this.generateAppInstallationToken();
    this.token = token;
  }

  async listPRs(
    owner: string,
    repo: string,
    opts: { state?: "open" | "closed" | "all"; perPage?: number; page?: number } = {}
  ): Promise<PullRequest[]> {
    const state = opts.state ?? "open";
    const cacheKey = LRUCache.keyPRs(owner, repo, state);

    // Only use cache for the full (paginated) fetch, not single-page requests.
    if (!opts.page) {
      const cached = this.cache.get<PullRequest[]>(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams();
    if (opts.state) params.set("state", opts.state);
    params.set("per_page", String(opts.perPage || 30));
    if (opts.page) params.set("page", String(opts.page));

    if (opts.page) {
      return this.request<PullRequest[]>(`/repos/${owner}/${repo}/pulls?${params}`);
    }

    const result = await this.paginateRequest<PullRequest>(`/repos/${owner}/${repo}/pulls?${params.toString()}`, opts.perPage || 30);
    this.cache.set(cacheKey, result, 30_000);
    return result;
  }

  async getPR(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const cacheKey = LRUCache.keyPR(owner, repo, prNumber);
    const cached = this.cache.get<PullRequest>(cacheKey);
    if (cached) return cached;

    const result = await this.request<PullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );
    this.cache.set(cacheKey, result, 120_000);
    return result;
  }

  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]> {
    const cacheKey = LRUCache.keyPRFiles(owner, repo, prNumber);
    const cached = this.cache.get<PRFile[]>(cacheKey);
    if (cached) return cached;

    const result = await this.request<PRFile[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`
    );
    this.cache.set(cacheKey, result, 120_000);
    return result;
  }

  async getPRDiff(owner: string, repo: string, prNumber: number): Promise<string> {
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3.diff",
        },
      }
    );

    this.updateRateLimits(response);

    if (!response.ok) throw new GitHubError(response.status, "Failed to fetch diff");
    return response.text();
  }

  async getReviewComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewComment[]> {
    return this.request<ReviewComment[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/comments`
    );
  }

  async getReviews(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRReview[]> {
    return this.request<PRReview[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
    );
  }

  async createReview(
    owner: string,
    repo: string,
    prNumber: number,
    review: CreateReviewRequest
  ): Promise<PRReview> {
    return this.request<PRReview>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      {
        method: "POST",
        body: JSON.stringify(review),
      }
    );
  }

  async createIssueComment(
    owner: string,
    repo: string,
    prNumber: number,
    body: string
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      }
    );
  }

  async getIssueComments(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<IssueComment[]> {
    type RawIssueComment = { id: number; user?: { login: string; id: number; avatar_url: string; html_url: string } | null; body: string; created_at: string };
    const raw = await this.paginateRequest<RawIssueComment>(`/repos/${owner}/${repo}/issues/${prNumber}/comments`);
    return raw.map((c) => ({
      id: c.id,
      author: {
        login: c.user?.login ?? "unknown",
        id: c.user?.id ?? 0,
        avatarUrl: c.user?.avatar_url ?? "",
        url: c.user?.html_url ?? "",
      },
      body: c.body,
      createdAt: c.created_at,
    }));
  }

  async getContributors(owner: string, repo: string): Promise<Contributor[]> {
    return this.paginateRequest<Contributor>(`/repos/${owner}/${repo}/contributors`, 100);
  }

  async getRepo(owner: string, repo: string): Promise<Repository> {
    const cacheKey = LRUCache.keyRepo(owner, repo);
    const cached = this.cache.get<Repository>(cacheKey);
    if (cached) return cached;

    const result = await this.request<Repository>(`/repos/${owner}/${repo}`);
    this.cache.set(cacheKey, result, 600_000);
    return result;
  }

  /** Invalidate all cached entries whose key contains `:{owner}:{repo}:` or `:{owner}:{repo}`. */
  invalidateRepo(owner: string, repo: string): void {
    const prefix = `:${owner}:${repo}`;
    this.cache.invalidatePattern((key) => key.includes(prefix));
  }

  /** Return cache statistics for monitoring / metrics exposure. */
  getCacheStats(): CacheStats {
    return this.cache.stats();
  }

  /**
   * Search for PRs reviewed by a user via GitHub Search API.
   * Returns PullRequest objects with available fields; fields absent from
   * search results (head, base, files, etc.) use safe defaults.
   */
  private async searchPRsReviewedBy(
    owner: string,
    repo: string,
    username: string,
    since?: string,
    maxPages: number = 10
  ): Promise<PullRequest[]> {
    const allItems: PullRequest[] = [];
    const perPage = 100;

    let query = `is:pr reviewed-by:${username} repo:${owner}/${repo}`;
    if (since) {
      query += ` updated:>=${since}`;
    }

    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: String(perPage),
        page: String(page),
      });

      const data = await this.request<{
        total_count: number;
        incomplete_results: boolean;
        items: Array<{
          id: number;
          number: number;
          title: string;
          body: string | null;
          state: string;
          draft: boolean;
          user: { login: string; id: number; avatar_url: string; html_url: string };
          created_at: string;
          updated_at: string;
          html_url: string;
          pull_request?: { url: string };
        }>;
      }>(`/search/issues?${params.toString()}`);

      for (const item of data.items) {
        if (!item.pull_request) continue;
        allItems.push({
          id: item.id,
          number: item.number,
          title: item.title,
          body: item.body ?? "",
          state: item.state === "closed" ? "closed" : "open",
          draft: item.draft,
          author: {
            login: item.user.login,
            id: item.user.id,
            avatarUrl: item.user.avatar_url,
            url: item.user.html_url,
          },
          base: { label: "", ref: "", sha: "", repo: { owner: { login: "", id: 0, avatarUrl: "", url: "" }, name: "", fullName: "" } },
          head: { label: "", ref: "", sha: "", repo: { owner: { login: "", id: 0, avatarUrl: "", url: "" }, name: "", fullName: "" } },
          files: [],
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
          url: item.html_url,
        });
      }

      if (data.items.length < perPage) break;
    }

    return allItems;
  }

  async getPRsReviewedBy(
    owner: string,
    repo: string,
    username: string,
    since?: string,
    maxResults?: number
  ): Promise<{ pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[]; issueComments: IssueComment[] }[]> {
    const TIMEOUT_MS = 60_000;
    const MAX_CONCURRENT = 5;
    const startTime = Date.now();
    const results: { pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[]; issueComments: IssueComment[] }[] = [];

    // Phase 1: Use Search API to find PRs reviewed by the user
    let prsToCheck: PullRequest[];
    try {
      prsToCheck = await this.searchPRsReviewedBy(owner, repo, username, since);
      logger.info(`Search API found ${prsToCheck.length} PRs reviewed by ${username} in ${owner}/${repo}`);
    } catch {
      logger.warn(`Search API failed for ${username} in ${owner}/${repo}, falling back to full scan`);
      return this.getPRsReviewedByFullScan(owner, repo, username, since, maxResults);
    }

    // Double-check createdAt filter (search API updated:>= is approximate)
    const sinceDate = since ? new Date(since) : null;
    if (sinceDate) {
      prsToCheck = prsToCheck.filter((pr) => new Date(pr.createdAt) >= sinceDate);
    }

    // Pre-slice to limit total API calls for detail fetching
    if (maxResults !== undefined) {
      prsToCheck = prsToCheck.slice(0, maxResults * 2);
    }

    // Phase 2: Fetch reviews/comments concurrently with rate limiting
    const limit = createConcurrencyLimiter(MAX_CONCURRENT);
    let aborted = false;

    const detailPromises = prsToCheck.map((pr) =>
      limit(async () => {
        if (aborted) return;
        if (Date.now() - startTime > TIMEOUT_MS) {
          aborted = true;
          return;
        }

        try {
          const [reviews, comments, issueComments] = await Promise.all([
            this.getReviews(owner, repo, pr.number),
            this.getReviewComments(owner, repo, pr.number),
            this.getIssueComments(owner, repo, pr.number),
          ]);

          if (aborted) return;

          const userReviews = reviews.filter((r) => r.author?.login === username);
          const userComments = comments.filter((c) => c.author?.login === username);
          const userIssueComments = issueComments.filter((c) => c.author?.login === username);

          if (userReviews.length > 0 || userComments.length > 0 || userIssueComments.length > 0) {
            results.push({ pr, reviews: userReviews, comments: userComments, issueComments: userIssueComments });
          }
        } catch (error) {
          logger.warn(`Failed to fetch details for PR #${pr.number}: ${getErrorMessage(error)}`);
        }
      })
    );

    await Promise.allSettled(detailPromises);

    if (aborted) {
      logger.warn(`getPRsReviewedBy timed out after ${TIMEOUT_MS}ms, returning ${results.length} partial results`);
    }

    // Sort by most recently updated
    results.sort((a, b) => new Date(b.pr.updatedAt).getTime() - new Date(a.pr.updatedAt).getTime());

    if (maxResults !== undefined && results.length > maxResults) {
      return results.slice(0, maxResults);
    }

    return results;
  }

  /**
   * Full-scan fallback: iterates all PRs page by page.
   * Used when Search API is unavailable (e.g., secondary rate limit).
   */
  private async getPRsReviewedByFullScan(
    owner: string,
    repo: string,
    username: string,
    since?: string,
    maxResults?: number
  ): Promise<{ pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[]; issueComments: IssueComment[] }[]> {
    const TIMEOUT_MS = 60_000;
    const MAX_CONCURRENT = 5;
    const startTime = Date.now();
    const sinceDate = since ? new Date(since) : null;
    const results: { pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[]; issueComments: IssueComment[] }[] = [];

    const limit = createConcurrencyLimiter(MAX_CONCURRENT);
    let page = 1;
    const perPage = 100;

    while (page <= this.maxPages) {
      if (Date.now() - startTime > TIMEOUT_MS) {
        logger.warn(`getPRsReviewedByFullScan timed out, returning ${results.length} partial results`);
        break;
      }
      if (maxResults !== undefined && results.length >= maxResults) break;

      const prs = await this.listPRs(owner, repo, { state: "all", perPage, page });
      if (prs.length === 0) break;

      const filteredPrs = sinceDate
        ? prs.filter((pr) => new Date(pr.createdAt) >= sinceDate)
        : prs;

      const pagePromises = filteredPrs.map((pr) =>
        limit(async () => {
          if (Date.now() - startTime > TIMEOUT_MS) return;
          if (maxResults !== undefined && results.length >= maxResults) return;

          try {
            const [reviews, comments, issueComments] = await Promise.all([
              this.getReviews(owner, repo, pr.number),
              this.getReviewComments(owner, repo, pr.number),
              this.getIssueComments(owner, repo, pr.number),
            ]);

            const userReviews = reviews.filter((r) => r.author?.login === username);
            const userComments = comments.filter((c) => c.author?.login === username);
            const userIssueComments = issueComments.filter((c) => c.author?.login === username);

            if (userReviews.length > 0 || userComments.length > 0 || userIssueComments.length > 0) {
              results.push({ pr, reviews: userReviews, comments: userComments, issueComments: userIssueComments });
            }
          } catch (error) {
            logger.warn(`Failed to fetch details for PR #${pr.number}: ${getErrorMessage(error)}`);
          }
        })
      );

      await Promise.allSettled(pagePromises);

      if (prs.length < perPage) break;
      page++;
    }

    return results;
  }

  static verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expected = `sha256=${crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      logger.warn("Webhook signature verification failed: signature length mismatch");
      return false;
    }
  }

  static parseWebhookEvent(
    headers: Record<string, string>,
    body: unknown
  ): WebhookEvent {
    const eventType = headers["x-github-event"];
    if (!eventType) throw new Error("Missing X-GitHub-Event header");

    const data = body as Record<string, unknown>;
    const action = data.action as string;

    if (!data.sender || !data.repository) {
      throw new Error("Webhook payload missing required sender or repository field");
    }

    const sender = data.sender as { login: string; id: number; avatar_url: string; html_url: string };
    const repository = data.repository as {
      id: number;
      owner: { login: string; id: number; avatar_url: string; html_url?: string };
      name: string;
      full_name: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      html_url: string;
      language: string | null;
      stargazers_count: number;
      forks_count: number;
    };

    const event: WebhookEvent = {
      action,
      type: eventType as WebhookEvent["type"],
      repository: {
        id: repository.id,
        owner: {
          login: repository.owner.login,
          id: repository.owner.id,
          avatarUrl: repository.owner.avatar_url,
          url: repository.owner.html_url ?? repository.owner.avatar_url,
        },
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        private: repository.private,
        defaultBranch: repository.default_branch,
        url: repository.html_url,
        language: repository.language,
        stargazersCount: repository.stargazers_count,
        forksCount: repository.forks_count,
      },
      sender: {
        login: sender.login,
        id: sender.id,
        avatarUrl: sender.avatar_url,
        url: sender.html_url,
      },
    };

    if (eventType === "pull_request" && data.pull_request) {
      event.pullRequest = data.pull_request as PullRequest;
    }

    if (eventType === "issue_comment" && data.comment) {
      const comment = data.comment as { id: number; body: string; user?: { login: string; id?: number; avatar_url?: string; html_url?: string } };
      event.comment = {
        id: comment.id,
        body: comment.body,
        author: {
          login: comment.user?.login ?? "unknown",
          id: comment.user?.id ?? 0,
          avatarUrl: comment.user?.avatar_url ?? "",
          url: comment.user?.html_url ?? "",
        },
      };
    }

    return event;
  }
}
