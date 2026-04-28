import { Badge } from "~/components/system/badge";
import type { BuddyFeedback } from "~/lib/api";

export function FeedbackSection({ feedback, loading, limit }: { feedback: BuddyFeedback | null; loading: boolean; limit: number }) {
  if (loading) return <p className="text-sm text-zinc-500">Loading feedback...</p>;
  if (!feedback) return <p className="text-sm text-zinc-500">No feedback data available</p>;
  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm">
        <div><span className="font-medium text-green-600">Helpful:</span> {feedback.helpfulCount}</div>
        <div><span className="font-medium text-red-600">Not Helpful:</span> {feedback.notHelpfulCount}</div>
        <div><span className="font-medium text-zinc-600">Total:</span> {feedback.helpfulCount + feedback.notHelpfulCount}</div>
      </div>
      {feedback.recentFeedback.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Recent Feedback</h3>
          {feedback.recentFeedback.slice(0, limit).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <div className="flex items-center gap-2">
                <Badge variant={entry.helpful ? "success" : "error"}>{entry.helpful ? "Helpful" : "Not Helpful"}</Badge>
                <span className="text-xs text-zinc-500">{entry.reviewId}</span>
              </div>
              <span className="text-xs text-zinc-400">{new Date(entry.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
