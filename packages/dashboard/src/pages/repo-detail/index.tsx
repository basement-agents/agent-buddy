import { useState, useEffect, Suspense } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { useMutation, useNavigate, useBuddies, useReviews, useRepoRules, useRepoSchedule, useRepoOpenPRs, queryKeys } from "~/lib/hooks";
import { Button } from "~/components/system/button";
import { Spinner } from "~/components/system/spinner";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { ModalDialog } from "~/components/system/modal-dialog";
import { Label } from "~/components/system/label";
import { Checkbox } from "~/components/system/checkbox";
import { ExternalLink, Folder } from "lucide-react";
import { NativeSelect } from "~/components/system/native-select";
import { PageColumn } from "~/components/common/page-column";
import { ProfileHeader } from "~/components/common/profile-header";
import { TabStrip } from "~/components/common/tab-strip";
import { FeedList, FeedItem } from "~/components/common/feed-list";
import type { RepoConfig, CustomRule, ScheduleConfig, BuddySummary } from "~/lib/api";

const SEVERITY_ORDER = ["error", "warning", "suggestion", "info"] as const;

const TABS = [
  { id: "reviews", label: "Reviews" },
  { id: "schedule", label: "Schedule" },
  { id: "rules", label: "Rules" },
  { id: "prs", label: "Open PRs" },
] as const;

type TabId = typeof TABS[number]["id"];

export function RepoDetailPage({ owner, repo }: { owner: string; repo: string }) {
  const navigate = useNavigate();
  const repoId = `${owner}/${repo}`;
  const [activeTab, setActiveTab] = useState<TabId>("reviews");

  const queryClient = useQueryClient();
  const { data: reposList } = useSuspenseQuery({
    queryKey: ["repos-all", repoId],
    queryFn: ({ signal }) => api.listRepos(undefined, signal),
  });
  const repoConfig = reposList.data?.find((r) => r.id === repoId);
  const refetch = () => queryClient.invalidateQueries({ queryKey: ["repos-all", repoId] });
  const { data: buddies } = useBuddies();
  const { data: rules } = useRepoRules(repoId);
  const refetchRules = () => queryClient.invalidateQueries({ queryKey: queryKeys.repoRules(repoId) });
  const { data: schedule } = useRepoSchedule(repoId);
  const refetchSchedule = () => queryClient.invalidateQueries({ queryKey: queryKeys.repoSchedule(repoId) });
  const { data: reviewsData } = useReviews({ repo: repoId, limit: 10 });

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

  const [deleting, setDeleting] = useState(false);

  const handleDeleteRepo = async () => {
    if (!repoConfig) return;
    setDeleting(true);
    try {
      await removeRepo.execute(repoConfig.id);
      showToast({ title: "Repository removed", variant: "success" });
      navigate("/repos");
    } catch (err) {
      console.error("Failed to remove repository:", err);
      showToast({ title: "Failed to remove repository", variant: "error" });
      throw err;
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSchedule = async () => {
    const interval = parseInt(scheduleInterval, 10);
    if (isNaN(interval) || interval < 1) {
      showToast({ title: "Please enter a valid interval (minimum 1 minute)", variant: "warning" });
      return;
    }
    try {
      await updateSchedule.execute(repoId, {
        enabled: scheduleEnabled,
        interval,
      });
      showToast({ title: "Schedule saved", variant: "success" });
      setEditScheduleOpen(false);
      refetchSchedule();
    } catch (err) {
      console.error("Failed to save schedule:", err);
      showToast({ title: "Failed to save schedule", variant: "error" });
    }
  };

  if (!repoConfig) {
    return (
      <ErrorState message={"Repository not found"} onRetry={() => navigate("/repos")} retryLabel="Back to Repositories" />
    );
  }
  void refetch;

  const sortedRules = (Array.isArray(rules) ? rules : []).slice().sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const aSeverity = SEVERITY_ORDER.indexOf(a.severity);
    const bSeverity = SEVERITY_ORDER.indexOf(b.severity);
    return aSeverity - bSeverity;
  });

  const buddyIds = repoConfig.buddies?.length
    ? repoConfig.buddies
    : repoConfig.buddyId
    ? [repoConfig.buddyId]
    : [];

  return (
    <PageColumn variant="wide">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Repos", href: "/repos" }, { label: repoId }]} />

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        <ProfileHeader
          avatar={
            <div style={{
              width: 88,
              height: 88,
              borderRadius: "var(--ds-radius-4)",
              background: "var(--ds-color-surface-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ds-color-text-secondary)",
            }}>
              <Folder size={40} />
            </div>
          }
          title={repoId}
          subtitle="Repository configuration and management"
          description={
            buddyIds.length > 0
              ? `Buddies: ${buddyIds.join(", ")}`
              : undefined
          }
          actions={
            <>
              <Button onClick={() => setEditConfigOpen(true)}>Edit Config</Button>
              <Button
                variant="outline"
                onClick={() => setDeleteRepoOpen(true)}
              >
                Remove
              </Button>
            </>
          }
        />
      </div>

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        <TabStrip
          tabs={[...TABS]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
      </div>

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        {/* Configuration summary always visible */}
        <div style={{ display: "flex", gap: "var(--ds-spacing-10)", flexWrap: "wrap", marginBottom: "var(--ds-spacing-9)", paddingBottom: "var(--ds-spacing-9)", borderBottom: "1px solid var(--ds-color-border-secondary)" }}>
          <div>
            <p style={{ fontSize: "var(--ds-text-xs, 12px)", fontWeight: 500, textTransform: "uppercase", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Buddies</p>
            {buddyIds.length === 0 ? (
              <span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-tertiary)" }}>None assigned</span>
            ) : (
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {buddyIds.map((id) => (
                  <a key={id} href={`/buddies/${id}`}>
                    <Badge variant="info">{id}</Badge>
                  </a>
                ))}
              </span>
            )}
          </div>
          <div>
            <p style={{ fontSize: "var(--ds-text-xs, 12px)", fontWeight: 500, textTransform: "uppercase", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Auto-Review</p>
            {repoConfig.autoReview ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="default">Disabled</Badge>
            )}
          </div>
          <div>
            <p style={{ fontSize: "var(--ds-text-xs, 12px)", fontWeight: 500, textTransform: "uppercase", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Trigger Mode</p>
            <span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>{repoConfig.triggerMode}</span>
          </div>
        </div>

        {/* Reviews tab */}
        {activeTab === "reviews" && (
          <section>
            <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Recent Reviews</p>
            {!reviewsData?.reviews || reviewsData.reviews.length === 0 ? (
              <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>No reviews found for this repository</p>
            ) : (
              <FeedList>
                {reviewsData.reviews.map((review) => (
                  <FeedItem
                    key={`${review.metadata.repo}-${review.metadata.prNumber}-${review.reviewedAt}`}
                    title={`PR #${review.metadata.prNumber}`}
                    meta={review.reviewedAt ? new Date(review.reviewedAt).toLocaleString() : "In progress"}
                    trailing={
                      <Badge variant={review.state === "completed" ? "success" : "default"}>
                        {review.state}
                      </Badge>
                    }
                    onClick={() => navigate(`/reviews/${review.metadata.repo}-${review.metadata.prNumber}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(`/reviews/${review.metadata.repo}-${review.metadata.prNumber}`);
                    }}
                  />
                ))}
              </FeedList>
            )}
          </section>
        )}

        {/* Schedule tab */}
        {activeTab === "schedule" && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ds-spacing-7)" }}>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)" }}>Schedule</p>
              <Button variant="outline" size="sm" onClick={() => setEditScheduleOpen(true)}>Configure</Button>
            </div>
            {schedule ? (
              <FeedList>
                <FeedItem
                  title="Status"
                  trailing={schedule.enabled ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                />
                <FeedItem
                  title="Interval"
                  trailing={<span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>{schedule.interval || 60} minutes</span>}
                />
                <FeedItem
                  title="Last Run"
                  trailing={<span style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>{schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : "Never"}</span>}
                />
              </FeedList>
            ) : (
              <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>No schedule configured</p>
            )}
          </section>
        )}

        {/* Rules tab */}
        {activeTab === "rules" && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ds-spacing-7)" }}>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)" }}>
                Custom Rules ({rules?.length || 0})
              </p>
              <Button variant="outline" size="sm" onClick={() => setAddRuleOpen(true)}>Add Rule</Button>
            </div>
            {!sortedRules || sortedRules.length === 0 ? (
              <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>No custom rules configured</p>
            ) : (
              <FeedList>
                {sortedRules.map((rule) => (
                  <FeedItem
                    key={rule.id}
                    title={
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge variant={rule.severity === "error" ? "error" : rule.severity === "warning" ? "warning" : rule.severity === "suggestion" ? "info" : "default"}>
                          {rule.severity}
                        </Badge>
                        <span style={{ opacity: rule.enabled ? 1 : 0.5 }}>{rule.name}</span>
                        {!rule.enabled && <span style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)" }}>(disabled)</span>}
                      </span>
                    }
                    meta={<code style={{ fontSize: "var(--ds-text-xs)" }}>{rule.pattern}</code>}
                    trailing={
                      <span style={{ display: "flex", gap: 4 }}>
                        <Button variant="ghost" size="sm" onClick={() => openEditRule(rule.id)}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteRuleId(rule.id)}>Delete</Button>
                      </span>
                    }
                  />
                ))}
              </FeedList>
            )}
          </section>
        )}

        {/* Open PRs tab */}
        {activeTab === "prs" && (
          <section>
            <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Open Pull Requests</p>
            <ErrorBoundary
              fallback={
                <ErrorState message="Could not load open pull requests" />
              }
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-4" role="status" aria-live="polite">
                    <span className="sr-only">Loading open PRs...</span>
                    <Spinner size="medium" />
                  </div>
                }
              >
                <OpenPRsList owner={owner} repo={repo} />
              </Suspense>
            </ErrorBoundary>
          </section>
        )}
      </div>

      {/* Dialogs — unchanged logic */}
      <ModalDialog open={editConfigOpen} onOpenChange={setEditConfigOpen} title="Edit Configuration" description={`Update repository settings for ${repoId}`}>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Buddy</Label>
            <NativeSelect value={formBuddyId} onChange={(e) => setFormBuddyId(e.target.value)}>
              <option value="">None</option>
              {buddies?.data?.map((buddy: BuddySummary) => (
                <option key={buddy.id} value={buddy.id}>{buddy.username}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Auto-Review</label>
            <Checkbox checked={formAutoReview} onChange={(s) => setFormAutoReview(s === "on")} />
          </div>
          <div>
            <Label>Trigger Mode</Label>
            <NativeSelect value={formTriggerMode} onChange={(e) => setFormTriggerMode(e.target.value)}>
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
        <form onSubmit={(e) => { e.preventDefault(); handleAddRule(); }}>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Rule Name <span className="text-[var(--ds-color-feedback-danger)]">*</span></Label>
              <Input placeholder="e.g., No console.log" value={newRuleName} onChange={(e) => setNewRuleName(e.target.value)} />
            </div>
            <div>
              <Label>Pattern <span className="text-[var(--ds-color-feedback-danger)]">*</span></Label>
              <Input placeholder="e.g., console\\.(log|debug)" value={newRulePattern} onChange={(e) => setNewRulePattern(e.target.value)} />
              <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Regular expression pattern to match</p>
            </div>
            <div>
              <Label>Severity</Label>
              <NativeSelect value={newRuleSeverity} onChange={(e) => setNewRuleSeverity(e.target.value as "info" | "suggestion" | "warning" | "error")}>
                <option value="info">Info</option>
                <option value="suggestion">Suggestion</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </NativeSelect>
            </div>
            <div>
              <Label>Category (optional)</Label>
              <Input placeholder="e.g., code-quality" value={newRuleCategory} onChange={(e) => setNewRuleCategory(e.target.value)} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setAddRuleOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={addRule.loading}>{addRule.loading ? "Adding..." : "Add"}</Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={!!editRuleId} onOpenChange={(open) => !open && setEditRuleId(null)} title="Edit Custom Rule" description={`Update rule for ${repoId}`}>
        <form onSubmit={(e) => { e.preventDefault(); handleEditRule(); }}>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Rule Name <span className="text-[var(--ds-color-feedback-danger)]">*</span></Label>
              <Input value={editRuleName} onChange={(e) => setEditRuleName(e.target.value)} />
            </div>
            <div>
              <Label>Pattern <span className="text-[var(--ds-color-feedback-danger)]">*</span></Label>
              <Input value={editRulePattern} onChange={(e) => setEditRulePattern(e.target.value)} />
              <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Regular expression pattern to match</p>
            </div>
            <div>
              <Label>Severity</Label>
              <NativeSelect value={editRuleSeverity} onChange={(e) => setEditRuleSeverity(e.target.value as "info" | "suggestion" | "warning" | "error")}>
                <option value="info">Info</option>
                <option value="suggestion">Suggestion</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </NativeSelect>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Enabled</label>
              <Checkbox checked={editRuleEnabled} onChange={(s) => setEditRuleEnabled(s === "on")} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setEditRuleId(null)}>Cancel</Button>
            <Button type="submit" disabled={editRule.loading}>{editRule.loading ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={editScheduleOpen} onOpenChange={setEditScheduleOpen} title="Schedule Configuration" description={`Configure automated review schedule for ${repoId}`}>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Enable Schedule</label>
            <Checkbox checked={scheduleEnabled} onChange={(s) => setScheduleEnabled(s === "on")} />
          </div>
          <div>
            <Label>Interval (minutes)</Label>
            <Input type="number" value={scheduleInterval} onChange={(e) => setScheduleInterval(e.target.value)} min="1" />
          </div>
          {schedule?.lastRun && (
            <div className="text-sm text-[var(--ds-color-text-primary)]">Last run: {new Date(schedule.lastRun).toLocaleString()}</div>
          )}
          {schedule?.nextRun && (
            <div className="text-sm text-[var(--ds-color-text-primary)]">Next run: {new Date(schedule.nextRun).toLocaleString()}</div>
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
        loading={deleting || removeRepo.loading}
        onConfirm={handleDeleteRepo}
      />
    </PageColumn>
  );
}

function OpenPRsList({ owner, repo }: { owner: string; repo: string }) {
  const { data: openPRs } = useRepoOpenPRs(owner, repo);
  if (!openPRs || openPRs.length === 0) {
    return <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>No open pull requests</p>;
  }
  return (
    <FeedList>
      {openPRs.map((pr) => (
        <FeedItem
          key={pr.number}
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "monospace", color: "var(--ds-color-interactive-accent)" }}>#{pr.number}</span>
              <span>{pr.title}</span>
            </span>
          }
          meta={`by ${pr.author} · ${new Date(pr.createdAt).toLocaleDateString()}`}
          trailing={
            <a href={pr.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ds-color-text-tertiary)" }}>
              <ExternalLink size={16} />
            </a>
          }
        />
      ))}
    </FeedList>
  );
}
