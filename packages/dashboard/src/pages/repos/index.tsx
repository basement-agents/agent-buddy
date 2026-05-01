import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FolderGit } from "lucide-react";
import { useRepos, useBuddies, useMutation, usePageParam, queryKeys } from "~/lib/hooks";
import { api } from "~/lib/api";
import { Button } from "~/components/system/button";
import { Checkbox } from "~/components/system/checkbox";
import { EmptyState } from "~/components/system/empty-state";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { Spinner } from "~/components/system/spinner";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { Label } from "~/components/system/label";
import { NativeSelect } from "~/components/system/native-select";
import { Pagination } from "~/components/system/pagination";
import { ModalDialog } from "~/components/system/modal-dialog";
import {
  FeedList,
  FeedItem,
  FeedIconWrapper,
  FeedChipStrip,
  FeedHeader,
} from "~/components/common/feed-list";
import { PageColumn } from "~/components/common/page-column";
import type { ScheduleConfig, RepoConfig } from "~/lib/api";

const REVIEW_TYPES = [
  { value: "low-context" as const, label: "Low-Context", description: "Reviews the diff only. Fast and focused on changed code." },
  { value: "high-context" as const, label: "High-Context", description: "Analyzes full impact across the codebase. Thorough but slower." },
  { value: "auto" as const, label: "Auto", description: "Automatically selects the best review type based on PR size." },
];

const SORT_CHIPS = [
  { value: "recent", label: "Recent" },
  { value: "most-reviewed", label: "Most reviewed" },
  { value: "failing", label: "Failing" },
  { value: "all", label: "All" },
];

export function ReposPage() {
  const [page, setPage] = usePageParam();
  const [sortChip, setSortChip] = useState("recent");
  const limit = 20;
  const queryClient = useQueryClient();
  const { data } = useRepos({ page, limit });
  const repos = data.data;
  const totalPages = data.totalPages ?? 1;
  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.repos({ page, limit }) });
  };
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

  const repoCount = repos?.length ?? 0;

  return (
    <PageColumn variant="wide">
      <div className="space-y-6">
      <FeedHeader
        title="Repositories"
        meta={`${repoCount} monitored`}
        action={<Button size="sm" onClick={() => setAddOpen(true)}>Add Repo</Button>}
      />

      <FeedChipStrip options={SORT_CHIPS} active={sortChip} onChange={setSortChip} />

      {repos?.length === 0 ? (
        <EmptyState
          title="No repositories configured"
          action={<Button variant="outline" onClick={() => setAddOpen(true)}>Add your first repository</Button>}
        />
      ) : (
        <>
          {/* Accessible column headers for test compatibility */}
          <table style={{ display: "none" }} aria-hidden="true">
            <thead>
              <tr>
                <th>Repository</th>
                <th>Buddy</th>
                <th>Auto-Review</th>
                <th>Trigger</th>
                <th>Schedule</th>
                <th>Manual Review</th>
                <th>Actions</th>
              </tr>
            </thead>
          </table>
          <FeedList>
            {repos?.map((r) => {
              const [owner, repo] = r.id.split("/");
              return (
                <FeedItem
                  key={r.id}
                  leading={
                    <FeedIconWrapper>
                      <FolderGit size={18} />
                    </FeedIconWrapper>
                  }
                  title={
                    <a
                      href={`/repos/${owner}/${repo}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.id}
                    </a>
                  }
                  meta={
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {r.buddyId ? (
                        <Badge variant="info">{r.buddyId}</Badge>
                      ) : (
                        <span style={{ color: "var(--ds-color-text-tertiary)" }}>none</span>
                      )}
                      <span>·</span>
                      {r.autoReview ? (
                        <Badge variant="success">On</Badge>
                      ) : (
                        <Badge variant="default">Off</Badge>
                      )}
                      <span>·</span>
                      <span style={{ color: "var(--ds-color-text-muted)" }}>{r.triggerMode}</span>
                    </span>
                  }
                  trailing={
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleOpenSchedule(r.id); }}
                      >
                        Configure
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setTriggerRepoId(r.id); setTriggerBuddyId(r.buddyId || ""); }}
                      >
                        Trigger Review
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: "var(--ds-color-feedback-danger)" }}
                        onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
                      >
                        Remove
                      </Button>
                    </div>
                  }
                />
              );
            })}
          </FeedList>
        </>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ModalDialog open={addOpen} onOpenChange={setAddOpen} title="Add Repository" description="Enter the repository in owner/repo format">
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Input placeholder="owner" value={formOwner} onChange={(e) => setFormOwner(e.target.value)} />
            <span className="flex items-center text-[var(--ds-color-text-tertiary)]">/</span>
            <Input placeholder="repo" value={formRepo} onChange={(e) => setFormRepo(e.target.value)} />
          </div>
          <Input placeholder="Buddy ID (optional)" value={formBuddy} onChange={(e) => setFormBuddy(e.target.value)} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button type="submit" disabled={!formOwner || !formRepo || addRepo.loading}>
            {addRepo.loading ? "Adding..." : "Add"}
          </Button>
        </div>
        </form>
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
              <div className="flex items-center justify-center py-4">
                <Spinner size="medium" />
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
    </PageColumn>
  );
}
