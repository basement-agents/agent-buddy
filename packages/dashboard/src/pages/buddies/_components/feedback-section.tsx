import { Badge } from "~/components/system/badge";
import type { BuddyFeedback } from "~/lib/api";

export function FeedbackSection({ feedback, limit }: { feedback: BuddyFeedback | null; limit: number }) {
  if (!feedback) return <p className="text-sm text-[var(--ds-color-text-primary)]">No feedback data available</p>;
  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm">
        <div><span className="font-medium text-[var(--ds-color-feedback-success-text)]">Helpful:</span> {feedback.helpfulCount}</div>
        <div><span className="font-medium text-[var(--ds-color-feedback-danger-text)]">Not Helpful:</span> {feedback.notHelpfulCount}</div>
        <div><span className="font-medium text-[var(--ds-color-text-secondary)]">Total:</span> {feedback.helpfulCount + feedback.notHelpfulCount}</div>
      </div>
      {feedback.recentFeedback.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-[var(--ds-color-text-primary)]">Recent Feedback</h3>
          {feedback.recentFeedback.slice(0, limit).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-md bg-[var(--ds-color-surface-secondary)] px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant={entry.helpful ? "success" : "error"}>{entry.helpful ? "Helpful" : "Not Helpful"}</Badge>
                <span className="text-xs text-[var(--ds-color-text-primary)]">{entry.reviewId}</span>
              </div>
              <span className="text-xs text-[var(--ds-color-text-tertiary)]">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
