const API_BASE = "/api";
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

function repoPath(repoId: string): string {
  const [owner, repo] = repoId.split("/");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
    public isRateLimit: boolean = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestOptions = {}, retryCount = 0): Promise<T> {
  const { method = "GET", body, headers = {}, signal } = options;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request cancelled");
    }
    throw new ApiError(0, "Network error");
  }

  if (!res.ok) {
    const requestId = res.headers.get("X-Request-Id") || undefined;
    const retryAfter = res.headers.get("Retry-After");
    const isRateLimit = res.status === 429;

    if (res.status >= 500 && res.status < 600 && retryCount < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * Math.pow(2, retryCount)));
      return request<T>(path, options, retryCount + 1);
    }

    const errorBody = await res.json().catch(() => ({ error: "Request failed" }));
    throw new ApiError(
      res.status,
      errorBody.error || `HTTP ${res.status}`,
      requestId,
      isRateLimit,
      retryAfter ? parseInt(retryAfter, 10) : undefined
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: (signal?: AbortSignal) => request<{ status: string }>("/health", { signal }),

  testLLM: (signal?: AbortSignal) =>
    request<LLMTestResult>("/settings/llm/test", { method: "POST", signal }),

  getSettings: (signal?: AbortSignal) => request<SettingsData>("/settings", { signal }),
  updateSettings: (settings: Partial<SettingsData>, signal?: AbortSignal) =>
    request<{ saved: boolean }>("/settings", { method: "PATCH", body: settings, signal }),

  listRepos: (params?: { page?: number; limit?: number }, signal?: AbortSignal) =>
    request<PaginatedResponse<RepoConfig>>(`/repos${buildQuery(params)}`, { signal }),
  addRepo: (owner: string, repo: string, buddyId?: string, signal?: AbortSignal) =>
    request<RepoConfig>("/repos", { method: "POST", body: { owner, repo, buddyId }, signal }),
  removeRepo: (id: string, signal?: AbortSignal) =>
    request<{ deleted: string }>(repoPath(id), { method: "DELETE", signal }),
  updateRepo: (id: string, data: Partial<RepoConfig>, signal?: AbortSignal) =>
    request<RepoConfig>(repoPath(id), { method: "PATCH", body: data, signal }),

  listBuddies: (params?: { page?: number; limit?: number }, signal?: AbortSignal) =>
    request<PaginatedResponse<BuddySummary>>(`/buddies${buildQuery(params)}`, { signal }),
  getBuddy: (id: string, signal?: AbortSignal) => request<BuddyProfile>(`/buddies/${encodeURIComponent(id)}`, { signal }),
  createBuddy: (username: string, repo: string, maxPrs?: number, signal?: AbortSignal) =>
    request<{ jobId: string }>("/buddies", { method: "POST", body: { username, repo, maxPrs }, signal }),
  deleteBuddy: (id: string, signal?: AbortSignal) => request<{ deleted: string }>(`/buddies/${encodeURIComponent(id)}`, { method: "DELETE", signal }),
  updateBuddy: (id: string, repo?: string, signal?: AbortSignal) =>
    request<{ jobId: string }>(`/buddies/${encodeURIComponent(id)}/update`, { method: "POST", body: { repo }, signal }),
  getBuddyStatus: (id: string, signal?: AbortSignal) => request<{ status: string; progress?: string; error?: string }>(`/buddies/${encodeURIComponent(id)}/status`, { signal }),
  exportBuddy: (id: string, signal?: AbortSignal) => request<Record<string, unknown>>(`/buddies/${encodeURIComponent(id)}/export`, { signal }),
  importBuddy: (profile: string, newId?: string, signal?: AbortSignal) =>
    request<{ imported: boolean; id: string }>("/buddies/import", { method: "POST", body: { profile, newId }, signal }),

  getReview: (owner: string, repo: string, prNumber: number, signal?: AbortSignal) =>
    request<CodeReview>(`/reviews/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${prNumber}`, { signal }),
  listReviews: (params?: { repo?: string; buddy?: string; status?: string; since?: string; until?: string; page?: number; limit?: number }, signal?: AbortSignal) =>
    request<PaginatedResponse<CodeReview> & { reviews: CodeReview[] }>(`/reviews${buildQuery(params)}`, { signal }),
  triggerReview: (owner: string, repo: string, prNumber: number, buddyId?: string, reviewType?: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams();
    if (buddyId) qs.set("buddyId", buddyId);
    return request<{ message: string; buddyIds: string[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/reviews${qs ? `?${qs}` : ""}`,
      { method: "POST", body: { prNumber, reviewType }, signal }
    );
  },

  getJob: (jobId: string, signal?: AbortSignal) => request<ReviewJob | AnalysisJob>(`/jobs/${jobId}`, { signal }),

  listOpenPRs: (owner: string, repo: string, signal?: AbortSignal) =>
    request<OpenPR[]>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/prs`, { signal }),

  getRepoRules: (repoId: string, signal?: AbortSignal) =>
    request<CustomRule[]>(`${repoPath(repoId)}/rules`, { signal }),
  addRepoRule: (repoId: string, rule: Omit<CustomRule, "id">, signal?: AbortSignal) =>
    request<CustomRule>(`${repoPath(repoId)}/rules`, { method: "POST", body: rule, signal }),
  deleteRepoRule: (repoId: string, ruleId: string, signal?: AbortSignal) =>
    request<{ deleted: string }>(`${repoPath(repoId)}/rules/${encodeURIComponent(ruleId)}`, { method: "DELETE", signal }),
  updateRepoRule: (repoId: string, ruleId: string, data: Partial<Omit<CustomRule, "id">>, signal?: AbortSignal) =>
    request<{ rule: CustomRule }>(`${repoPath(repoId)}/rules/${encodeURIComponent(ruleId)}`, { method: "PATCH", body: data, signal }),

  getRepoSchedule: (repoId: string, signal?: AbortSignal) =>
    request<ScheduleConfig>(`${repoPath(repoId)}/schedule`, { signal }),
  updateRepoSchedule: (repoId: string, config: Partial<ScheduleConfig>, signal?: AbortSignal) =>
    request<ScheduleConfig>(`${repoPath(repoId)}/schedule`, { method: "PATCH", body: config, signal }),

  getBuddyFeedback: (buddyId: string, signal?: AbortSignal) => request<BuddyFeedback>(`/buddies/${encodeURIComponent(buddyId)}/feedback`, { signal }),
  submitFeedback: (buddyId: string, data: { reviewId: string; commentId: string; wasHelpful: boolean; userResponse?: string }, signal?: AbortSignal) =>
    request<{ recorded: boolean }>(`/buddies/${encodeURIComponent(buddyId)}/feedback`, { method: "POST", body: data, signal }),
  compareBuddies: (id1: string, id2: string, signal?: AbortSignal) =>
    request<{
      score: number;
      sharedKeywords: string[];
      sharedRepos: string[];
      soulOverlap: number;
      analysis: {
        philosophySimilarity: number;
        expertiseOverlap: number;
        commonPatterns: string[];
      };
    }>(`/buddies/${encodeURIComponent(id1)}/compare/${encodeURIComponent(id2)}`, { signal }),

  getJobStatus: (jobId: string, signal?: AbortSignal) => request<JobStatus>(`/jobs/${encodeURIComponent(jobId)}/status`, { signal }),

  getAnalytics: (signal?: AbortSignal) => request<AnalyticsData>("/analytics", { signal }),

  getMetrics: (params?: { since?: string; until?: string }, signal?: AbortSignal) =>
    request<MetricsData>(`/metrics${buildQuery(params)}`, { signal }),

  search: (query: string, signal?: AbortSignal) =>
    request<{ repos: { id: string; owner: string; repo: string }[]; buddies: { id: string; username: string }[]; reviews: { owner: string; repo: string; prNumber: number; summary: string }[] }>(`/search?q=${encodeURIComponent(query)}`, { signal }),

  listJobs: (params?: { page?: number; limit?: number; status?: string; repoId?: string }, signal?: AbortSignal) =>
    request<PaginatedResponse<JobListItem>>(`/jobs${buildQuery(params)}`, { signal }),

  cancelJob: (jobId: string, signal?: AbortSignal) =>
    request<{ success: boolean; jobId: string; status: string }>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", signal }),

  connectToJobProgress: (jobId: string, onMessage: (data: ReviewJob | AnalysisJob) => void, onError?: (error: Error) => void): (() => void) => {
    if (typeof EventSource === "undefined") {
      if (onError) {
        onError(new Error("EventSource is not supported in this environment"));
      }
      return () => {};
    }

    const MAX_RETRIES = 5;
    const BASE_DELAY = 1000;
    const MAX_DELAY = 16000;
    let retryCount = 0;
    let eventSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let lastStatus: string | undefined;

    function cleanup() {
      closed = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function connect() {
      if (closed) return;

      eventSource = new EventSource(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/progress`);

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!isJobData(parsed)) {
            console.error("Invalid SSE job data: missing id or status");
            return;
          }
          lastStatus = parsed.status;
          onMessage(parsed);

          if (parsed.status === "completed" || parsed.status === "failed") {
            cleanup();
          }
        } catch (error) {
          console.error("Failed to parse SSE message:", error);
          if (onError) {
            onError(error instanceof Error ? error : new Error("Failed to parse server message"));
          }
        }
      };

      eventSource.onerror = () => {
        console.error("SSE connection error");
        eventSource?.close();
        eventSource = null;

        if (closed || lastStatus === "completed" || lastStatus === "failed") return;

        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
          retryCount++;
          retryTimer = setTimeout(connect, delay);
        } else if (onError) {
          onError(new Error("SSE connection failed after maximum retries"));
        }
      };
    }

    connect();
    return cleanup;
  },
};

export { ApiError };

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface JobListItem {
  id: string;
  type: "review" | "analysis";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  repoId: string;
  buddyId?: string;
  prNumber?: number;
  progressPercentage?: number;
  progressStage?: string;
  progressDetail?: string;
  elapsedMs?: number;
  subStep?: string;
  currentModel?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RepoConfig {
  id: string;
  owner: string;
  repo: string;
  buddyId?: string;
  buddies?: string[];
  autoReview: boolean;
  triggerMode: string;
}

export interface BuddySummary {
  id: string;
  username: string;
  sourceRepos: string[];
  totalReviews: number;
  lastUpdated: string;
}

export interface BuddyProfile {
  id: string;
  username: string;
  soul: string;
  user: string;
  memory: string;
  sourceRepos: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CodeReview {
  summary: string;
  state: string;
  comments: ReviewComment[];
  buddyId?: string;
  reviewedAt: string;
  metadata: {
    prNumber: number;
    repo: string;
    owner: string;
    reviewType: string;
    llmModel: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    durationMs: number;
    jobId?: string;
  };
  diff?: string;
}

export interface ReviewComment {
  id: string;
  path: string;
  line?: number;
  startLine?: number;
  body: string;
  severity: string;
  category: string;
  suggestion?: string;
}

const JOB_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

function isJobData(data: unknown): data is ReviewJob | AnalysisJob {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.status === "string" && JOB_STATUSES.includes(obj.status as typeof JOB_STATUSES[number]);
}

export interface ReviewJob {
  id: string;
  repoId: string;
  prNumber: number;
  buddyId?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: CodeReview;
  error?: string;
  createdAt: string;
  completedAt?: string;
  progressPercentage?: number;
  progressStage?: string;
  progressDetail?: string;
  elapsedMs?: number;
  subStep?: string;
  currentModel?: string;
}

export interface AnalysisJob {
  id: string;
  buddyId: string;
  repo: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: string;
  progressStage?: string;
  progressPercentage?: number;
  progressDetail?: string;
  elapsedMs?: number;
  subStep?: string;
  currentModel?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CustomRule {
  id: string;
  name: string;
  pattern: string;
  severity: "info" | "suggestion" | "warning" | "error";
  enabled: boolean;
  category?: string;
}

export interface ScheduleConfig {
  enabled: boolean;
  interval?: number;
  lastRun?: string;
  nextRun?: string;
}

export interface BuddyFeedback {
  helpfulCount: number;
  notHelpfulCount: number;
  recentFeedback: FeedbackEntry[];
}

export interface FeedbackEntry {
  id: string;
  reviewId: string;
  helpful: boolean;
  comment?: string;
  createdAt: string;
}

export interface OpenPR {
  number: number;
  title: string;
  author: string;
  createdAt: string;
  url: string;
  state: string;
}

export interface JobStatus {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AnalyticsData {
  reviewsLast7Days: number;
  reviewsLast30Days: number;
  averageTurnaroundTimeMs: number;
  averageTurnaroundTimeSeconds: number;
  perBuddyCounts: Record<string, number>;
  perRepoCounts: Record<string, number>;
  reviewStates: Record<string, number>;
  totalReviews: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  webhookSecret: string;
  apiKey?: string;
}

export interface ReviewSettingsConfig {
  defaultSeverity: "info" | "suggestion" | "warning" | "error";
  maxComments: number;
  autoApproveBelow: boolean;
  reviewDelaySeconds: number;
  quietHours?: { start: string; end: string; timezone: string };
}

export interface SettingsData {
  githubToken: string;
  server?: ServerConfig;
  review?: ReviewSettingsConfig;
  llm?: LLMProviderSettings;
}

export interface LLMProviderSettings {
  provider: "anthropic" | "openrouter" | "openai";
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
}

export interface LLMTestResult {
  success: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface MetricsData {
  totalReviews: number;
  completedReviews: number;
  errorCount: number;
  errorRate: number;
  averageDurationMs: number;
  averageTokensPerReview: number;
  perBuddy: Record<string, { reviews: number; avgDurationMs: number; states: Record<string, number> }>;
  perRepo: Record<string, { reviews: number; avgDurationMs: number; states: Record<string, number> }>;
  since: string | null;
  until: string | null;
}
