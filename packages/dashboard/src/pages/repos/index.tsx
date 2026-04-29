import { useState } from "react";
import { useRepos, useBuddies, useMutation, usePageParam } from "~/lib/hooks";
import { api } from "~/lib/api";
import { Button } from "~/components/system/button";
import { Checkbox } from "~/components/system/checkbox";
import { ErrorState } from "~/components/system/error-state";
import { EmptyState } from "~/components/system/empty-state";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { Skeleton } from "~/components/system/skeleton";
import { ReposPageSkeleton } from "~/components/common/page-skeletons";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { Label } from "~/components/system/label";
import { NativeSelect } from "~/components/system/native-select";
import { Pagination } from "~/components/system/pagination";
import { ModalDialog } from "~/components/system/modal-dialog";
import type { ScheduleConfig, RepoConfig } from "~/lib/api";

const REVIEW_TYPES = [
  { value: "low-context" as const, label: "Low-Context", description: "Reviews the diff only. Fast and focused on changed code." },
  { value: "high-context" as const, label: "High-Context", description: "Analyzes full impact across the codebase. Thorough but slower." },
  { value: "auto" as const, label: "Auto", description: "Automatically selects the best review type based on PR size." },
];

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

  if (loading) return <ReposPageSkeleton />;
  if (error) return <ErrorState message={`Error: ${error}`} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Repositories</h1>
          <p className="text-sm text-[var(--ds-color-text-primary)]">Manage monitored repositories</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add Repo</Button>
      </div>

      {repos?.length === 0 ? (
        <EmptyState title="No repositories configured" action={<Button variant="outline" onClick={() => setAddOpen(true)}>Add your first repository</Button>} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--ds-color-border-primary)]">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-[var(--ds-color-border-primary)] bg-[var(--ds-color-surface-secondary)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Repository</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Buddy</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Auto-Review</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Trigger</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Schedule</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--ds-color-text-primary)]">Manual Review</th>
                <th className="px-4 py-3 text-right font-medium text-[var(--ds-color-text-primary)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ds-color-border-secondary)]">
              {repos?.map((r) => {
                const [owner, repo] = r.id.split("/");
                return (
                  <tr key={r.id} className="hover:bg-[var(--ds-color-surface-secondary)]">
                    <td className="px-4 py-3 font-medium">
                      <a href={`/repos/${owner}/${repo}`} className="text-[var(--ds-color-feedback-info-text)] hover:underline">
                        {r.id}
                      </a>
                    </td>
                    <td className="px-4 py-3">{r.buddyId ? <Badge variant="info">{r.buddyId}</Badge> : <span className="text-[var(--ds-color-text-tertiary)]">none</span>}</td>
                    <td className="px-4 py-3">{r.autoReview ? <Badge variant="success">On</Badge> : <Badge variant="default">Off</Badge>}</td>
                    <td className="px-4 py-3 text-[var(--ds-color-text-primary)]">{r.triggerMode}</td>
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
                    <Button variant="ghost" size="sm" className="text-[var(--ds-color-feedback-danger)] hover:text-[var(--ds-color-feedback-danger-text)]" onClick={() => setDeleteId(r.id)}>
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
            <span className="flex items-center text-[var(--ds-color-text-tertiary)]">/</span>
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
              <div className="mt-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : scheduleConfig ? (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Enable Schedule</label>
                  <Checkbox
                    checked={scheduleEnabled}
                    onChange={(s) => setScheduleEnabled(s === "on")}
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
                  <div className="text-sm text-[var(--ds-color-text-primary)]">
                    Last run: {new Date(scheduleConfig.lastRun).toLocaleString()}
                  </div>
                )}
                {scheduleConfig.nextRun && (
                  <div className="text-sm text-[var(--ds-color-text-primary)]">
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
                  PR Number <span className="text-[var(--ds-color-feedback-danger)]">*</span>
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
                      <Button
                        type="button"
                        variant={triggerReviewType === type.value ? "info" : "outline"}
                        size="small"
                        className="w-full"
                        onClick={() => setTriggerReviewType(type.value)}
                      >
                        {type.label}
                      </Button>
                      <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">{type.description}</p>
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
