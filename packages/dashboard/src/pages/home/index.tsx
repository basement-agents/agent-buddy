import { useMemo } from "react";
import {
  FolderGit,
  Users,
  ClipboardCheck,
  Timer,
  TrendingUp,
  TrendingDown,
  FolderPlus,
  UserPlus,
  Eye,
  GitPullRequest,
} from "lucide-react";
import { useRepos, useBuddies, useReviews, useAnalytics, useMetrics, useNavigate } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { stateVariant } from "~/lib/constants";
import {
  FeedList,
  FeedItem,
  FeedAvatar,
  FeedIconWrapper,
  FeedHeader,
} from "~/components/common/feed-list";
import { PageColumn } from "~/components/common/page-column";

/** Format a date to relative time string */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STAT_CONFIG = [
  { key: "repos", label: "Repositories", icon: FolderGit, trend: +12 },
  { key: "buddies", label: "Buddies", icon: Users, trend: +5 },
  { key: "reviews", label: "Total Reviews", icon: ClipboardCheck, trend: +23 },
  { key: "avgTime", label: "Avg Review Time", icon: Timer, trend: -8 },
] as const;

type FeedEntry =
  | { kind: "review"; id: string; title: string; meta: string; timestamp: string; buddyId?: string; state: string }
  | { kind: "buddy"; id: string; name: string; timestamp: string }
  | { kind: "analytics"; label: string; value: string; subLabel: string };

export function HomePage() {
  const { data: repos } = useRepos();
  const { data: buddies } = useBuddies();
  const { data: reviewsData } = useReviews({ limit: 50 });
  const { data: analytics } = useAnalytics();
  const { data: metrics } = useMetrics();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const reviews = reviewsData?.reviews ?? [];
    const totalReviews = reviewsData?.total ?? 0;

    const avgReviewTime =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.metadata.durationMs, 0) / reviews.length
        : 0;

    const stateCounts = reviews.reduce(
      (acc, r) => {
        acc[r.state] = (acc[r.state] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalReviews,
      avgReviewTime: avgReviewTime / 1000,
      stateCounts,
    };
  }, [reviewsData]);

  const statValues: Record<string, string | number> = {
    repos: repos?.data?.length ?? 0,
    buddies: buddies?.data?.length ?? 0,
    reviews: analytics?.totalReviews ?? stats.totalReviews,
    avgTime:
      (analytics?.averageTurnaroundTimeSeconds ?? stats.avgReviewTime) > 0
        ? `${(analytics?.averageTurnaroundTimeSeconds ?? stats.avgReviewTime).toFixed(1)}s`
        : "N/A",
  };

  const buddyEntries = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.perBuddyCounts ?? {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }, [analytics]);
  const buddyMax = buddyEntries.length > 0 ? buddyEntries[0][1] : 0;

  const repoCount = repos?.data?.length ?? 0;
  const buddyCount = buddies?.data?.length ?? 0;

  const feedEntries = useMemo((): FeedEntry[] => {
    const entries: FeedEntry[] = [];

    (reviewsData?.reviews ?? []).slice(0, 5).forEach((r) => {
      entries.push({
        kind: "review",
        id: `${r.metadata.owner}-${r.metadata.repo}-${r.metadata.prNumber}`,
        title: `${r.metadata.owner}/${r.metadata.repo} #${r.metadata.prNumber}`,
        meta: r.buddyId ? `reviewed by ${r.buddyId}` : "reviewed",
        timestamp: r.reviewedAt,
        buddyId: r.buddyId,
        state: r.state,
      });
    });

    (buddies?.data ?? []).slice(0, 3).forEach((b) => {
      entries.push({
        kind: "buddy",
        id: b.id,
        name: b.username,
        timestamp: b.lastUpdated,
      });
    });

    return entries.sort((a, b) => {
      const tA = a.kind !== "analytics" ? new Date(a.timestamp).getTime() : 0;
      const tB = b.kind !== "analytics" ? new Date(b.timestamp).getTime() : 0;
      return tB - tA;
    });
  }, [reviewsData, buddies]);

  return (
    <PageColumn variant="wide">
      <div className="space-y-8">
      <FeedHeader
        title="Workspace"
        meta={`${repoCount} repositories · ${buddyCount} buddies`}
        action={
          <div className="flex flex-col gap-2" style={{ minWidth: 160 }}>
            <Button
              variant="outline"
              size="sm"
              prefix={<FolderPlus size={15} />}
              onClick={() => navigate("/repos")}
            >
              Add Repository
            </Button>
            <Button
              variant="outline"
              size="sm"
              prefix={<UserPlus size={15} />}
              onClick={() => navigate("/buddies")}
            >
              Create Buddy
            </Button>
            <Button
              variant="outline"
              size="sm"
              prefix={<Eye size={15} />}
              onClick={() => navigate("/reviews")}
            >
              View Reviews
            </Button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: "var(--ds-spacing-9)", flexWrap: "wrap" }}>
        {STAT_CONFIG.map((cfg) => {
          const Icon = cfg.icon;
          const isPositiveTrend = cfg.trend >= 0;
          return (
            <div key={cfg.key} style={{ flex: "1 1 120px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Icon size={14} style={{ color: "var(--ds-color-text-secondary)" }} />
                <span style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)" }}>
                  {cfg.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: "var(--ds-text-xl, 22px)",
                    fontWeight: 700,
                    color: "var(--ds-color-text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {statValues[cfg.key]}
                </span>
                <span
                  style={{
                    fontSize: "var(--ds-text-xs, 12px)",
                    color: isPositiveTrend
                      ? "var(--ds-color-feedback-success-text)"
                      : "var(--ds-color-feedback-danger-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  {isPositiveTrend ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(cfg.trend)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {analytics && (
        <div>
          <div
            style={{
              fontSize: "var(--ds-text-base, 15px)",
              fontWeight: 600,
              color: "var(--ds-color-text-primary)",
              marginBottom: "var(--ds-spacing-7)",
            }}
          >
            Review Trends
          </div>
          <div className="space-y-2">
            {[
              { label: "Last 7 days", value: analytics.reviewsLast7Days, max: Math.max(analytics.reviewsLast7Days, analytics.reviewsLast30Days, 1) },
              { label: "Last 30 days", value: analytics.reviewsLast30Days, max: Math.max(analytics.reviewsLast7Days, analytics.reviewsLast30Days, 1) },
            ].map(({ label, value, max }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 90, flexShrink: 0, fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)" }}>
                  {label}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "var(--ds-color-surface-secondary)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
                      borderRadius: 3,
                      backgroundColor: "var(--ds-color-text-primary)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span style={{ width: 32, textAlign: "right", fontSize: "var(--ds-text-sm, 13px)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--ds-color-text-primary)" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {buddyEntries.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "var(--ds-text-base, 15px)",
              fontWeight: 600,
              color: "var(--ds-color-text-primary)",
              marginBottom: "var(--ds-spacing-7)",
            }}
          >
            Per-Buddy Reviews
          </div>
          <div className="space-y-2">
            {buddyEntries.map(([buddyId, count]) => (
              <div key={buddyId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 90, flexShrink: 0, fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {buddyId}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: "var(--ds-color-surface-secondary)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${buddyMax > 0 ? Math.min((count / buddyMax) * 100, 100) : 0}%`,
                      borderRadius: 3,
                      backgroundColor: "var(--ds-color-text-primary)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span style={{ width: 32, textAlign: "right", fontSize: "var(--ds-text-sm, 13px)", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--ds-color-text-primary)" }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {buddyEntries.length === 0 && analytics && (
        <p style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-primary)" }}>No buddy data available</p>
      )}

      {metrics && (
        <div style={{ display: "flex", gap: "var(--ds-spacing-9)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <div style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Error Rate</div>
            <div style={{ fontSize: "var(--ds-text-xl, 22px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ds-color-text-primary)" }}>
              {(metrics.errorRate * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: "var(--ds-text-xs, 12px)", color: "var(--ds-color-text-primary)" }}>
              {metrics.errorCount} errors out of {metrics.totalReviews} reviews
            </div>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <div style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Avg Tokens per Review</div>
            <div style={{ fontSize: "var(--ds-text-xl, 22px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ds-color-text-primary)" }}>
              {(metrics.averageTokensPerReview ?? 0).toLocaleString()}
            </div>
          </div>
          {metrics.averageDurationMs > 0 && (
            <div style={{ flex: "1 1 120px" }}>
              <div style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-secondary)", marginBottom: 4 }}>Avg Review Duration</div>
              <div style={{ fontSize: "var(--ds-text-xl, 22px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ds-color-text-primary)" }}>
                {(metrics.averageDurationMs / 1000).toFixed(1)}s
              </div>
            </div>
          )}
        </div>
      )}

      {stats.totalReviews > 0 && (
        <div>
          <div
            style={{
              fontSize: "var(--ds-text-base, 15px)",
              fontWeight: 600,
              color: "var(--ds-color-text-primary)",
              marginBottom: "var(--ds-spacing-7)",
            }}
          >
            Review Statistics
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--ds-text-sm, 13px)",
                fontWeight: 600,
                color: "var(--ds-color-text-secondary)",
                marginBottom: 8,
              }}
            >
              Review States
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(analytics?.reviewStates || stats.stateCounts).map(([state, count]) => (
                <Badge key={state} variant={stateVariant[state] || "default"}>
                  {state.replace("_", " ")}: {count}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {stats.totalReviews === 0 && (
        <p style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-primary)" }}>No reviews yet</p>
      )}

      <div>
        <div
          style={{
            fontSize: "var(--ds-text-base, 15px)",
            fontWeight: 600,
            color: "var(--ds-color-text-primary)",
            marginBottom: "var(--ds-spacing-7)",
          }}
        >
          Recent Activity
        </div>
        {feedEntries.length === 0 ? (
          <p style={{ fontSize: "var(--ds-text-sm, 13px)", color: "var(--ds-color-text-primary)" }}>No reviews yet</p>
        ) : (
          <FeedList>
            {feedEntries.map((entry) => {
              if (entry.kind === "review") {
                return (
                  <FeedItem
                    key={`review-${entry.id}`}
                    leading={
                      entry.buddyId ? (
                        <FeedAvatar name={entry.buddyId} />
                      ) : (
                        <FeedIconWrapper>
                          <GitPullRequest size={18} />
                        </FeedIconWrapper>
                      )
                    }
                    title={entry.title}
                    meta={
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Badge variant={stateVariant[entry.state] || "default"} size="small">
                          {entry.state.replace("_", " ")}
                        </Badge>
                        <span>{entry.meta}</span>
                      </span>
                    }
                    trailing={<span>{relativeTime(entry.timestamp)}</span>}
                    onClick={() => navigate(`/reviews/${entry.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/reviews/${entry.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  />
                );
              }

              if (entry.kind === "buddy") {
                return (
                  <FeedItem
                    key={`buddy-${entry.id}`}
                    leading={<FeedAvatar name={entry.name} />}
                    title={entry.name}
                    meta="buddy added"
                    trailing={<span>{relativeTime(entry.timestamp)}</span>}
                    onClick={() => navigate(`/buddies/${entry.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/buddies/${entry.id}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  />
                );
              }

              return null;
            })}
          </FeedList>
        )}
      </div>
      </div>
    </PageColumn>
  );
}
