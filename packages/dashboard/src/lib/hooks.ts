import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const p = parseInt(params.get("page") ?? "1", 10);
      const valid = Number.isFinite(p) && p >= 1 ? p : 1;
      setPage(valid);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return [page, setPageWithUrl];
}

interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useQuery<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  deps: unknown[] = []
): UseQueryResult<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    const abortController = new AbortController();

    fetcher(abortController.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err instanceof ApiError ? err.message : "An error occurred");
        }
      })
      .finally(() => setLoading(false));

    return () => abortController.abort();
  }, deps);

  useEffect(() => {
    const cleanup = fetch();
    return cleanup;
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useRepos(params?: { page?: number; limit?: number }) {
  return useQuery(() => api.listRepos(params), [params?.page, params?.limit]);
}

export function useBuddies(params?: { page?: number; limit?: number }) {
  return useQuery(() => api.listBuddies(params), [params?.page, params?.limit]);
}

export function useBuddy(id: string | undefined) {
  return useQuery(() => {
    if (!id) return Promise.reject(new Error("Buddy ID is required"));
    return api.getBuddy(id);
  }, [id]);
}

export function useBuddyFeedback(buddyId: string | undefined) {
  return useQuery(() => {
    if (!buddyId) return Promise.reject(new Error("Buddy ID is required"));
    return api.getBuddyFeedback(buddyId);
  }, [buddyId]);
}

export function useBuddyComparison(id1: string, id2: string) {
  return useQuery(() => api.compareBuddies(id1, id2), [id1, id2]);
}

export function useReviews(params?: { repo?: string; buddy?: string; status?: string; since?: string; until?: string; page?: number; limit?: number }) {
  return useQuery(() => api.listReviews(params), [params?.repo, params?.buddy, params?.status, params?.since, params?.until, params?.page, params?.limit]);
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

  return useQuery(
    () => {
      if (!parsed) return Promise.reject(new Error("Invalid review index"));
      return api.getReview(parsed.owner, parsed.repo, parsed.prNumber);
    },
    [parsed?.owner, parsed?.repo, parsed?.prNumber]
  );
}

export function useAnalytics() {
  return useQuery(() => api.getAnalytics());
}

export function useMetrics(params?: { since?: string; until?: string }) {
  return useQuery(() => api.getMetrics(params), [params?.since, params?.until]);
}

export function useMutation<T, A extends unknown[]>(
  mutator: (...args: A) => Promise<T>
): { execute: (...args: A) => Promise<T>; loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (...args: A): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(...args);
        return result;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : "An error occurred";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [mutator]
  );

  return { execute, loading, error };
}

export interface JobProgress {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: number;
  progressStage?: string;
  progressDetail?: string;
  progressPercentage?: number;
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

  // Clean up connection and timeout
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

  // Calculate exponential backoff delay
  const getBackoffDelay = useCallback((retryCount: number) => {
    return Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  }, []);

  useEffect(() => {
    // Clean up previous connection if jobId changes or component unmounts
    cleanup();

    // Reset state when jobId is null or changes
    if (!jobId) {
      setProgress(null);
      retryCountRef.current = 0;
      return;
    }

    // Create SSE connection
    const createConnection = () => {
      // Don't reconnect if job has already completed/failed
      // Check current progress state via ref to avoid stale closure
      if (progressRef.current?.status === "completed" || progressRef.current?.status === "failed") {
        return;
      }

      const eventSource = new EventSource(`/api/jobs/${jobId}/progress`);
      eventSourceRef.current = eventSource;

      // Connection opened
      eventSource.onopen = () => {
        setIsConnected(true);
        setReconnecting(false);
        // Reset retry count on successful connection
        retryCountRef.current = 0;
      };

      // Handle incoming progress events
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!isJobProgress(parsed)) {
            console.error("Invalid SSE progress data: missing id or status");
            return;
          }
          progressRef.current = parsed;
          setProgress(parsed);

          // Close connection when job reaches terminal state
          if (parsed.status === "completed" || parsed.status === "failed") {
            eventSource.close();
            setIsConnected(false);
            eventSourceRef.current = null;
            // Cancel any pending reconnection attempts
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
            setReconnecting(false);
          }
        } catch (err) {
          // Malformed JSON - log but don't break the hook
          console.error("Failed to parse SSE data:", err);
        }
      };

      // Handle connection errors with reconnection logic
      eventSource.onerror = (err) => {
        console.error("SSE connection error:", err);
        setIsConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Don't reconnect if job has already completed/failed
        // Check current progress state via ref to avoid stale closure
        if (progressRef.current?.status === "completed" || progressRef.current?.status === "failed") {
          setReconnecting(false);
          return;
        }

        // Check if we should attempt reconnection
        if (retryCountRef.current < maxRetries) {
          setReconnecting(true);
          const delay = getBackoffDelay(retryCountRef.current);

          timeoutRef.current = setTimeout(() => {
            retryCountRef.current += 1;
            createConnection();
          }, delay);
        } else {
          // Max retries reached, stop reconnecting
          setReconnecting(false);
        }
      };
    };

    // Create initial connection
    createConnection();

    // Cleanup function
    return cleanup;
  }, [jobId]);

  return { progress, isConnected, reconnecting };
}
