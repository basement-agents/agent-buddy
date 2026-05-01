import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBuddy, useBuddyFeedback, useReviews, useRepos, useMutation, useNavigate, queryKeys } from "~/lib/hooks";
import { api } from "~/lib/api";
import { Button } from "~/components/system/button";
import { Badge } from "~/components/system/badge";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { ModalDialog } from "~/components/system/modal-dialog";
import ReactMarkdown from "react-markdown";
import { FeedbackSection } from "../buddies/_components/feedback-section";
import { Label } from "~/components/system/label";
import { NativeSelect } from "~/components/system/native-select";
import { Input } from "~/components/system/input";
import { PageColumn } from "~/components/common/page-column";
import { ProfileHeader } from "~/components/common/profile-header";
import { TabStrip } from "~/components/common/tab-strip";
import { FeedList, FeedItem, FeedAvatar } from "~/components/common/feed-list";
import { stateVariant } from "~/lib/constants";

const TABS = [
  { id: "Overview", label: "Overview" },
  { id: "Soul", label: "Soul" },
  { id: "User", label: "User" },
  { id: "Memory", label: "Memory" },
  { id: "Feedback", label: "Feedback" },
] as const;

type Tab = typeof TABS[number]["id"];

export function BuddyDetailPage({ buddyId }: { buddyId: string }) {
  const queryClient = useQueryClient();
  const { data: profile } = useBuddy(buddyId);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { showToast } = useToast();
  const { data: reviews } = useReviews({ buddy: buddyId, limit: 10 });
  const { data: feedback } = useBuddyFeedback(buddyId);
  const { data: repos } = useRepos();
  const refetch = () => queryClient.invalidateQueries({ queryKey: queryKeys.buddy(buddyId) });
  const refetchRepos = () => queryClient.invalidateQueries({ queryKey: queryKeys.repos() });
  const [assignOpen, setAssignOpen] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [triggerPrNumber, setTriggerPrNumber] = useState("");
  const [updateRepo, setUpdateRepo] = useState("");
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const navigate = useNavigate();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const assignBuddy = useMutation((repoId: string, buddyId: string) => api.updateRepo(repoId, { buddyId }));
  const triggerReview = useMutation((owner: string, repo: string, prNumber: number, buddyId: string) =>
    api.triggerReview(owner, repo, prNumber, buddyId));
  const updateBuddy = useMutation((buddyId: string, repo?: string) => api.updateBuddy(buddyId, repo));

  const totalReviews = reviews?.reviews.length || 0;
  const successfulReviews = reviews?.reviews.filter(r => r.state === "approved" || r.state === "commented").length || 0;
  const successRate = totalReviews > 0 ? Math.round((successfulReviews / totalReviews) * 100) : 0;
  const totalComments = reviews?.reviews.reduce((sum, r) => sum + r.comments.length, 0) || 0;
  const avgComments = totalReviews > 0 ? (totalComments / totalReviews).toFixed(1) : "0";

  const assignedRepos = repos?.data?.filter(r => r.buddyId === buddyId) || [];

  const handleAssign = async () => {
    if (!selectedRepo) return;
    try {
      await assignBuddy.execute(selectedRepo, buddyId);
      showToast({ title: "Buddy assigned to repository", variant: "success" });
      setAssignOpen(false);
      setSelectedRepo("");
      refetchRepos();
    } catch (err) {
      console.error("Failed to assign buddy:", err);
      showToast({ title: "Failed to assign buddy", variant: "error" });
    }
  };

  const handleTrigger = async () => {
    const repo = repos?.data?.find(r => r.id === selectedRepo);
    if (!repo || !triggerPrNumber) return;
    const prNumber = parseInt(triggerPrNumber, 10);
    if (isNaN(prNumber)) {
      showToast({ title: "Please enter a valid PR number", variant: "warning" });
      return;
    }
    try {
      await triggerReview.execute(repo.owner, repo.repo, prNumber, buddyId);
      showToast({ title: "Review triggered successfully", variant: "success" });
      setTriggerOpen(false);
      setSelectedRepo("");
      setTriggerPrNumber("");
    } catch (err) {
      console.error("Failed to trigger review:", err);
      showToast({ title: "Failed to trigger review", variant: "error" });
    }
  };

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleUpdate = async () => {
    if (!updateRepo) return;
    clearPoll();
    setUpdateStatus("Starting update...");
    try {
      await updateBuddy.execute(buddyId, updateRepo);
      setUpdateStatus("Analyzing review history...");
      let delay = 2000;
      const maxDelay = 10000;
      const poll = async () => {
        try {
          const status = await api.getBuddyStatus(buddyId);
          if (!mountedRef.current) return;
          if (status.status === "completed") {
            clearPoll();
            setUpdateStatus(null);
            setUpdateOpen(false);
            setUpdateRepo("");
            showToast({ title: "Buddy updated successfully", variant: "success" });
            refetch();
          } else if (status.status === "failed") {
            clearPoll();
            setUpdateStatus(`Failed: ${status.error}`);
            showToast({ title: "Buddy update failed", variant: "error" });
          } else {
            if (status.progress) setUpdateStatus(status.progress);
            delay = Math.min(delay * 1.5, maxDelay);
            pollRef.current = setTimeout(poll, delay);
          }
        } catch (err) {
          console.error("Failed to check update status:", err);
          clearPoll();
          setUpdateStatus(null);
          showToast({ title: "Failed to check update status", variant: "error" });
        }
      };
      pollRef.current = setTimeout(poll, delay);
    } catch (err) {
      console.error("Failed to update buddy:", err);
      setUpdateStatus(null);
      showToast({ title: "Failed to update buddy", variant: "error" });
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteBuddy(buddyId);
      showToast({ title: "Buddy deleted", variant: "success" });
      navigate("/buddies");
    } catch (err) {
      console.error("Failed to delete buddy:", err);
      showToast({ title: "Failed to delete buddy", variant: "error" });
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportBuddy(buddyId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${buddyId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export buddy:", err);
      showToast({ title: "Failed to export buddy", variant: "error" });
    }
  };

  if (!profile) {
    return null;
  }

  return (
    <PageColumn variant="feed">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Buddies", href: "/buddies" }, { label: profile.username }]} />

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        <ProfileHeader
          avatar={
            <FeedAvatar name={profile.username} size="lg" />
          }
          title={profile.username}
          subtitle={`Source repos: ${profile.sourceRepos.join(", ")}`}
          actions={
            <>
              <Button size="sm" onClick={() => setAssignOpen(true)}>Assign to Repo</Button>
              <Button size="sm" variant="outline" onClick={() => setTriggerOpen(true)}>Trigger Review</Button>
              <Button variant="outline" size="sm" onClick={() => setUpdateOpen(true)}>Update Profile</Button>
              <Button variant="outline" size="sm" onClick={handleExport}>Export</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
            </>
          }
        />
      </div>

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        <TabStrip
          tabs={[...TABS]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as Tab)}
        />
      </div>

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        {activeTab === "Overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-10)" }}>
            {/* Stats */}
            <section>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Review Statistics</p>
              <FeedList>
                <FeedItem title="Total Reviews" trailing={<span style={{ fontWeight: 700 }}>{totalReviews}</span>} />
                <FeedItem title="Success Rate" trailing={<span style={{ fontWeight: 700, color: "var(--ds-color-feedback-success)" }}>{successRate}%</span>} />
                <FeedItem title="Avg Comments" trailing={<span style={{ fontWeight: 700 }}>{avgComments}</span>} />
                <FeedItem title="Assigned Repos" trailing={<span style={{ fontWeight: 700 }}>{assignedRepos.length}</span>} />
              </FeedList>
            </section>

            {/* Assigned repos */}
            <section>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Repository Assignments</p>
              {assignedRepos.length === 0 ? (
                <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>This buddy is not assigned to any repositories.</p>
              ) : (
                <FeedList>
                  {assignedRepos.map((repo) => (
                    <FeedItem
                      key={repo.id}
                      title={repo.id}
                      meta={`Auto-review: ${repo.autoReview ? "On" : "Off"} · Trigger: ${repo.triggerMode}`}
                      trailing={<Badge variant={repo.autoReview ? "success" : "default"}>{repo.autoReview ? "Active" : "Inactive"}</Badge>}
                    />
                  ))}
                </FeedList>
              )}
            </section>

            {/* Recent review history */}
            <section>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Recent Review History</p>
              {!reviews || reviews.reviews.length === 0 ? (
                <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)" }}>No reviews performed by this buddy yet.</p>
              ) : (
                <FeedList>
                  {reviews.reviews.slice(0, 5).map((review, i) => (
                    <FeedItem
                      key={i}
                      title={`${review.metadata.owner}/${review.metadata.repo} #${review.metadata.prNumber}`}
                      meta={`${review.comments.length} comments · ${new Date(review.reviewedAt).toLocaleDateString()}`}
                      trailing={<Badge variant={stateVariant[review.state] || "default"}>{review.state.replace("_", " ")}</Badge>}
                      onClick={() => navigate(`/reviews/${review.metadata.owner}-${review.metadata.repo}-${review.metadata.prNumber}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") navigate(`/reviews/${review.metadata.owner}-${review.metadata.repo}-${review.metadata.prNumber}`);
                      }}
                    />
                  ))}
                </FeedList>
              )}
            </section>

            {/* Feedback summary */}
            <section>
              <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Feedback Summary</p>
              <FeedbackSection feedback={feedback ?? null} limit={5} />
            </section>
          </div>
        )}

        {activeTab === "Soul" && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            style={{ paddingTop: "var(--ds-spacing-7)", borderTop: "1px solid var(--ds-color-border-secondary)" }}
          >
            <ReactMarkdown>{profile.soul}</ReactMarkdown>
          </div>
        )}

        {activeTab === "User" && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            style={{ paddingTop: "var(--ds-spacing-7)", borderTop: "1px solid var(--ds-color-border-secondary)" }}
          >
            <ReactMarkdown>{profile.user}</ReactMarkdown>
          </div>
        )}

        {activeTab === "Memory" && (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            style={{ paddingTop: "var(--ds-spacing-7)", borderTop: "1px solid var(--ds-color-border-secondary)" }}
          >
            <ReactMarkdown>{profile.memory}</ReactMarkdown>
          </div>
        )}

        {activeTab === "Feedback" && (
          <FeedbackSection feedback={feedback ?? null} limit={10} />
        )}
      </div>

      {/* Dialogs */}
      <ModalDialog open={assignOpen} onOpenChange={setAssignOpen} title="Assign Buddy to Repository" description="Select a repository to assign this buddy to">
        <div className="mt-4 space-y-3">
          <div>
            <Label>Repository</Label>
            <NativeSelect value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)}>
              <option value="">Select a repository...</option>
              {repos?.data?.filter((r) => !r.buddyId).map((repo) => (
                <option key={repo.id} value={repo.id}>{repo.id}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!selectedRepo || assignBuddy.loading}>
            {assignBuddy.loading ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </ModalDialog>

      <ModalDialog open={triggerOpen} onOpenChange={setTriggerOpen} title="Trigger Review" description="Trigger a review for a specific pull request">
        <div className="mt-4 space-y-3">
          <div>
            <Label>Repository</Label>
            <NativeSelect value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)}>
              <option value="">Select a repository...</option>
              {repos?.data?.map((repo) => (
                <option key={repo.id} value={repo.id}>{repo.id}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label>PR Number <span className="text-[var(--ds-color-feedback-danger)]">*</span></Label>
            <Input type="number" placeholder="123" value={triggerPrNumber} onChange={(e) => setTriggerPrNumber(e.target.value)} min="1" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setTriggerOpen(false)}>Cancel</Button>
          <Button onClick={handleTrigger} disabled={!selectedRepo || !triggerPrNumber || triggerReview.loading}>
            {triggerReview.loading ? "Triggering..." : "Trigger Review"}
          </Button>
        </div>
      </ModalDialog>

      <ModalDialog open={updateOpen} onOpenChange={(open) => { if (!open) clearPoll(); setUpdateOpen(open); }} title="Update Buddy Profile" description="Analyze additional review history to update this buddy's persona">
        <div className="mt-4 space-y-3">
          <div>
            <Label>Repository (optional)</Label>
            <Input placeholder="owner/repo" value={updateRepo} onChange={(e) => setUpdateRepo(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Leave empty to use source repos from profile</p>
          </div>
          {updateStatus && (
            <div className="rounded-md bg-[var(--ds-color-feedback-info-subtle)] p-3">
              <p className="text-sm text-[var(--ds-color-feedback-info-text)]">{updateStatus}</p>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={!!updateStatus}>Cancel</Button>
          <Button onClick={handleUpdate} disabled={updateBuddy.loading || !!updateStatus}>
            {updateBuddy.loading ? "Updating..." : "Update"}
          </Button>
        </div>
      </ModalDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Buddy"
        description="Are you sure you want to delete this buddy? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </PageColumn>
  );
}
