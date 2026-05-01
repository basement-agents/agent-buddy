import { useState } from "react";
import { useReview, useNavigate } from "~/lib/hooks";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Badge } from "~/components/system/badge";
import { Breadcrumb } from "~/components/system/breadcrumb";
import { ReviewDetail } from "./_components/review-detail";
import { api } from "~/lib/api";
import { useToast } from "~/components/system/toast";
import { PageColumn } from "~/components/common/page-column";
import { FeedAvatar } from "~/components/common/feed-list";
import { stateVariant } from "~/lib/constants";

export function ReviewDetailPage({ reviewIndex }: { reviewIndex: string }) {
  const { data: review } = useReview(reviewIndex);
  const [feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  if (!review) {
    return (
      <ErrorState message={"Review not found"} onRetry={() => navigate("/reviews")} retryLabel="Back to Reviews" />
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
    <PageColumn variant="feed">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Reviews", href: "/reviews" }, { label: `Review #${review.metadata.prNumber}` }]} />

      {/* Post-style hero */}
      <div style={{
        display: "flex",
        gap: "var(--ds-spacing-8)",
        alignItems: "flex-start",
        paddingTop: "var(--ds-spacing-9)",
        paddingBottom: "var(--ds-spacing-9)",
        borderBottom: "1px solid var(--ds-color-border-secondary)",
      }}>
        {review.buddyId && (
          <div style={{ flexShrink: 0 }}>
            <FeedAvatar name={review.buddyId} size="md" />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: "var(--ds-text-lg, 17px)",
            fontWeight: 700,
            color: "var(--ds-color-text-primary)",
            margin: 0,
            lineHeight: "var(--ds-line-tight, 1.25)",
          }}>
            {review.metadata.owner}/{review.metadata.repo} #{review.metadata.prNumber}
          </h1>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--ds-spacing-7)",
            marginTop: 6,
            flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)" }}>
              {review.buddyId ? `by ${review.buddyId}` : "No buddy assigned"}
            </span>
            <span style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-tertiary)" }}>
              {new Date(review.reviewedAt).toLocaleString()}
            </span>
            <Badge variant={stateVariant[review.state] || "default"}>
              {review.state.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {/* Feedback + nav actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-spacing-7)", flexShrink: 0, flexWrap: "wrap" }}>
          {review.buddyId && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, border: "1px solid var(--ds-color-border-primary)", borderRadius: "var(--ds-radius-3)", padding: 4 }}>
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

      <div style={{ marginTop: "var(--ds-spacing-9)" }}>
        <ReviewDetail review={review} />
      </div>
    </PageColumn>
  );
}
