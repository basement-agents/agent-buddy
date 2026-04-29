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
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
            {review.metadata.owner}/{review.metadata.repo} #{review.metadata.prNumber}
          </h1>
          <p className="text-sm text-[var(--ds-color-text-primary)]">
            {review.buddyId ? `by ${review.buddyId}` : "No buddy assigned"} &middot;{" "}
            {new Date(review.reviewedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review.buddyId && (
            <div className="flex items-center gap-1 rounded-md border border-[var(--ds-color-border-primary)] p-1">
              <Button
                disabled={!!feedback || submittingFeedback}
                onClick={() => handleFeedback(true)}
                size="x-small"
                variant={feedback === "helpful" ? "success" : "ghost"}
              >
                Helpful
              </Button>
              <Button
                disabled={!!feedback || submittingFeedback}
                onClick={() => handleFeedback(false)}
                size="x-small"
                variant={feedback === "not-helpful" ? "error" : "ghost"}
              >
                Not Helpful
              </Button>
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
