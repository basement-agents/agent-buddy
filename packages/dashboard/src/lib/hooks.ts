import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSuspenseQuery, useMutation as useRQMutation } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const NAV_EVENT = "app:navigate";

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent(NAV_EVENT));
}

export function useNavigate(): typeof navigate {
  return navigate;
}

export function usePageParam(): [number, (page: number) => void] {
  const pageFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const p = parseInt(params.get("page") ?? "1", 10);
    return Number.isFinite(p) && p >= 1 ? p : 1;
  }, []);

  const [page, setPage] = useState(pageFromUrl);

  const setPageWithUrl = useCallback((newPage: number) => {
    setPage(newPage);
    const params = new URLSearchParams(window.location.search);
    if (newPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(newPage));
    }
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

  useEffect(() => {
    const syncPage = () => {
      const params = new URLSearchParams(window.location.search);
      const p = parseInt(params.get("page") ?? "1", 10);
      const valid = Number.isFinite(p) && p >= 1 ? p : 1;
      setPage(valid);
    };
    window.addEventListener("popstate", syncPage);
    window.addEventListener(NAV_EVENT, syncPage);
    return () => {
      window.removeEventListener("popstate", syncPage);
      window.removeEventListener(NAV_EVENT, syncPage);
    };
  }, []);

  return [page, setPageWithUrl];
}

export const queryKeys = {
  repos: (params?: { page?: number; limit?: number }) => ["repos", params?.page ?? 1, params?.limit ?? 20] as const,
  buddies: (params?: { page?: number; limit?: number }) => ["buddies", params?.page ?? 1, params?.limit ?? 20] as const,
  buddy: (id: string) => ["buddy", id] as const,
  buddyFeedback: (id: string) => ["buddy-feedback", id] as const,
  buddyComparison: (id1: string, id2: string) => ["buddy-comparison", id1, id2] as const,
  reviews: (params?: Record<string, unknown>) => ["reviews", params ?? {}] as const,
  review: (key: { owner: string; repo: string; prNumber: number } | null) =>
    key ? ["review", key.owner, key.repo, key.prNumber] as const : ["review", "none"] as const,
  analytics: () => ["analytics"] as const,
  metrics: (params?: { since?: string; until?: string }) => ["metrics", params?.since ?? "", params?.until ?? ""] as const,
  repoConfig: (repoId: string) => ["repo-config", repoId] as const,
  repoRules: (repoId: string) => ["repo-rules", repoId] as const,
  repoSchedule: (repoId: string) => ["repo-schedule", repoId] as const,
  repoOpenPRs: (owner: string, repo: string) => ["repo-open-prs", owner, repo] as const,
};

export function useRepos(params?: { page?: number; limit?: number }) {
  return useSuspenseQuery({
    queryKey: queryKeys.repos(params),
    queryFn: ({ signal }) => api.listRepos(params, signal),
  });
}

export function useBuddies(params?: { page?: number; limit?: number }) {
  return useSuspenseQuery({
    queryKey: queryKeys.buddies(params),
    queryFn: ({ signal }) => api.listBuddies(params, signal),
  });
}

export function useBuddy(id: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.buddy(id),
    queryFn: ({ signal }) => api.getBuddy(id, signal),
  });
}

export function useBuddyFeedback(buddyId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.buddyFeedback(buddyId),
    queryFn: ({ signal }) => api.getBuddyFeedback(buddyId, signal),
  });
}

export function useBuddyComparison(id1: string, id2: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.buddyComparison(id1, id2),
    queryFn: ({ signal }) => api.compareBuddies(id1, id2, signal),
  });
}

export function useReviews(params?: { repo?: string; buddy?: string; status?: string; since?: string; until?: string; page?: number; limit?: number }) {
  return useSuspenseQuery({
    queryKey: queryKeys.reviews(params),
    queryFn: ({ signal }) => api.listReviews(params, signal),
  });
}

export function useReview(reviewIndex: string | undefined) {
  const parsed = useMemo(() => {
    if (!reviewIndex) return null;
    const parts = reviewIndex.split("-");
    if (parts.length < 3) return null;
    const prNumber = parseInt(parts[parts.length - 1], 10);
    if (isNaN(prNumber)) return null;
    return { owner: parts.slice(0, -2).join("-"), repo: parts[parts.length - 2], prNumber };
  }, [reviewIndex]);

  return useSuspenseQuery({
    queryKey: queryKeys.review(parsed),
    queryFn: ({ signal }) => {
      if (!parsed) throw new Error("Invalid review index");
      return api.getReview(parsed.owner, parsed.repo, parsed.prNumber, signal);
    },
  });
}

export function useAnalytics() {
  return useSuspenseQuery({
    queryKey: queryKeys.analytics(),
    queryFn: ({ signal }) => api.getAnalytics(signal),
  });
}

export function useMetrics(params?: { since?: string; until?: string }) {
  return useSuspenseQuery({
    queryKey: queryKeys.metrics(params),
    queryFn: ({ signal }) => api.getMetrics(params, signal),
  });
}

export function useRepoRules(repoId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.repoRules(repoId),
    queryFn: ({ signal }) => api.getRepoRules(repoId, signal),
  });
}

export function useRepoSchedule(repoId: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.repoSchedule(repoId),
    queryFn: ({ signal }) => api.getRepoSchedule(repoId, signal),
  });
}

export function useRepoOpenPRs(owner: string, repo: string) {
  return useSuspenseQuery({
    queryKey: queryKeys.repoOpenPRs(owner, repo),
    queryFn: ({ signal }) => api.listOpenPRs(owner, repo, signal),
  });
}

export function useMutation<T, A extends unknown[]>(
  mutator: (...args: A) => Promise<T>
): { execute: (...args: A) => Promise<T>; loading: boolean; error: string | null } {
  const mutation = useRQMutation({
    mutationFn: (args: A) => mutator(...args),
  });

  const execute = useCallback(
    async (...args: A): Promise<T> => {
      return mutation.mutateAsync(args);
    },
    [mutation]
  );

  const error = mutation.error
    ? mutation.error instanceof ApiError
      ? mutation.error.message
      : "An error occurred"
    : null;

  return { execute, loading: mutation.isPending, error };
}

export interface JobProgress {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  progressStage?: string;
  progressDetail?: string;
  progressPercentage?: number;
  elapsedMs?: number;
  subStep?: string;
  currentModel?: string;
  error?: string;
}

const PROGRESS_STATUSES = ["queued", "running", "completed", "failed"] as const;

function isJobProgress(data: unknown): data is JobProgress {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string" && typeof obj.status === "string" && PROGRESS_STATUSES.includes(obj.status as typeof PROGRESS_STATUSES[number]);
}

export interface UseJobProgressResult {
  progress: JobProgress | null;
  isConnected: boolean;
  reconnecting: boolean;
}

export function useJobProgress(jobId: string | null): UseJobProgressResult {
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const progressRef = useRef<JobProgress | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRetries = 5;
  const baseDelay = 1000;
  const maxDelay = 16000;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsConnected(false);
    setReconnecting(false);
  }, []);

  const getBackoffDelay = useCallback((retryCount: number) => {
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  }, []);

  useEffect(() => {
    cleanup();

    if (!jobId) {
      setProgress(null);
      retryCountRef.current = 0;
      return;
    }

    const createConnection = () => {
      if (progressRef.current?.status === "completed" || progressRef.current?.status === "failed") {
        return;
      }

      const eventSource = new EventSource(`/api/jobs/${jobId}/progress`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setReconnecting(false);
        retryCountRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!isJobProgress(parsed)) {
            console.error("Invalid SSE progress data: missing id or status");
            return;
          }
          progressRef.current = parsed;
          setProgress(parsed);

          if (parsed.status === "completed" || parsed.status === "failed") {
            eventSource.close();
            setIsConnected(false);
            eventSourceRef.current = null;
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setReconnecting(false);
          }
        } catch (err) {
          console.error("Failed to parse SSE data:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE connection error:", err);
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        if (progressRef.current?.status === "completed" || progressRef.current?.status === "failed") {
          setReconnecting(false);
          return;
        }

        if (retryCountRef.current < maxRetries) {
          setReconnecting(true);
          const delay = getBackoffDelay(retryCountRef.current);

          timeoutRef.current = setTimeout(() => {
            retryCountRef.current += 1;
            createConnection();
          }, delay);
        } else {
          setReconnecting(false);
        }
      };
    };

    createConnection();

    return cleanup;
  }, [jobId]);

  return { progress, isConnected, reconnecting };
}
