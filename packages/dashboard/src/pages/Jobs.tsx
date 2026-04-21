import { useState, useEffect, useCallback } from "react";
import { api, type JobListItem } from "@/lib/api";
import { useJobProgress, usePageParam } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ProgressBar";
import { useToast } from "@/components/ui/toast";

type JobStatus = JobListItem["status"];

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  cancelled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
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

function JobRow({ job, progress, isConnected, onCancel }: { job: JobListItem; progress: ReturnType<typeof useJobProgress>["progress"]; isConnected: boolean; onCancel: (id: string) => void }) {
  const liveProgress = progress?.id === job.id ? progress : null;
  const displayPct = liveProgress?.progressPercentage ?? job.progressPercentage ?? 0;
  const displayStage = liveProgress?.progressStage ?? job.progressStage;
  const displayDetail = liveProgress?.progressDetail ?? job.progressDetail;
  const isActive = job.status === "running" || job.status === "queued";

  return (
    <tr className="border-b border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge className="text-xs border border-zinc-300 dark:border-zinc-600 bg-transparent">
            {job.type}
          </Badge>
          <span className="font-mono text-xs text-zinc-500 truncate max-w-[200px]" title={job.id}>
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
      <td className="px-4 py-3 text-sm text-zinc-500">
        {job.type === "review" && job.prNumber ? `#${job.prNumber}` : job.buddyId || "—"}
      </td>
      <td className="px-4 py-3 w-48">
        {isActive ? (
          <ProgressBar percentage={displayPct} label={displayStage} statusText={displayDetail} />
        ) : job.status === "failed" && job.error ? (
          <span className="text-xs text-red-500 truncate" title={job.error}>{job.error}</span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-xs text-zinc-400">{formatTime(job.createdAt)}</td>
      <td className="px-4 py-3">
        {(job.status === "queued" || job.status === "running") && (
          <button
            onClick={() => onCancel(job.id)}
            className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
          >
            Cancel
          </button>
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
          <p className="text-zinc-500 text-sm mt-1">Monitor review and analysis jobs</p>
        </div>
        <div className="flex gap-2">
          <Badge>{total} total</Badge>
          <Badge className="bg-yellow-50 text-yellow-700">{statusCounts["queued"] || 0} queued</Badge>
          <Badge className="bg-blue-50 text-blue-700">{statusCounts["running"] || 0} running</Badge>
        </div>
      </div>

      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as JobStatus | "all"); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 rounded-md"
          aria-label="Filter by job status"
        >
          <option value="all">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <select
          value={repoFilter}
          onChange={(e) => { setRepoFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 rounded-md"
          aria-label="Filter by repository"
        >
          <option value="all">All repos</option>
          {uniqueRepos.map((repo) => (
            <option key={repo} value={repo}>{repo}</option>
          ))}
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} />
          ) : error ? (
            <div role="alert" className="p-8 text-center text-red-500">{error}</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No jobs found</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 text-left text-xs text-zinc-500 uppercase tracking-wider">
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
