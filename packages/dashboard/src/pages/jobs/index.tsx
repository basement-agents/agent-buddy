import { useState, useEffect, useCallback } from "react";
import { api, type JobListItem } from "~/lib/api";
import { useJobProgress, usePageParam } from "~/lib/hooks";
import { Card, CardContent } from "~/components/system/card";
import { Badge } from "~/components/system/badge";
import { Spinner } from "~/components/system/spinner";
import { Pagination } from "~/components/system/pagination";
import { ProgressBar } from "~/components/shared/progress-bar";
import { useToast } from "~/components/system/toast";
import { Select } from "~/components/system/select";
import { Button } from "~/components/system/button";

type JobStatus = JobListItem["status"];

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "bg-[var(--ds-color-feedback-warning-subtle)] text-[var(--ds-color-feedback-warning-text)]",
  running: "bg-[var(--ds-color-feedback-info-subtle)] text-[var(--ds-color-feedback-info-text)]",
  completed: "bg-[var(--ds-color-feedback-success-subtle)] text-[var(--ds-color-feedback-success-text)]",
  failed: "bg-[var(--ds-color-feedback-danger-subtle)] text-[var(--ds-color-feedback-danger-text)]",
  cancelled: "bg-[var(--ds-color-surface-neutral)] text-[var(--ds-color-text-secondary)]",
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

function JobRow({ job, progress, isConnected, onCancel }: { job: JobListItem; progress: ReturnType<typeof useJobProgress>["progress"]; isConnected: boolean; onCancel: (id: string) => void }) {
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
    <tr className="border-b border-[var(--ds-color-border-primary)] hover:bg-[var(--ds-color-surface-secondary)]/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge className="text-xs border border-[var(--ds-color-border-primary)] bg-transparent">
            {job.type}
          </Badge>
          <span className="font-mono text-xs text-[var(--ds-color-text-primary)] truncate max-w-[200px]" title={job.id}>
            {job.id.slice(0, 20)}...
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[job.status]}`}>
          {job.status}
          {isConnected && liveProgress && <span className="ml-1">●</span>}
        </span>
      </td>
      <td className="px-4 py-3 text-sm">{job.repoId}</td>
      <td className="px-4 py-3 text-sm text-[var(--ds-color-text-primary)]">
        {job.type === "review" && job.prNumber ? `#${job.prNumber}` : job.buddyId || "—"}
      </td>
      <td className="px-4 py-3 w-48">
        {isActive ? (
          <ProgressBar percentage={displayPct} label={displayStage} statusText={statusText} />
        ) : job.status === "failed" && job.error ? (
          <span className="text-xs text-[var(--ds-color-feedback-danger)] truncate" title={job.error}>{job.error}</span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--ds-color-text-tertiary)]">{formatTime(job.createdAt)}</td>
      <td className="px-4 py-3">
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
  const { showToast } = useToast();

  const fetchJobs = useCallback(async () => {
    setLoading(true);
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
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-[var(--ds-color-text-primary)] text-sm mt-1">Monitor review and analysis jobs</p>
        </div>
        <div className="flex gap-2">
          <Badge>{total} total</Badge>
          <Badge className="bg-[var(--ds-color-feedback-warning-subtle)] text-[var(--ds-color-feedback-warning-text)]">{statusCounts["queued"] || 0} queued</Badge>
          <Badge className="bg-[var(--ds-color-feedback-info-subtle)] text-[var(--ds-color-feedback-info-text)]">{statusCounts["running"] || 0} running</Badge>
        </div>
      </div>

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

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8" role="status" aria-live="polite"><span className="sr-only">Loading jobs...</span><Spinner size="medium" /></div>
          ) : error ? (
            <div role="alert" className="p-8 text-center text-[var(--ds-color-feedback-danger)]">{error}</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-[var(--ds-color-text-primary)]">No jobs found</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[var(--ds-color-border-primary)] text-left text-xs text-[var(--ds-color-text-primary)] uppercase tracking-wider">
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} progress={progress} isConnected={isConnected} onCancel={cancelJob} />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
