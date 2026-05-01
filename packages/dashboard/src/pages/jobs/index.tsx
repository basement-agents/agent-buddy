import { useState, useEffect, useCallback } from "react";
import { api, type JobListItem } from "~/lib/api";
import { useJobProgress, usePageParam } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { Pagination } from "~/components/system/pagination";
import { Spinner } from "~/components/system/spinner";
import { useToast } from "~/components/system/toast";
import { Select } from "~/components/system/select";
import { Button } from "~/components/system/button";
import { ModalDialog } from "~/components/system/modal-dialog";
import { PageColumn } from "~/components/common/page-column";

type JobStatus = JobListItem["status"];

/** Maps job status to Badge className overrides for feedback tints (outline pill base). */
const STATUS_BADGE_CLASS: Record<JobStatus, string> = {
  queued: "bg-[var(--ds-color-feedback-warning-subtle)] text-[var(--ds-color-feedback-warning-text)] border-[var(--ds-color-feedback-warning-subtle)]",
  running: "bg-[var(--ds-color-feedback-info-subtle)] text-[var(--ds-color-feedback-info-text)] border-[var(--ds-color-feedback-info-subtle)]",
  completed: "bg-[var(--ds-color-feedback-success-subtle)] text-[var(--ds-color-feedback-success-text)] border-[var(--ds-color-feedback-success-subtle)]",
  failed: "bg-[var(--ds-color-feedback-danger-subtle)] text-[var(--ds-color-feedback-danger-text)] border-[var(--ds-color-feedback-danger-subtle)]",
  cancelled: "bg-transparent text-[var(--ds-color-text-secondary)] border-[var(--ds-color-border-primary)]",
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 1000) return `${Math.round(safe / 100) / 10}s`;
  const totalSeconds = Math.round(safe / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function buildStatusText(parts: { subStep?: string; model?: string; elapsedMs?: number; detail?: string }): string | undefined {
  const segments: string[] = [];
  if (parts.subStep) segments.push(`[${parts.subStep}]`);
  if (parts.model) segments.push(parts.model);
  if (parts.elapsedMs !== undefined && parts.elapsedMs > 0) segments.push(formatElapsed(parts.elapsedMs));
  if (parts.detail) segments.push(parts.detail);
  return segments.length > 0 ? segments.join(" · ") : undefined;
}

/** Thin 2px progress bar: track in border-secondary, fill in text-primary. */
function InlineProgressBar({ percentage, label, statusText, onExpand }: {
  percentage: number;
  label?: string;
  statusText?: string;
  onExpand?: () => void;
}) {
  const pct = Math.min(100, Math.max(0, percentage));
  return (
    <div
      className="w-full cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => { if (e.key === "Enter") onExpand?.(); }}
    >
      {label && (
        <span
          className="block mb-1 text-[13px] text-[var(--ds-color-text-secondary)] truncate"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 relative overflow-hidden"
          style={{
            height: "2px",
            borderRadius: "var(--ds-radius-full)",
            backgroundColor: "var(--ds-color-border-secondary)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${pct}%`,
              borderRadius: "var(--ds-radius-full)",
              backgroundColor: "var(--ds-color-text-primary)",
              transition: "width 0.3s ease-out",
            }}
          />
        </div>
        <span
          className="text-[13px] text-[var(--ds-color-text-tertiary)] shrink-0"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      {statusText && (
        <span className="block mt-1 text-[13px] text-[var(--ds-color-text-tertiary)] truncate">
          {statusText.length > 40 ? statusText.slice(0, 40) + "…" : statusText}
        </span>
      )}
    </div>
  );
}

function JobRow({
  job,
  progress,
  isConnected,
  onCancel,
  onShowProgress,
}: {
  job: JobListItem;
  progress: ReturnType<typeof useJobProgress>["progress"];
  isConnected: boolean;
  onCancel: (id: string) => void;
  onShowProgress: (job: JobListItem, statusText: string) => void;
}) {
  const liveProgress = progress?.id === job.id ? progress : null;
  const displayPct = liveProgress?.progressPercentage ?? job.progressPercentage ?? 0;
  const displayStage = liveProgress?.progressStage ?? job.progressStage;
  const displayDetail = liveProgress?.progressDetail ?? job.progressDetail;
  const displaySubStep = liveProgress?.subStep ?? job.subStep;
  const displayModel = liveProgress?.currentModel ?? job.currentModel;
  const displayElapsedMs = liveProgress?.elapsedMs ?? job.elapsedMs;
  const statusText = buildStatusText({ subStep: displaySubStep, model: displayModel, elapsedMs: displayElapsedMs, detail: displayDetail });
  const isActive = job.status === "running" || job.status === "queued";

  return (
    <tr
      className="border-b border-[var(--ds-color-border-secondary)]"
      style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}
    >
      {/* Job */}
      <td className="px-3 py-3 align-middle">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[13px]">
            {job.type}
          </Badge>
          <span
            className="font-mono text-[13px] text-[var(--ds-color-text-primary)] truncate max-w-[180px]"
            style={{ fontVariantNumeric: "tabular-nums" }}
            title={job.id}
          >
            {job.id.slice(0, 20)}…
          </span>
          {isConnected && liveProgress && (
            <span className="text-[10px] text-[var(--ds-color-feedback-info)]">●</span>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-3 align-middle">
        <Badge
          variant="outline"
          shape="rounded"
          className={STATUS_BADGE_CLASS[job.status]}
          style={{ fontSize: 12 }}
        >
          {job.status}
        </Badge>
      </td>

      {/* Repo */}
      <td className="px-3 py-3 align-middle text-[13px] text-[var(--ds-color-text-primary)]">
        {job.repoId}
      </td>

      {/* Target */}
      <td
        className="px-3 py-3 align-middle text-[13px] text-[var(--ds-color-text-primary)]"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {job.type === "review" && job.prNumber ? `#${job.prNumber}` : job.buddyId || "—"}
      </td>

      {/* Progress */}
      <td className="px-3 py-3 align-middle w-52">
        {isActive ? (
          <InlineProgressBar
            percentage={displayPct}
            label={displayStage}
            statusText={statusText}
            onExpand={() => onShowProgress(job, statusText ?? `${displayStage ?? job.status} · ${displayPct}%`)}
          />
        ) : job.status === "completed" ? (
          <span className="text-[13px] text-[var(--ds-color-feedback-success)]">Done</span>
        ) : job.status === "cancelled" ? (
          <span className="text-[13px] text-[var(--ds-color-text-tertiary)]">Cancelled</span>
        ) : job.status === "failed" ? (
          <span className="text-[13px] text-[var(--ds-color-feedback-danger)] truncate" title={job.error}>
            {job.error || "Failed"}
          </span>
        ) : null}
      </td>

      {/* Created */}
      <td
        className="px-3 py-3 align-middle text-[13px] text-[var(--ds-color-text-tertiary)] text-right"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formatTime(job.createdAt)}
      </td>

      {/* Actions */}
      <td className="px-3 py-3 align-middle text-right">
        {(job.status === "queued" || job.status === "running") && (
          <Button variant="ghost" size="x-small" onClick={() => onCancel(job.id)}>
            Cancel
          </Button>
        )}
      </td>
    </tr>
  );
}

export function JobsPage() {
  const [page, setPage] = usePageParam();
  const limit = 20;
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [repoFilter, setRepoFilter] = useState<string>("all");
  const [progressDetail, setProgressDetail] = useState<{ job: JobListItem; statusText: string } | null>(null);
  const { showToast } = useToast();

  const fetchJobs = useCallback(async (opts?: { initial?: boolean }) => {
    if (opts?.initial) setLoading(true);
    setError(null);
    try {
      const data = await api.listJobs({
        page,
        limit,
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(repoFilter !== "all" ? { repoId: repoFilter } : {}),
      });
      setJobs(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, repoFilter]);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await api.cancelJob(jobId);
      await fetchJobs();
    } catch (err) {
      console.error("Failed to cancel job:", err);
      showToast({ title: "Failed to cancel job", variant: "error" });
    }
  }, [fetchJobs, showToast]);

  useEffect(() => {
    fetchJobs({ initial: true });
    const interval = setInterval(() => fetchJobs(), 5000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const activeJobId = jobs.find((j) => j.status === "running" || j.status === "queued")?.id ?? null;
  const { progress, isConnected } = useJobProgress(activeJobId);

  const uniqueRepos = [...new Set(jobs.map((j) => j.repoId))].sort();

  const statusCounts = jobs.reduce<Record<string, number>>((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageColumn variant="wide">
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Jobs</h1>
            <p className="text-[var(--ds-color-text-tertiary)] text-[13px] mt-1">
              Monitor review and analysis jobs
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{total} total</Badge>
            <Badge
              variant="outline"
              shape="rounded"
              className="bg-[var(--ds-color-feedback-warning-subtle)] text-[var(--ds-color-feedback-warning-text)] border-[var(--ds-color-feedback-warning-subtle)]"
            >
              {statusCounts["queued"] || 0} queued
            </Badge>
            <Badge
              variant="outline"
              shape="rounded"
              className="bg-[var(--ds-color-feedback-info-subtle)] text-[var(--ds-color-feedback-info-text)] border-[var(--ds-color-feedback-info-subtle)]"
            >
              {statusCounts["running"] || 0} running
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select
            size="small"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as JobStatus | "all"); setPage(1); }}
            aria-label="Filter by job status"
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </Select>
          <Select
            size="small"
            value={repoFilter}
            onChange={(e) => { setRepoFilter(e.target.value); setPage(1); }}
            aria-label="Filter by repository"
          >
            <option value="all">All repos</option>
            {uniqueRepos.map((repo) => (
              <option key={repo} value={repo}>{repo}</option>
            ))}
          </Select>
        </div>

        {/* Table — no card wrapper, only horizontal hairlines */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
              <span className="sr-only">Loading jobs...</span>
              <Spinner size="medium" />
            </div>
          ) : error ? (
            <div role="alert" className="py-8 text-center text-[var(--ds-color-feedback-danger)]">
              {error}
            </div>
          ) : jobs.length === 0 ? (
            <div className="py-8 text-center text-[var(--ds-color-text-primary)]">No jobs found</div>
          ) : (
            <table className="w-full min-w-[700px]" style={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                {/* Header: 13px, tertiary color, no background, only bottom hairline */}
                <tr
                  className="text-left border-b border-[var(--ds-color-border-primary)]"
                  style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}
                >
                  <th
                    className="px-3 py-2 font-medium"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)" }}
                  >
                    job
                  </th>
                  <th
                    className="px-3 py-2 font-medium"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)" }}
                  >
                    status
                  </th>
                  <th
                    className="px-3 py-2 font-medium"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)" }}
                  >
                    repo
                  </th>
                  <th
                    className="px-3 py-2 font-medium"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)" }}
                  >
                    target
                  </th>
                  <th
                    className="px-3 py-2 font-medium"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)" }}
                  >
                    progress
                  </th>
                  <th
                    className="px-3 py-2 font-medium text-right"
                    style={{ fontSize: 13, color: "var(--ds-color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    created
                  </th>
                  <th
                    className="px-3 py-2"
                    style={{ fontSize: 13 }}
                  />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    progress={progress}
                    isConnected={isConnected}
                    onCancel={cancelJob}
                    onShowProgress={(j, st) => setProgressDetail({ job: j, statusText: st })}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

        {/* Progress detail modal — keeps existing Dialog usage; 16px radius is handled by dialog module CSS (Stream C) */}
        <ModalDialog
          open={!!progressDetail}
          onOpenChange={(open) => !open && setProgressDetail(null)}
          title="Progress Detail"
          description={progressDetail?.job.id}
        >
          {progressDetail && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-[13px]">
                <Badge variant="outline" className="text-[13px]">{progressDetail.job.type}</Badge>
                <span className="text-[var(--ds-color-text-secondary)]">{progressDetail.job.repoId}</span>
                {progressDetail.job.prNumber && (
                  <span
                    className="text-[var(--ds-color-text-tertiary)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    #{progressDetail.job.prNumber}
                  </span>
                )}
              </div>
              <div
                className="rounded-[var(--ds-radius-4)] border border-[var(--ds-color-border-secondary)] p-3 text-[13px] text-[var(--ds-color-text-primary)] break-all"
              >
                {progressDetail.statusText}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setProgressDetail(null)}>Close</Button>
              </div>
            </div>
          )}
        </ModalDialog>
      </div>
    </PageColumn>
  );
}
