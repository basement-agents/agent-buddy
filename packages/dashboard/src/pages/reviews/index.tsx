import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useReviews, useNavigate, useDebouncedValue } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { ClipboardList } from "lucide-react";
import { ErrorState } from "~/components/system/error-state";
import { Spinner } from "~/components/system/spinner";
import { ProgressBar } from "~/components/shared/progress-bar";
import { Pagination } from "~/components/system/pagination";
import { Input } from "~/components/system/input";
import { Select } from "~/components/system/select";
import { api } from "~/lib/api";
import { stateVariant } from "~/lib/constants";

const STATUS_ORDER: Record<string, number> = { approved: 0, changes_requested: 1, completed: 2, commented: 3 };

export function ReviewsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useState(() => {
    const sp = new URLSearchParams(window.location.search);
    return {
      page: parseInt(sp.get("page") || "1", 10),
      repo: sp.get("repo") || "",
      status: sp.get("status") || "",
      buddy: sp.get("buddy") || "",
      since: sp.get("since") || "",
      until: sp.get("until") || "",
      sort: sp.get("sort") || "date",
    };
  });
  const [jobStatuses, setJobStatuses] = useState<Record<string, { status: string; progress?: number; error?: string }>>({});
  const [sseSupported, setSseSupported] = useState(true);
  const sseCleanups = useRef<Map<string, () => void>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const debouncedRepo = useDebouncedValue(params.repo, 300);
  const debouncedBuddy = useDebouncedValue(params.buddy, 300);

  const { data, loading, error, refetch } = useReviews({
    repo: debouncedRepo || undefined,
    status: params.status || undefined,
    buddy: debouncedBuddy || undefined,
    since: params.since || undefined,
    until: params.until || undefined,
    page: params.page,
    limit: 20,
  });

  const sortedReviews = useMemo(() => {
    if (!data?.reviews) return [];
    const reviews = [...data.reviews];
    switch (params.sort) {
      case "repo":
        return reviews.sort((a, b) => {
          const repoA = `${a.metadata.owner}/${a.metadata.repo}`;
          const repoB = `${b.metadata.owner}/${b.metadata.repo}`;
          return repoA.localeCompare(repoB);
        });
      case "status":
        return reviews.sort((a, b) => {
          const orderA = STATUS_ORDER[a.state] ?? 4;
          const orderB = STATUS_ORDER[b.state] ?? 4;
          return orderA - orderB;
        });
      case "date":
      default:
        return reviews.sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
    }
  }, [data?.reviews, params.sort]);

  const updateParam = (key: string, value: string | number) => {
    setParams(prev => {
      const next = { ...prev, [key]: value };
      const sp = new URLSearchParams();
      if (next.repo) sp.set("repo", next.repo);
      if (next.status) sp.set("status", next.status);
      if (next.buddy) sp.set("buddy", next.buddy);
      if (next.since) sp.set("since", next.since);
      if (next.until) sp.set("until", next.until);
      if (next.sort !== "date") sp.set("sort", next.sort);
      if (next.page > 1) sp.set("page", String(next.page));
      window.history.replaceState(null, "", `/reviews${sp.toString() ? `?${sp}` : ""}`);
      return next;
    });
  };

  const updateJobStatus = useCallback((jobId: string, job: { status: string; progress?: number | string; error?: string }) => {
    setJobStatuses(prev => ({
      ...prev,
      [jobId]: {
        status: job.status,
        progress: "progress" in job && typeof job.progress === "number" ? job.progress : undefined,
        error: job.error,
      },
    }));
  }, []);

  useEffect(() => {
    const pendingReviews = data?.reviews.filter(r => r.metadata.jobId) || [];
    const activeJobIds = new Set<string>();

    for (const review of pendingReviews) {
      const jobId = review.metadata.jobId;
      if (!jobId || jobStatuses[jobId]?.error || jobStatuses[jobId]?.status === "completed") continue;

      activeJobIds.add(jobId);

      if (sseCleanups.current.has(jobId)) continue;

      if (sseSupported) {
        const cleanup = api.connectToJobProgress(
          jobId,
          (job) => updateJobStatus(jobId, job),
          () => {
            setSseSupported(false);
          }
        );
        sseCleanups.current.set(jobId, cleanup);
      }
    }

    for (const [id, cleanup] of sseCleanups.current) {
      if (!activeJobIds.has(id)) {
        cleanup();
        sseCleanups.current.delete(id);
      }
    }

    if (!sseSupported && activeJobIds.size > 0) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        for (const jobId of activeJobIds) {
          if (jobStatuses[jobId]?.error || jobStatuses[jobId]?.status === "completed") continue;
          try {
            const status = await api.getJobStatus(jobId);
            updateJobStatus(jobId, status);
          } catch {
          }
        }
      }, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [data, jobStatuses, sseSupported, updateJobStatus]);

  useEffect(() => {
    return () => {
      for (const [, cleanup] of sseCleanups.current) {
        cleanup();
      }
      sseCleanups.current.clear();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (loading) return <div className="flex items-center justify-center py-8" role="status" aria-live="polite"><span className="sr-only">Loading reviews...</span><Spinner size="medium" /></div>;
  if (error) return <ErrorState message={`Error: ${error}`} onRetry={() => { updateParam("page", 1); refetch(); }} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Reviews</h1>
        <p className="text-sm text-[var(--ds-color-text-primary)]">Code review history</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          size="small"
          stretch
          className="flex-1"
          placeholder="Filter by repo..."
          value={params.repo}
          onChange={(e) => updateParam("repo", e.target.value)}
          aria-label="Filter by repository"
        />
        <Select
          size="small"
          value={params.buddy}
          onChange={(e) => updateParam("buddy", e.target.value)}
          aria-label="Filter by buddy"
        >
          <option value="">All buddies</option>
          {data?.reviews && [...new Set(data.reviews.map((r) => r.buddyId).filter(Boolean))].map((buddy) => (
            <option key={buddy} value={buddy}>{buddy}</option>
          ))}
        </Select>
        <Select
          size="small"
          value={params.status}
          onChange={(e) => updateParam("status", e.target.value)}
          aria-label="Filter by review status"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="commented">Commented</option>
          <option value="changes_requested">Changes Requested</option>
        </Select>
        <Input
          type="date"
          size="small"
          title="From date"
          value={params.since}
          onChange={(e) => updateParam("since", e.target.value)}
          aria-label="Filter from date"
        />
        <Input
          type="date"
          size="small"
          title="To date"
          value={params.until}
          onChange={(e) => updateParam("until", e.target.value)}
          aria-label="Filter to date"
        />
        <Select
          size="small"
          value={params.sort}
          onChange={(e) => updateParam("sort", e.target.value)}
          aria-label="Sort reviews"
        >
          <option value="date">Sort by Date</option>
          <option value="repo">Sort by Repo</option>
          <option value="status">Sort by Status</option>
        </Select>
      </div>

      {sortedReviews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--ds-color-border-primary)] p-8 text-center">
          {params.repo || params.status ? (
            <p className="text-[var(--ds-color-text-primary)]">No reviews match your filters</p>
          ) : (
            <>
              <ClipboardList className="mx-auto mb-3 h-10 w-10 text-[var(--ds-color-text-secondary)]" />
              <p className="mb-1 text-sm font-medium text-[var(--ds-color-text-secondary)]">No reviews yet</p>
              <p className="text-xs text-[var(--ds-color-text-primary)]">Reviews will appear here once a buddy reviews a pull request</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedReviews.map((review, i) => {
            const reviewId = `${review.metadata.owner}-${review.metadata.repo}-${review.metadata.prNumber}`;
            const jobId = review.metadata.jobId;
            const jobStatus = jobId ? jobStatuses[jobId] : undefined;

            return (
              <div key={i} className="rounded-lg border border-[var(--ds-color-border-primary)]">
                <div
                  className="flex cursor-pointer flex-col gap-3 p-4 hover-hover:bg-[var(--ds-color-surface-secondary)] sm:flex-row sm:items-center sm:justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/reviews/${reviewId}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/reviews/${reviewId}`); } }}
                >
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Badge variant={stateVariant[review.state] || "default"}>{review.state.replace("_", " ")}</Badge>
                    <span className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                      {review.metadata.owner}/{review.metadata.repo} #{review.metadata.prNumber}
                    </span>
                    {review.buddyId && (
                      <span className="text-xs text-[var(--ds-color-text-primary)]">by {review.buddyId}</span>
                    )}
                    {jobStatus && jobStatus.status === "running" && (
                      <div className="w-24 sm:w-32 shrink-0">
                        <ProgressBar
                          percentage={jobStatus.progress}
                          indeterminate={jobStatus.progress == null}
                          variant="default"
                          statusText="Processing..."
                        />
                      </div>
                    )}
                    {jobStatus && jobStatus.status === "failed" && (
                      <ProgressBar percentage={100} variant="error" statusText={jobStatus.error || "Failed"} />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ds-color-text-primary)] sm:gap-3">
                    <span>{review.comments.length} comments</span>
                    <span>{(review.metadata.durationMs / 1000).toFixed(1)}s</span>
                    <span>{new Date(review.reviewedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <Pagination page={params.page} totalPages={data.totalPages} onPageChange={(p) => updateParam("page", p)} />
      )}
    </div>
  );
}
