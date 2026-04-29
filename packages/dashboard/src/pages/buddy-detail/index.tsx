import { useState, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { useBuddy, useBuddyFeedback, useReviews, useRepos, useMutation, useNavigate } from "~/lib/hooks";
import { api } from "~/lib/api";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Badge } from "~/components/system/badge";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { useToast } from "~/components/system/toast";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/system/card";
import { BuddyDetailPageSkeleton } from "~/components/common/page-skeletons";
import { ModalDialog } from "~/components/system/modal-dialog";
import ReactMarkdown from "react-markdown";
import { FeedbackSection } from "../buddies/_components/feedback-section";
import { Label } from "~/components/system/label";
import { NativeSelect } from "~/components/system/native-select";
import { Input } from "~/components/system/input";

const TABS = ["Overview", "Soul", "User", "Memory", "Feedback"] as const;
type Tab = (typeof TABS)[number];
const STATE_VARIANT: Record<string, "success" | "warning" | "error" | "default"> = { approved: "success", commented: "warning", changes_requested: "error" };

export function BuddyDetailPage({ buddyId }: { buddyId: string }) {
  const { data: profile, loading, error, refetch } = useBuddy(buddyId);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { showToast } = useToast();
  const { data: reviews } = useReviews({ buddy: buddyId, limit: 10 });
  const { data: feedback, loading: feedbackLoading } = useBuddyFeedback(buddyId);
  const { data: repos, refetch: refetchRepos } = useRepos();
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

  if (loading) return <BuddyDetailPageSkeleton />;

  if (error || !profile) {
    return (
      <ErrorState message={error || "Buddy not found"} onRetry={() => navigate("/buddies")} retryLabel="Back to Buddies" />
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Buddies", href: "/buddies" }, { label: profile.username }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">{profile.username}</h1>
          <p className="text-sm text-[var(--ds-color-text-primary)]">Source repos: {profile.sourceRepos.join(", ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>Export</Button>
          <Button variant="outline" size="sm" onClick={() => setUpdateOpen(true)}>Update Profile</Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>Delete</Button>
        </div>
      </div>

      <div className="border-b border-[var(--ds-color-border-primary)]">
        <nav className="flex gap-4 overflow-x-auto sm:gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors",
                activeTab === tab
                  ? "border-[var(--ds-color-border-primary)] text-[var(--ds-color-text-primary)]"
                  : "border-transparent text-[var(--ds-color-text-primary)] hover:border-[var(--ds-color-border-primary)] hover:text-[var(--ds-color-text-secondary)]",
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "Overview" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" onClick={() => setAssignOpen(true)}>Assign to Repo</Button>
                <Button size="sm" variant="outline" onClick={() => setTriggerOpen(true)}>Trigger Review</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div>
                  <p className="text-sm text-[var(--ds-color-text-primary)]">Total Reviews</p>
                  <p className="text-2xl font-semibold text-[var(--ds-color-text-primary)]">{totalReviews}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--ds-color-text-primary)]">Success Rate</p>
                  <p className="text-2xl font-semibold text-[var(--ds-color-text-primary)]">{successRate}%</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--ds-color-text-primary)]">Avg Comments</p>
                  <p className="text-2xl font-semibold text-[var(--ds-color-text-primary)]">{avgComments}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--ds-color-text-primary)]">Assigned Repos</p>
                  <p className="text-2xl font-semibold text-[var(--ds-color-text-primary)]">{assignedRepos.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Repository Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {assignedRepos.length === 0 ? (
                <p className="text-sm text-[var(--ds-color-text-primary)]">This buddy is not assigned to any repositories.</p>
              ) : (
                <div className="space-y-2">
                  {assignedRepos.map((repo) => (
                    <div key={repo.id} className="flex items-center justify-between rounded-md border border-[var(--ds-color-border-primary)] px-3 py-2">
                      <div>
                        <span className="font-medium text-[var(--ds-color-text-primary)]">{repo.id}</span>
                        <div className="flex gap-2 text-xs text-[var(--ds-color-text-primary)]">
                          <span>Auto-review: {repo.autoReview ? "On" : "Off"}</span>
                          <span>Trigger: {repo.triggerMode}</span>
                        </div>
                      </div>
                      <Badge variant={repo.autoReview ? "success" : "default"}>
                        {repo.autoReview ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Review History</CardTitle>
            </CardHeader>
            <CardContent>
              {!reviews || reviews.reviews.length === 0 ? (
                <p className="text-sm text-[var(--ds-color-text-primary)]">No reviews performed by this buddy yet.</p>
              ) : (
                <div className="space-y-2">
                  {reviews.reviews.slice(0, 5).map((review, i) => {
                    return (
                      <div
                        key={i}
                        className="flex cursor-pointer items-center justify-between rounded-md border border-[var(--ds-color-border-primary)] px-3 py-2 hover:bg-[var(--ds-color-surface-secondary)]"
                        onClick={() => navigate(`/reviews/${review.metadata.owner}-${review.metadata.repo}-${review.metadata.prNumber}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant={STATE_VARIANT[review.state] || "default"}>
                            {review.state.replace("_", " ")}
                          </Badge>
                          <span className="text-sm font-medium text-[var(--ds-color-text-primary)]">
                            {review.metadata.owner}/{review.metadata.repo} #{review.metadata.prNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--ds-color-text-primary)]">
                          <span>{review.comments.length} comments</span>
                          <span>{new Date(review.reviewedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feedback Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <FeedbackSection feedback={feedback ?? null} loading={feedbackLoading} limit={5} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "Soul" && (
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-6">
          <ReactMarkdown>{profile.soul}</ReactMarkdown>
        </div>
      )}

      {activeTab === "User" && (
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-6">
          <ReactMarkdown>{profile.user}</ReactMarkdown>
        </div>
      )}

      {activeTab === "Memory" && (
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-6">
          <ReactMarkdown>{profile.memory}</ReactMarkdown>
        </div>
      )}

      {activeTab === "Feedback" && <FeedbackSection feedback={feedback ?? null} loading={feedbackLoading} limit={10} />}

      <ModalDialog open={assignOpen} onOpenChange={setAssignOpen} title="Assign Buddy to Repository" description="Select a repository to assign this buddy to">
            <div className="mt-4 space-y-3">
              <div>
                <Label>Repository</Label>
                <NativeSelect
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                >
                  <option value="">Select a repository...</option>
                  {repos?.data?.filter((r) => !r.buddyId).map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.id}
                    </option>
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
                <NativeSelect
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                >
                  <option value="">Select a repository...</option>
                  {repos?.data?.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.id}
                    </option>
                  ))}
                </NativeSelect>
              </div>
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
                <Input
                  placeholder="owner/repo"
                  value={updateRepo}
                  onChange={(e) => setUpdateRepo(e.target.value)}
                />
                <p className="mt-1 text-xs text-[var(--ds-color-text-primary)]">Leave empty to use source repos from profile</p>
              </div>
              {updateStatus && (
                <div className="rounded-md bg-[var(--ds-color-feedback-info-subtle)] p-3">
                  <p className="text-sm text-[var(--ds-color-feedback-info-text)]">{updateStatus}</p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={!!updateStatus}>
                Cancel
              </Button>
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
    </div>
  );
}
