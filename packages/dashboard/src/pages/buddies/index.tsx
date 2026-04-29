import { useState, useRef } from "react";
import { useBuddies, useBuddy, useBuddyFeedback, useMutation, usePageParam, useNavigate } from "~/lib/hooks";
import { api } from "~/lib/api";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
import { Badge } from "~/components/system/badge";
import { Label } from "~/components/system/label";
import { NativeSelect } from "~/components/system/native-select";
import { Users } from "lucide-react";
import { TableSkeleton, Skeleton } from "~/components/system/skeleton";
import { ConfirmDialog } from "~/components/system/confirm-dialog";
import { Card, CardContent } from "~/components/system/card";
import { useToast } from "~/components/system/toast";
import { Pagination } from "~/components/system/pagination";
import { Dialog } from "@base-ui/react/dialog";
import ReactMarkdown from "react-markdown";
import { BuddyComparison } from "~/pages/buddies/_components/buddy-comparison";
import { CreateBuddyDialog } from "~/pages/buddies/_components/create-buddy-dialog";
import { FeedbackSection } from "~/pages/buddies/_components/feedback-section";

export function BuddiesPage() {
  const [page, setPage] = usePageParam();
  const limit = 20;
  const { data, loading, error, refetch } = useBuddies({ page, limit });
  const buddies = data?.data;
  const totalPages = data?.totalPages ?? 1;
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareBuddy1, setCompareBuddy1] = useState<string>("");
  const [compareBuddy2, setCompareBuddy2] = useState<string>("");
  const [showComparison, setShowComparison] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const deleteBuddy = useMutation((id: string) => api.deleteBuddy(id));

  const filtered = buddies?.filter(
    (b) =>
      b.username.toLowerCase().includes(search.toLowerCase()) ||
      b.sourceRepos.some((r) => r.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteBuddy.execute(deleteId);
      showToast({ title: "Buddy deleted", variant: "success" });
      setPage(1);
      refetch();
    } catch (err) {
      console.error("Failed to delete buddy:", err);
      showToast({ title: "Failed to delete buddy", variant: "error" });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await api.importBuddy(text);
      showToast({ title: "Buddy imported successfully", variant: "success" });
      setPage(1);
      refetch();
    } catch (err) {
      console.error("Failed to import buddy:", err);
      showToast({ title: "Failed to import buddy", variant: "error" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorState message={`Error: ${error}`} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Buddies</h1>
          <p className="text-sm text-[var(--ds-color-text-primary)]">AI personas learned from reviewer history</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!compareMode && (
            <Button variant="outline" onClick={() => setCompareMode(true)}>Compare</Button>
          )}
          {compareMode && (
            <>
              <Button variant="ghost" onClick={() => { setCompareMode(false); setCompareBuddy1(""); setCompareBuddy2(""); }}>Cancel</Button>
              <Button
                disabled={!compareBuddy1 || !compareBuddy2 || compareBuddy1 === compareBuddy2}
                onClick={() => setShowComparison(true)}
              >
                Compare Selected
              </Button>
            </>
          )}
          <Button onClick={() => setCreateOpen(true)}>Create Buddy</Button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>Import</Button>
        </div>
      </div>

      {compareMode && (
        <Card className="border-[var(--ds-color-feedback-info-border)] bg-[var(--ds-color-feedback-info-subtle)]">
          <CardContent className="pt-4">
            <p className="mb-3 text-sm text-[var(--ds-color-feedback-info-text)]">Select two buddies to compare:</p>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label>First Buddy</Label>
                <NativeSelect
                  value={compareBuddy1}
                  onChange={(e) => setCompareBuddy1(e.target.value)}
                >
                  <option value="">Select buddy...</option>
                  {buddies?.map((b) => (
                    <option key={b.id} value={b.id}>{b.username}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex-1">
                <Label>Second Buddy</Label>
                <NativeSelect
                  value={compareBuddy2}
                  onChange={(e) => setCompareBuddy2(e.target.value)}
                >
                  <option value="">Select buddy...</option>
                  {buddies?.filter((b) => b.id !== compareBuddy1).map((b) => (
                    <option key={b.id} value={b.id}>{b.username}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Input placeholder="Search buddies..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {filtered?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--ds-color-border-primary)] p-8 text-center">
          {search ? (
            <p className="text-[var(--ds-color-text-primary)]">No buddies match your search</p>
          ) : (
            <>
              <Users className="mx-auto mb-3 h-10 w-10 text-[var(--ds-color-text-secondary)]" />
              <p className="mb-1 text-sm font-medium text-[var(--ds-color-text-secondary)]">No buddies created yet</p>
              <p className="mb-4 text-xs text-[var(--ds-color-text-primary)]">Analyze a reviewer's history to create an AI persona</p>
              <Button onClick={() => setCreateOpen(true)}>Create Buddy</Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered?.map((b) => (
            <Card
              key={b.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer transition-colors"
              onClick={() => navigate(`/buddies/${b.id}`)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/buddies/${b.id}`); } }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--ds-color-text-primary)]">{b.username}</h3>
                  <Badge variant="info">{b.sourceRepos.length} repos</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--ds-color-text-primary)]">{b.sourceRepos.join(", ")}</p>
                <p className="mt-1 text-xs text-[var(--ds-color-text-tertiary)]">Updated {new Date(b.lastUpdated).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <Dialog.Root open={!!selectedId} onOpenChange={(open: boolean) => !open && setSelectedId(null)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-[var(--ds-color-border-primary)] bg-[var(--ds-color-surface-card)] p-4 shadow-xl sm:p-6 mx-4">
            {selectedId && <BuddyDetailPanel id={selectedId} onClose={() => setSelectedId(null)} onDelete={() => { setSelectedId(null); setDeleteId(selectedId); }} />}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {showComparison && compareBuddy1 && compareBuddy2 && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--ds-color-surface-secondary)] p-6">
          <BuddyComparison
            buddyId1={compareBuddy1}
            buddyId2={compareBuddy2}
            onClose={() => { setShowComparison(false); setCompareMode(false); setCompareBuddy1(""); setCompareBuddy2(""); }}
          />
        </div>
      )}

      <CreateBuddyDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={refetch} />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Buddy"
        description="Are you sure you want to delete this buddy? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

function BuddyDetailPanel({ id, onClose, onDelete }: { id: string; onClose: () => void; onDelete: () => void }) {
  const { data: profile, loading } = useBuddy(id);
  const { data: feedback, loading: feedbackLoading } = useBuddyFeedback(id);
  useToast();

  if (loading) return <div className="space-y-4"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div>;
  if (!profile) return <div>Buddy not found</div>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Dialog.Title className="text-lg font-semibold">{profile.username}</Dialog.Title>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDelete}>Delete</Button>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--ds-color-text-primary)] uppercase">Soul Profile</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-4">
            <ReactMarkdown>{profile.soul}</ReactMarkdown>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--ds-color-text-primary)] uppercase">User Profile</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-4">
            <ReactMarkdown>{profile.user}</ReactMarkdown>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--ds-color-text-primary)] uppercase">Memory</h3>
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-[var(--ds-color-border-secondary)] p-4">
            <ReactMarkdown>{profile.memory}</ReactMarkdown>
          </div>
        </div>

        <FeedbackSection feedback={feedback ?? null} loading={feedbackLoading} limit={5} />

        <p className="text-xs text-[var(--ds-color-text-tertiary)]">
          Source repos: {profile.sourceRepos.join(", ")}
        </p>
      </div>
    </div>
  );
}
