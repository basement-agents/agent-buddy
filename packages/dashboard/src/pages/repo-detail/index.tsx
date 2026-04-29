import { useState, useEffect } from "react";
import { api } from "~/lib/api";
import { useQuery, useMutation, useNavigate } from "~/lib/hooks";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/system/card";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { Skeleton } from "~/components/system/skeleton";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { ModalDialog } from "~/components/system/modal-dialog";
import { Label } from "~/components/system/label";
import { Checkbox } from "~/components/system/checkbox";
import { ExternalLink } from "lucide-react";
import { NativeSelect } from "~/components/system/native-select";
import type { RepoConfig, CustomRule, ScheduleConfig, BuddySummary } from "~/lib/api";

const SEVERITY_ORDER = ["error", "warning", "suggestion", "info"] as const;

export function RepoDetailPage({ owner, repo }: { owner: string; repo: string }) {
  const navigate = useNavigate();
  const repoId = `${owner}/${repo}`;
  const { data: repoConfig, loading, error, refetch } = useQuery(() => api.listRepos().then(repos => repos.data?.find(r => r.id === repoId)), [repoId]);
  const { data: buddies } = useQuery(() => api.listBuddies());
  const { data: rules, loading: rulesLoading, refetch: refetchRules } = useQuery(() => api.getRepoRules(repoId), [repoId]);
  const { data: schedule, loading: scheduleLoading, refetch: refetchSchedule } = useQuery(() => api.getRepoSchedule(repoId), [repoId]);
  const { data: reviewsData, loading: reviewsLoading } = useQuery(() => api.listReviews({ repo: repoId, limit: 10 }), [repoId]);
  const { data: openPRs, loading: prsLoading } = useQuery(() => api.listOpenPRs(owner, repo), [owner, repo]);

  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [deleteRepoOpen, setDeleteRepoOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);

  const [formBuddyId, setFormBuddyId] = useState("");
  const [formAutoReview, setFormAutoReview] = useState(false);
  const [formTriggerMode, setFormTriggerMode] = useState("");

  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRuleSeverity, setNewRuleSeverity] = useState<"info" | "suggestion" | "warning" | "error">("suggestion");
  const [newRuleCategory, setNewRuleCategory] = useState("");

  const [editRuleName, setEditRuleName] = useState("");
  const [editRulePattern, setEditRulePattern] = useState("");
  const [editRuleSeverity, setEditRuleSeverity] = useState<"info" | "suggestion" | "warning" | "error">("suggestion");
  const [editRuleEnabled, setEditRuleEnabled] = useState(true);

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("60");

  const { showToast } = useToast();
  const updateRepo = useMutation((id: string, data: Partial<RepoConfig>) => api.updateRepo(id, data));
  const addRule = useMutation((repoId: string, rule: Omit<CustomRule, "id">) => api.addRepoRule(repoId, rule));
  const deleteRule = useMutation((repoId: string, ruleId: string) => api.deleteRepoRule(repoId, ruleId));
  const editRule = useMutation((repoId: string, ruleId: string, data: Partial<Omit<CustomRule, "id">>) => api.updateRepoRule(repoId, ruleId, data));
  const removeRepo = useMutation((id: string) => api.removeRepo(id));
  const updateSchedule = useMutation((repoId: string, config: Partial<ScheduleConfig>) => api.updateRepoSchedule(repoId, config));

  useEffect(() => {
    if (repoConfig) {
      setFormBuddyId(repoConfig.buddyId || "");
      setFormAutoReview(repoConfig.autoReview);
      setFormTriggerMode(repoConfig.triggerMode);
    }
  }, [repoConfig]);

  useEffect(() => {
    if (schedule) {
      setScheduleEnabled(schedule.enabled);
      setScheduleInterval(String(schedule.interval || 60));
    }
  }, [schedule]);

  const handleSaveConfig = async () => {
    if (!repoConfig) return;
    try {
      await updateRepo.execute(repoConfig.id, {
        buddyId: formBuddyId || undefined,
        autoReview: formAutoReview,
        triggerMode: formTriggerMode,
      });
      showToast({ title: "Configuration saved", variant: "success" });
      setEditConfigOpen(false);
      refetch();
    } catch (err) {
      console.error("Failed to save configuration:", err);
      showToast({ title: "Failed to save configuration", variant: "error" });
    }
  };

  const handleAddRule = async () => {
    if (!newRuleName || !newRulePattern) {
      showToast({ title: "Please fill in all required fields", variant: "warning" });
      return;
    }
    try {
      await addRule.execute(repoId, {
        name: newRuleName,
        pattern: newRulePattern,
        severity: newRuleSeverity,
        enabled: true,
        category: newRuleCategory || undefined,
      });
      showToast({ title: "Rule added", variant: "success" });
      setAddRuleOpen(false);
      setNewRuleName("");
      setNewRulePattern("");
      setNewRuleSeverity("suggestion");
      setNewRuleCategory("");
      refetchRules();
    } catch (err) {
      console.error("Failed to add rule:", err);
      showToast({ title: "Failed to add rule", variant: "error" });
    }
  };

  const handleDeleteRule = async () => {
    if (!deleteRuleId) return;
    try {
      await deleteRule.execute(repoId, deleteRuleId);
      showToast({ title: "Rule deleted", variant: "success" });
      setDeleteRuleId(null);
      refetchRules();
    } catch (err) {
      console.error("Failed to delete rule:", err);
      showToast({ title: "Failed to delete rule", variant: "error" });
    }
  };

  const openEditRule = (ruleId: string) => {
    const rule = rules?.find((r) => r.id === ruleId);
    if (!rule) return;
    setEditRuleName(rule.name);
    setEditRulePattern(rule.pattern);
    setEditRuleSeverity(rule.severity);
    setEditRuleEnabled(rule.enabled);
    setEditRuleId(ruleId);
  };

  const handleEditRule = async () => {
    if (!editRuleId || !editRuleName || !editRulePattern) {
      showToast({ title: "Please fill in all required fields", variant: "warning" });
      return;
    }
    try {
      await editRule.execute(repoId, editRuleId, {
        name: editRuleName,
        pattern: editRulePattern,
        severity: editRuleSeverity,
        enabled: editRuleEnabled,
      });
      showToast({ title: "Rule updated", variant: "success" });
      setEditRuleId(null);
      refetchRules();
    } catch (err) {
      console.error("Failed to update rule:", err);
      showToast({ title: "Failed to update rule", variant: "error" });
    }
  };

  const handleDeleteRepo = async () => {
    if (!repoConfig) return;
    try {
      await removeRepo.execute(repoConfig.id);
      showToast({ title: "Repository removed", variant: "success" });
      navigate("/repos");
    } catch (err) {
      console.error("Failed to remove repository:", err);
      showToast({ title: "Failed to remove repository", variant: "error" });
    }
  };

  const handleSaveSchedule = async () => {
    try {
      await updateSchedule.execute(repoId, {
        enabled: scheduleEnabled,
        interval: parseInt(scheduleInterval, 10),
      });
      showToast({ title: "Schedule saved", variant: "success" });
      setEditScheduleOpen(false);
      refetchSchedule();
    } catch (err) {
      console.error("Failed to save schedule:", err);
      showToast({ title: "Failed to save schedule", variant: "error" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !repoConfig) {
    return (
      <ErrorState message={error || "Repository not found"} onRetry={() => navigate("/repos")} retryLabel="Back to Repositories" />
    );
  }

  const sortedRules = rules?.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const aSeverity = SEVERITY_ORDER.indexOf(a.severity);
    const bSeverity = SEVERITY_ORDER.indexOf(b.severity);
    return aSeverity - bSeverity;
  });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Repos", href: "/repos" }, { label: repoId }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">{repoId}</h1>
          <p className="text-sm text-[var(--ds-color-text-primary)]">Repository configuration and management</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditConfigOpen(true)}>Edit Config</Button>
          <Button variant="outline" className="text-[var(--ds-color-feedback-danger)] hover:text-[var(--ds-color-feedback-danger-text)]" onClick={() => setDeleteRepoOpen(true)}>Remove</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Buddies</p>
              <p className="mt-1 text-sm">
                {(() => {
                  const ids = repoConfig.buddies?.length ? repoConfig.buddies : repoConfig.buddyId ? [repoConfig.buddyId] : [];
                  if (ids.length === 0) return <span className="text-[var(--ds-color-text-tertiary)]">None assigned</span>;
                  return (
                    <span className="flex flex-wrap gap-1">
                      {ids.map((id) => (
                        <a key={id} href={`/buddies/${id}`} className="text-[var(--ds-color-feedback-info-text)] hover:underline">
                          <Badge variant="info">{id}</Badge>
                        </a>
                      ))}
                    </span>
                  );
                })()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Auto-Review</p>
              <p className="mt-1 text-sm">
                {repoConfig.autoReview ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="default">Disabled</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Trigger Mode</p>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{repoConfig.triggerMode}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Schedule</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setEditScheduleOpen(true)}>Configure</Button>
          </div>
        </CardHeader>
        <CardContent>
          {scheduleLoading ? (
            <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
          ) : schedule ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Status</p>
                <p className="mt-1 text-sm">
                  {schedule.enabled ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="default">Inactive</Badge>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Interval</p>
                <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{schedule.interval || 60} minutes</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-[var(--ds-color-text-primary)]">Last Run</p>
                <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                  {schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : "Never"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ds-color-text-primary)]">No schedule configured</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Custom Rules ({rules?.length || 0})</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setAddRuleOpen(true)}>Add Rule</Button>
          </div>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
          ) : !sortedRules || sortedRules.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-text-primary)]">No custom rules configured</p>
          ) : (
            <div className="space-y-2">
              {sortedRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`flex items-center justify-between rounded-lg border border-[var(--ds-color-border-secondary)] p-3 ${rule.enabled ? "bg-[var(--ds-color-surface-card)]" : "bg-[var(--ds-color-surface-secondary)]/50 opacity-60"}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={rule.severity === "error" ? "error" : rule.severity === "warning" ? "warning" : rule.severity === "suggestion" ? "info" : "default"}>
                        {rule.severity}
                      </Badge>
                      <span className="font-medium text-[var(--ds-color-text-primary)]">{rule.name}</span>
                      {!rule.enabled && <span className="text-xs text-[var(--ds-color-text-tertiary)]">(disabled)</span>}
                    </div>
                    <code className="mt-1 block text-xs text-[var(--ds-color-text-secondary)]">{rule.pattern}</code>
                    {rule.category && <span className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Category: {rule.category}</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditRule(rule.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--ds-color-feedback-danger)] hover:text-[var(--ds-color-feedback-danger-text)]"
                      onClick={() => setDeleteRuleId(rule.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {reviewsLoading ? (
            <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
          ) : !reviewsData?.reviews || reviewsData.reviews.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-text-primary)]">No reviews found for this repository</p>
          ) : (
            <div className="space-y-2">
              {reviewsData.reviews.map((review) => (
                <a
                  key={`${review.metadata.repo}-${review.metadata.prNumber}-${review.reviewedAt}`}
                  href={`/reviews/${review.metadata.repo}-${review.metadata.prNumber}`}
                  className="block rounded-lg border p-3 hover:bg-[var(--ds-color-surface-secondary)]"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[var(--ds-color-text-primary)]">
                        PR #{review.metadata.prNumber}
                      </p>
                      <p className="text-xs text-[var(--ds-color-text-primary)]">
                        {review.reviewedAt ? new Date(review.reviewedAt).toLocaleString() : "In progress"}
                      </p>
                    </div>
                    <Badge variant={review.state === "completed" ? "success" : "default"}>
                      {review.state}
                    </Badge>
                  </div>
                  {review.summary && (
                    <p className="mt-2 line-clamp-2 text-sm text-[var(--ds-color-text-secondary)]">{review.summary}</p>
                  )}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open Pull Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {prsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !openPRs || openPRs.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-text-primary)]">No open pull requests</p>
          ) : (
            <div className="space-y-2">
              {openPRs.map((pr) => (
                <a
                  key={pr.number}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-[var(--ds-color-surface-secondary)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-[var(--ds-color-feedback-info-text)]">
                        #{pr.number}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--ds-color-text-primary)]">
                        {pr.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">
                      by {pr.author} &middot; {new Date(pr.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 flex-shrink-0 text-[var(--ds-color-text-tertiary)]" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModalDialog open={editConfigOpen} onOpenChange={setEditConfigOpen} title="Edit Configuration" description={`Update repository settings for ${repoId}`}>
            <div className="mt-4 space-y-4">
              <div>
                <Label>
                  Buddy
                </Label>
                <NativeSelect
                  value={formBuddyId}
                  onChange={(e) => setFormBuddyId(e.target.value)}
                >
                  <option value="">None</option>
                  {buddies?.data?.map((buddy: BuddySummary) => (
                    <option key={buddy.id} value={buddy.id}>
                      {buddy.username}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Auto-Review</label>
                <Checkbox
                  checked={formAutoReview}
                  onChange={(s) => setFormAutoReview(s === "on")}
                />
              </div>
              <div>
                <Label>
                  Trigger Mode
                </Label>
                <NativeSelect
                  value={formTriggerMode}
                  onChange={(e) => setFormTriggerMode(e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Auto</option>
                  <option value="schedule">Schedule</option>
                </NativeSelect>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditConfigOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveConfig} disabled={updateRepo.loading}>
                {updateRepo.loading ? "Saving..." : "Save"}
              </Button>
            </div>
      </ModalDialog>

      <ModalDialog open={addRuleOpen} onOpenChange={setAddRuleOpen} title="Add Custom Rule" description={`Create a new custom review rule for ${repoId}`}>
            <div className="mt-4 space-y-4">
              <div>
                <Label>
                  Rule Name <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  placeholder="e.g., No console.log"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  Pattern <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  placeholder="e.g., console\\.(log|debug)"
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Regular expression pattern to match</p>
              </div>
              <div>
                <Label>
                  Severity
                </Label>
                <NativeSelect
                  value={newRuleSeverity}
                  onChange={(e) => setNewRuleSeverity(e.target.value as "info" | "suggestion" | "warning" | "error")}
                >
                  <option value="info">Info</option>
                  <option value="suggestion">Suggestion</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </NativeSelect>
              </div>
              <div>
                <Label>
                  Category (optional)
                </Label>
                <Input
                  placeholder="e.g., code-quality"
                  value={newRuleCategory}
                  onChange={(e) => setNewRuleCategory(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAddRuleOpen(false)}>Cancel</Button>
              <Button onClick={handleAddRule} disabled={addRule.loading}>
                {addRule.loading ? "Adding..." : "Add"}
              </Button>
            </div>
      </ModalDialog>

      <ModalDialog open={!!editRuleId} onOpenChange={(open) => !open && setEditRuleId(null)} title="Edit Custom Rule" description={`Update rule for ${repoId}`}>
            <div className="mt-4 space-y-4">
              <div>
                <Label>
                  Rule Name <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  value={editRuleName}
                  onChange={(e) => setEditRuleName(e.target.value)}
                />
              </div>
              <div>
                <Label>
                  Pattern <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  value={editRulePattern}
                  onChange={(e) => setEditRulePattern(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Regular expression pattern to match</p>
              </div>
              <div>
                <Label>
                  Severity
                </Label>
                <NativeSelect
                  value={editRuleSeverity}
                  onChange={(e) => setEditRuleSeverity(e.target.value as "info" | "suggestion" | "warning" | "error")}
                >
                  <option value="info">Info</option>
                  <option value="suggestion">Suggestion</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </NativeSelect>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Enabled</label>
                <Checkbox
                  checked={editRuleEnabled}
                  onChange={(s) => setEditRuleEnabled(s === "on")}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditRuleId(null)}>Cancel</Button>
              <Button onClick={handleEditRule} disabled={editRule.loading}>
                {editRule.loading ? "Saving..." : "Save"}
              </Button>
            </div>
      </ModalDialog>

      <ModalDialog open={editScheduleOpen} onOpenChange={setEditScheduleOpen} title="Schedule Configuration" description={`Configure automated review schedule for ${repoId}`}>
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
              {schedule?.lastRun && (
                <div className="text-sm text-[var(--ds-color-text-primary)]">
                  Last run: {new Date(schedule.lastRun).toLocaleString()}
                </div>
              )}
              {schedule?.nextRun && (
                <div className="text-sm text-[var(--ds-color-text-primary)]">
                  Next run: {new Date(schedule.nextRun).toLocaleString()}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditScheduleOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSchedule} disabled={updateSchedule.loading}>
                {updateSchedule.loading ? "Saving..." : "Save"}
              </Button>
            </div>
      </ModalDialog>

      <ConfirmDialog
        open={!!deleteRuleId}
        onOpenChange={(open) => !open && setDeleteRuleId(null)}
        title="Delete Rule"
        description="Are you sure you want to delete this rule? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteRule}
      />

      <ConfirmDialog
        open={deleteRepoOpen}
        onOpenChange={setDeleteRepoOpen}
        title="Remove Repository"
        description={`Are you sure you want to remove ${repoId}? This will stop monitoring this repository.`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDeleteRepo}
      />
    </div>
  );
}
