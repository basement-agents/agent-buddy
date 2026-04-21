import { useState } from "react";
import { useRepos, useBuddies, useMutation, usePageParam } from "@/lib/hooks";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const REVIEW_TYPES = [
  { value: "low-context" as const, label: "Low-Context", description: "Reviews the diff only. Fast and focused on changed code." },
  { value: "high-context" as const, label: "High-Context", description: "Analyzes full impact across the codebase. Thorough but slower." },
  { value: "auto" as const, label: "Auto", description: "Automatically selects the best review type based on PR size." },
];
import { Pagination } from "@/components/ui/pagination";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type { ScheduleConfig, RepoConfig } from "@/lib/api";

export function ReposPage() {
  const [page, setPage] = usePageParam();
  const limit = 20;
  const { data, loading, error, refetch } = useRepos({ page, limit });
  const repos = data?.data;
  const totalPages = data?.totalPages ?? 1;
  const { data: buddies } = useBuddies();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [triggerRepoId, setTriggerRepoId] = useState<string | null>(null);
  const [formOwner, setFormOwner] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [formBuddy, setFormBuddy] = useState("");
  const [triggerPrNumber, setTriggerPrNumber] = useState("");
  const [triggerBuddyId, setTriggerBuddyId] = useState("");
  const [triggerReviewType, setTriggerReviewType] = useState<"low-context" | "high-context" | "auto">("auto");
  const { showToast } = useToast();
  const addRepo = useMutation((owner: string, repo: string, buddyId?: string) => api.addRepo(owner, repo, buddyId));
  const removeRepo = useMutation((id: string) => api.removeRepo(id));
  const triggerReview = useMutation((owner: string, repo: string, prNumber: number, buddyId?: string, reviewType?: string) =>
    api.triggerReview(owner, repo, prNumber, buddyId, reviewType));

  // Schedule management state
  const [scheduleRepoId, setScheduleRepoId] = useState<string | null>(null);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("60");

  const handleAdd = async () => {
    try {
      await addRepo.execute(formOwner, formRepo, formBuddy || undefined);
      showToast({ title: "Repository added", variant: "success" });
      setAddOpen(false);
      setFormOwner("");
      setFormRepo("");
      setFormBuddy("");
      setPage(1);
      refetch();
    } catch (err) {
      console.error("Failed to add repository:", err);
      showToast({ title: "Failed to add repository", variant: "error" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removeRepo.execute(deleteId);
      showToast({ title: "Repository removed", variant: "success" });
      setPage(1);
      refetch();
    } catch (err) {
      console.error("Failed to remove repository:", err);
      showToast({ title: "Failed to remove repository", variant: "error" });
    }
  };

  const handleOpenSchedule = async (repoId: string) => {
    setScheduleRepoId(repoId);
    setScheduleLoading(true);
    try {
      const config = await api.getRepoSchedule(repoId);
      setScheduleConfig(config);
      setScheduleEnabled(config.enabled);
      setScheduleInterval(String(config.interval || 60));
    } catch (err) {
      console.error("Failed to load schedule configuration:", err);
      showToast({ title: "Failed to load schedule configuration", variant: "error" });
      setScheduleRepoId(null);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!scheduleRepoId) return;
    setScheduleSaving(true);
    try {
      const updated = await api.updateRepoSchedule(scheduleRepoId, {
        enabled: scheduleEnabled,
        interval: parseInt(scheduleInterval, 10),
      });
      setScheduleConfig(updated);
      showToast({ title: "Schedule saved", variant: "success" });
      setScheduleRepoId(null);
    } catch (err) {
      console.error("Failed to save schedule:", err);
      showToast({ title: "Failed to save schedule", variant: "error" });
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleTriggerReview = async (repo: RepoConfig) => {
    const prNumber = parseInt(triggerPrNumber, 10);
    if (isNaN(prNumber)) {
      showToast({ title: "Please enter a valid PR number", variant: "warning" });
      return;
    }
    try {
      await triggerReview.execute(
        repo.owner,
        repo.repo,
        prNumber,
        triggerBuddyId || undefined,
        triggerReviewType
      );
      showToast({ title: "Review triggered successfully", variant: "success" });
      setTriggerRepoId(null);
      setTriggerPrNumber("");
      setTriggerBuddyId("");
      setTriggerReviewType("auto");
    } catch (err) {
      console.error("Failed to trigger review:", err);
      showToast({ title: "Failed to trigger review", variant: "error" });
    }
  };

  if (loading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorState message={`Error: ${error}`} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Repositories</h1>
          <p className="text-sm text-zinc-500">Manage monitored repositories</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add Repo</Button>
      </div>

      {repos?.length === 0 ? (
        <EmptyState title="No repositories configured" action={<Button variant="outline" onClick={() => setAddOpen(true)}>Add your first repository</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Repository</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Buddy</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Auto-Review</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Trigger</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Schedule</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Manual Review</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {repos?.map((r) => {
                const [owner, repo] = r.id.split("/");
                return (
                  <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <td className="px-4 py-3 font-medium">
                      <a href={`/repos/${owner}/${repo}`} className="text-blue-600 hover:underline">
                        {r.id}
                      </a>
                    </td>
                    <td className="px-4 py-3">{r.buddyId ? <Badge variant="info">{r.buddyId}</Badge> : <span className="text-zinc-400">none</span>}</td>
                    <td className="px-4 py-3">{r.autoReview ? <Badge variant="success">On</Badge> : <Badge variant="default">Off</Badge>}</td>
                    <td className="px-4 py-3 text-zinc-500">{r.triggerMode}</td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenSchedule(r.id)}
                    >
                      Configure
                    </Button>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTriggerRepoId(r.id);
                        setTriggerBuddyId(r.buddyId || "");
                      }}
                    >
                      Trigger Review
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setDeleteId(r.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ModalDialog open={addOpen} onOpenChange={setAddOpen} title="Add Repository" description="Enter the repository in owner/repo format">
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input placeholder="owner" value={formOwner} onChange={(e) => setFormOwner(e.target.value)} />
            <span className="flex items-center text-zinc-400">/</span>
            <Input placeholder="repo" value={formRepo} onChange={(e) => setFormRepo(e.target.value)} />
          </div>
          <Input placeholder="Buddy ID (optional)" value={formBuddy} onChange={(e) => setFormBuddy(e.target.value)} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!formOwner || !formRepo || addRepo.loading}>
            {addRepo.loading ? "Adding..." : "Add"}
          </Button>
        </div>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remove Repository"
        description={`Are you sure you want to remove ${deleteId}? This will stop monitoring this repository.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
      />

      <ModalDialog open={!!scheduleRepoId} onOpenChange={(open) => !open && setScheduleRepoId(null)} title="Schedule Configuration" description={`Configure automated review schedule for ${scheduleRepoId}`}>
            {scheduleLoading ? (
              <div className="mt-4 flex items-center justify-center py-8">
                <div className="text-sm text-zinc-500">Loading schedule...</div>
              </div>
            ) : scheduleConfig ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Enable Schedule</label>
                  <Checkbox
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                  />
                </div>
                <div>
                  <Label>
                    Interval (minutes)
                  </Label>
                  <Input
                    type="number"
                    value={scheduleInterval}
                    onChange={(e) => setScheduleInterval(e.target.value)}
                    min="1"
                  />
                </div>
                {scheduleConfig.lastRun && (
                  <div className="text-sm text-zinc-500">
                    Last run: {new Date(scheduleConfig.lastRun).toLocaleString()}
                  </div>
                )}
                {scheduleConfig.nextRun && (
                  <div className="text-sm text-zinc-500">
                    Next run: {new Date(scheduleConfig.nextRun).toLocaleString()}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setScheduleRepoId(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSchedule} disabled={scheduleSaving}>
                    {scheduleSaving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            ) : null}
      </ModalDialog>

      <ModalDialog open={!!triggerRepoId} onOpenChange={(open) => !open && setTriggerRepoId(null)} title="Trigger Manual Review" description="Trigger a review for a specific pull request">
            <div className="mt-4 space-y-4">
              <div>
                <Label>
                  PR Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  placeholder="123"
                  value={triggerPrNumber}
                  onChange={(e) => setTriggerPrNumber(e.target.value)}
                  min="1"
                />
              </div>
              {buddies && buddies.data.length > 0 && (
                <div>
                  <Label>
                    Buddy (optional)
                  </Label>
                  <NativeSelect
                    value={triggerBuddyId}
                    onChange={(e) => setTriggerBuddyId(e.target.value)}
                  >
                    <option value="">Auto-select</option>
                    {buddies.data.map((buddy) => (
                      <option key={buddy.id} value={buddy.id}>
                        {buddy.username}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
              <div>
                <Label>
                  Review Type
                </Label>
                <div className="flex gap-2">
                  {REVIEW_TYPES.map((type) => (
                    <div key={type.value} className="flex-1">
                      <button
                        type="button"
                        onClick={() => setTriggerReviewType(type.value)}
                        className={`w-full rounded-lg border px-3 py-2 text-sm transition-colors ${
                          triggerReviewType === type.value
                            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        {type.label}
                      </button>
                      <p className="mt-1 text-xs text-zinc-500">{type.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setTriggerRepoId(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const repo = repos?.find((r) => r.id === triggerRepoId);
                    if (repo) handleTriggerReview(repo);
                  }}
                  disabled={!triggerPrNumber || triggerReview.loading}
                >
                  {triggerReview.loading ? "Triggering..." : "Trigger Review"}
                </Button>
              </div>
            </div>
      </ModalDialog>
    </div>
  );
}
