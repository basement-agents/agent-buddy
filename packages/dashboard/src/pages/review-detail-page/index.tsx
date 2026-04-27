import { useState } from "react";
import { cn } from "~/lib/utils";
import { useReview, useNavigate } from "~/lib/hooks";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { ReviewDetail } from "./_components/review-detail";
import { Skeleton } from "~/components/system/skeleton";
import { api } from "~/lib/api";
import { useToast } from "~/components/system/toast";

export function ReviewDetailPage({ reviewIndex }: { reviewIndex: string }) {
  const { data: review, loading, error } = useReview(reviewIndex);
  const [feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !review) {
    return (
      <ErrorState message={error || "Review not found"} onRetry={() => navigate("/reviews")} retryLabel="Back to Reviews" />
    );
  }

  const reviewId = `${review.metadata.owner}-${review.metadata.repo}-${review.metadata.prNumber}`;

  const handleFeedback = async (wasHelpful: boolean) => {
    if (!review.buddyId || feedback) return;
    setSubmittingFeedback(true);
    try {
      await api.submitFeedback(review.buddyId, {
        reviewId,
        commentId: "overall",
        wasHelpful,
      });
      setFeedback(wasHelpful ? "helpful" : "not-helpful");
      showToast({ title: wasHelpful ? "Thanks for the feedback!" : "We'll improve", variant: "success" });
    } catch {
      showToast({ title: "Failed to submit feedback", variant: "error" });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Reviews", href: "/reviews" }, { label: `Review #${review.metadata.prNumber}` }]} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {review.metadata.owner}/{review.metadata.repo} #{review.metadata.prNumber}
          </h1>
          <p className="text-sm text-zinc-500">
            {review.buddyId ? `by ${review.buddyId}` : "No buddy assigned"} &middot;{" "}
            {new Date(review.reviewedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review.buddyId && (
            <div className="flex items-center gap-1 rounded-md border border-zinc-200 p-1 dark:border-zinc-700">
              <button
                onClick={() => handleFeedback(true)}
                disabled={!!feedback || submittingFeedback}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  feedback === "helpful"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                Helpful
              </button>
              <button
                onClick={() => handleFeedback(false)}
                disabled={!!feedback || submittingFeedback}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  feedback === "not-helpful"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                Not Helpful
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/reviews")}>
            Back to Reviews
          </Button>
        </div>
      </div>

      <ReviewDetail review={review} />
    </div>
  );
}
