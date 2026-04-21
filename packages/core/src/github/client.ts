import crypto from "node:crypto";
import { SignJWT, importPKCS8 } from "jose";
import { getErrorMessage, Logger, sleep } from "../utils/index.js";

const logger = new Logger("github-client");
import type {
  PullRequest,
  PRFile,
  ReviewComment,
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

  constructor(token: string, appCredentials?: { appId: string; privateKey: string; installationId: string }, maxPages = 10) {
    this.token = token;
    this.maxPages = maxPages;
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

  private async request<T>(
    path: string,
    options: RequestInit = {}
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

    if (this.rateLimitRemaining <= 0 && await this.waitForRateLimitReset()) {
      return this.request<T>(path, options);
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
      // Check rate limit before each page request
      await this.waitForRateLimitReset();

      // Add page and per_page parameters to the path
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
    const params = new URLSearchParams();
    if (opts.state) params.set("state", opts.state);
    params.set("per_page", String(opts.perPage || 30));
    if (opts.page) params.set("page", String(opts.page));

    if (opts.page) {
      return this.request<PullRequest[]>(`/repos/${owner}/${repo}/pulls?${params}`);
    }

    return this.paginateRequest<PullRequest>(`/repos/${owner}/${repo}/pulls?${params.toString()}`, opts.perPage || 30);
  }

  async getPR(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    return this.request<PullRequest>(
      `/repos/${owner}/${repo}/pulls/${prNumber}`
    );
  }

  async getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]> {
    return this.request<PRFile[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`
    );
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

  async getContributors(owner: string, repo: string): Promise<Contributor[]> {
    return this.paginateRequest<Contributor>(`/repos/${owner}/${repo}/contributors`, 100);
  }

  async getRepo(owner: string, repo: string): Promise<Repository> {
    return this.request<Repository>(`/repos/${owner}/${repo}`);
  }

  async getPRsReviewedBy(
    owner: string,
    repo: string,
    username: string,
    since?: string
  ): Promise<{ pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[] }[]> {
    const prs = await this.listPRs(owner, repo, { state: "all", perPage: 100 });
    const sinceDate = since ? new Date(since) : null;
    const results: { pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[] }[] = [];

    const filteredPrs = sinceDate
      ? prs.filter((pr) => new Date(pr.createdAt) >= sinceDate)
      : prs;

    for (const pr of filteredPrs) {
      const [reviews, comments] = await Promise.all([
        this.getReviews(owner, repo, pr.number),
        this.getReviewComments(owner, repo, pr.number),
      ]);

      const userReviews = reviews.filter((r) => r.author.login === username);
      const userComments = comments.filter((c) => c.author.login === username);

      if (userReviews.length > 0 || userComments.length > 0) {
        results.push({ pr, reviews: userReviews, comments: userComments });
      }
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
