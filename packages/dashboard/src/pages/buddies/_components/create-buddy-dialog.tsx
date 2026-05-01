import { useState, useRef, useEffect } from "react";
import { ModalDialog } from "~/components/system/modal-dialog";
import { Button } from "~/components/system/button";
import { Input } from "~/components/system/input";
import { Label } from "~/components/system/label";
import { ProgressBar } from "~/components/shared/progress-bar";
import { useRepos, useMutation } from "~/lib/hooks";
import { api } from "~/lib/api";
import type { RepoConfig } from "~/lib/api";

interface CreateBuddyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateBuddyDialog({ open, onOpenChange, onSuccess }: CreateBuddyDialogProps) {
  const [step, setStep] = useState(1);
  const [repo, setRepo] = useState("");
  const [username, setUsername] = useState("");
  const [maxPrs, setMaxPrs] = useState("20");
  const [status, setStatus] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPoll();
  }, []);

  const { data: repos } = useRepos();

  const createBuddy = useMutation(
    (username: string, repo: string, maxPrs?: number) => api.createBuddy(username, repo, maxPrs)
  );

  const reset = () => {
    clearPoll();
    setStep(1);
    setRepo("");
    setUsername("");
    setMaxPrs("20");
    setStatus(null);
    setJobId(null);
    setError(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const canProceed = () => {
    if (step === 1) return repo.includes("/") && repo.split("/").length === 2;
    if (step === 2) return username.length > 0;
    return true;
  };

  const handleCreate = async () => {
    setError(null);
    setStatus("Creating analysis job...");
    try {
      const result = await createBuddy.execute(username, repo, parseInt(maxPrs, 10) || 20);
      setJobId(result.jobId);
      setStatus("Analysis job queued. Processing...");
      setStep(4);

      let delay = 2000;
      const maxDelay = 10000;
      const poll = async () => {
        try {
          const jobStatus = await api.getJobStatus(result.jobId);
          if (jobStatus.status === "completed") {
            setStatus("completed");
            return;
          } else if (jobStatus.status === "failed") {
            setError(jobStatus.error || "Analysis failed");
            setStatus(null);
            return;
          } else if (jobStatus.progress) {
            setStatus(`Processing: ${Math.round(jobStatus.progress * 100)}%`);
          }
          delay = Math.min(delay * 1.5, maxDelay);
          pollRef.current = setTimeout(poll, delay);
        } catch (err) {
          console.error("Error polling buddy creation status", err);
          return;
        }
      };
      pollRef.current = setTimeout(poll, delay);
    } catch (err) {
      console.error("Failed to create buddy", err);
      setError("Failed to create buddy");
      setStatus(null);
    }
  };

  const stepLabels = ["Select Repo", "Enter Username", "Configure", "Creating..."];

  return (
    <ModalDialog open={open} onOpenChange={handleClose} title="Create Buddy" description="Analyze a reviewer's history to create an AI persona">
          <div className="mt-4 flex gap-2">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    i + 1 <= step
                      ? "bg-[var(--ds-color-interactive-info)] text-white"
                      : "bg-[var(--ds-color-surface-neutral)] text-[var(--ds-color-text-primary)]"
                  }`}
                >
                  {i + 1 < step ? "\u2713" : i + 1}
                </div>
                <span className="mt-1 text-[10px] text-[var(--ds-color-text-primary)]">{label}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            {step === 1 && (
              <div className="space-y-3">
                <Label>
                  Repository <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  placeholder="owner/repo"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                />
                {repos && repos.data.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-[var(--ds-color-text-primary)]">Or select a configured repo:</p>
                    <div className="flex flex-wrap gap-1">
                      {repos.data.map((r: RepoConfig) => (
                        <Button
                          key={r.id}
                          variant={repo === r.id ? "info" : "outline"}
                          size="x-small"
                          onClick={() => setRepo(r.id)}
                        >
                          {r.id}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {!repo.includes("/") && repo.length > 0 && (
                  <p className="text-xs text-[var(--ds-color-feedback-danger)]">Format: owner/repo</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <Label>
                  GitHub Username <span className="text-[var(--ds-color-feedback-danger)]">*</span>
                </Label>
                <Input
                  placeholder="reviewer-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <p className="text-xs text-[var(--ds-color-text-primary)]">
                  The GitHub user whose review style will be learned
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <Label>
                  Max PRs to analyze
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={maxPrs}
                  onChange={(e) => setMaxPrs(e.target.value)}
                />
                <p className="text-xs text-[var(--ds-color-text-primary)]">
                  More PRs = better persona, but slower analysis
                </p>
                <div className="rounded-md border border-[var(--ds-color-border-primary)] p-3">
                  <p className="text-xs font-medium text-[var(--ds-color-text-secondary)]">Summary</p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-primary)]">
                    Analyze <strong>{username}</strong> on <strong>{repo}</strong>
                  </p>
                  <p className="text-xs text-[var(--ds-color-text-primary)]">Up to {maxPrs} pull requests</p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                {status && status !== "completed" && (
                  <div className="rounded-md bg-[var(--ds-color-feedback-info-subtle)] p-3">
                    <ProgressBar
                      label="Creating buddy"
                      statusText={status}
                      indeterminate={!status.includes("%")}
                      variant="default"
                    />
                  </div>
                )}
                {error && (
                  <div className="rounded-md border border-[var(--ds-color-feedback-danger-border)] bg-[var(--ds-color-feedback-danger-subtle)] p-3 text-sm text-[var(--ds-color-feedback-danger-text)]">
                    {error}
                  </div>
                )}
                {status === "completed" && jobId && (
                  <div className="rounded-md border border-[var(--ds-color-feedback-success-border)] bg-[var(--ds-color-feedback-success-subtle)] p-3 text-sm text-[var(--ds-color-feedback-success-text)]/10">
                    <p className="font-medium">Buddy created successfully!</p>
                    <p className="mt-1 text-xs">
                      Job ID: <code>{jobId}</code>
                    </p>
                    <a
                      href={`/buddies/${username}`}
                      className="mt-2 inline-block text-xs font-medium text-[var(--ds-color-feedback-info-text)] hover:underline"
                      onClick={() => { handleClose(false); onSuccess(); }}
                    >
                      View buddy profile &rarr;
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            {step > 1 && step < 4 ? (
              <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
            ) : (
              <div />
            )}
            {step < 3 && (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Next
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleCreate} disabled={createBuddy.loading}>
                {createBuddy.loading ? "Creating..." : "Create"}
              </Button>
            )}
            {step === 4 && (
              <Button variant="outline" onClick={() => handleClose(false)}>
                {status === "completed" ? "Done" : "Cancel"}
              </Button>
            )}
          </div>
    </ModalDialog>
  );
}
