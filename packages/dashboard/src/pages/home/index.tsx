import { useMemo } from "react";
import { useRepos, useBuddies, useReviews, useAnalytics, useMetrics, useNavigate } from "~/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/system/card";
import { Skeleton } from "~/components/system/skeleton";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { stateVariant } from "~/lib/constants";

export function HomePage() {
  const { data: repos, loading: reposLoading } = useRepos();
  const { data: buddies, loading: buddiesLoading } = useBuddies();
  const { data: reviewsData, loading: reviewsLoading } = useReviews({ limit: 50 });
  const { data: analytics, loading: analyticsLoading } = useAnalytics();
  const { data: metrics, loading: metricsLoading } = useMetrics();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const reviews = reviewsData?.reviews ?? [];
    const totalReviews = reviewsData?.total ?? 0;

    const avgReviewTime = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.metadata.durationMs, 0) / reviews.length
      : 0;

    const categoryCounts = new Map<string, number>();
    reviews.forEach((review) => {
      review.comments.forEach((comment) => {
        categoryCounts.set(
          comment.category,
          (categoryCounts.get(comment.category) ?? 0) + 1
        );
      });
    });

    const commonCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    const stateCounts = reviews.reduce((acc, r) => {
      acc[r.state] = (acc[r.state] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalReviews,
      avgReviewTime: avgReviewTime / 1000,
      commonCategories,
      stateCounts,
    };
  }, [reviewsData]);

  const statsCards = [
    { label: "Repositories", value: repos?.data?.length ?? 0 },
    { label: "Buddies", value: buddies?.data?.length ?? 0 },
    { label: "Total Reviews", value: analytics?.totalReviews ?? stats.totalReviews },
    { label: "Avg Review Time", value: (analytics?.averageTurnaroundTimeSeconds ?? stats.avgReviewTime) > 0 ? `${(analytics?.averageTurnaroundTimeSeconds ?? stats.avgReviewTime).toFixed(1)}s` : "N/A" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Dashboard</h1>
        <p className="text-sm text-[var(--ds-color-text-primary)]">Overview of your agent-buddy configuration</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {reposLoading || buddiesLoading || reviewsLoading ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          </>
        ) : (
          statsCards.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-[var(--ds-color-text-primary)]">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading review trends...</span>
                <div className="flex items-center justify-between rounded-md bg-[var(--ds-color-surface-secondary)] p-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-8" />
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--ds-color-surface-secondary)] p-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-8" />
                </div>
              </div>
            ) : analytics ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-md bg-[var(--ds-color-surface-secondary)] p-3">
                  <span className="text-sm text-[var(--ds-color-text-secondary)]">Last 7 days</span>
                  <span className="text-lg font-semibold text-[var(--ds-color-text-primary)]">{analytics.reviewsLast7Days}</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[var(--ds-color-surface-secondary)] p-3">
                  <span className="text-sm text-[var(--ds-color-text-secondary)]">Last 30 days</span>
                  <span className="text-lg font-semibold text-[var(--ds-color-text-primary)]">{analytics.reviewsLast30Days}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No analytics data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Buddy Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="space-y-2" role="status" aria-live="polite">
                <span className="sr-only">Loading per-buddy stats...</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-6" />
                  </div>
                ))}
              </div>
            ) : analytics && Object.keys(analytics.perBuddyCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(analytics.perBuddyCounts)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([buddyId, count]) => (
                    <div key={buddyId} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--ds-color-text-secondary)]">{buddyId}</span>
                      <span className="font-medium text-[var(--ds-color-text-primary)]">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No buddy data available</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading error rate...</span>
                <Skeleton className="mb-2 h-8 w-20" />
                <Skeleton className="h-3 w-44" />
              </div>
            ) : metrics ? (
              <div>
                <div className="text-2xl font-bold">{(metrics.errorRate * 100).toFixed(1)}%</div>
                <p className="text-xs text-[var(--ds-color-text-primary)]">{metrics.errorCount} errors out of {metrics.totalReviews} reviews</p>
              </div>
            ) : (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No metrics data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avg Tokens per Review</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : metrics ? (
              <div className="text-2xl font-bold">{metrics.averageTokensPerReview.toLocaleString()}</div>
            ) : (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No metrics data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avg Review Duration</CardTitle>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : metrics && metrics.averageDurationMs > 0 ? (
              <div className="text-2xl font-bold">{(metrics.averageDurationMs / 1000).toFixed(1)}s</div>
            ) : (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No metrics data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {metrics && Object.keys(metrics.perRepo).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-Repository Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(metrics.perRepo)
                .sort(([, a], [, b]) => b.reviews - a.reviews)
                .slice(0, 10)
                .map(([repo, data]) => (
                  <div key={repo} className="flex items-center justify-between rounded-md border border-[var(--ds-color-border-secondary)] p-3 text-sm">
                    <span className="font-medium text-[var(--ds-color-text-primary)]">{repo}</span>
                    <div className="flex items-center gap-4 text-xs text-[var(--ds-color-text-primary)]">
                      <span>{data.reviews} reviews</span>
                      <span>{(data.avgDurationMs / 1000).toFixed(1)}s avg</span>
                      {Object.entries(data.states).map(([state, count]) => (
                        <Badge key={state} variant={stateVariant[state] || "default"}>{count} {state.replace("_", " ")}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Review Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewsLoading ? (
              <div className="space-y-4" role="status" aria-live="polite">
                <span className="sr-only">Loading review statistics...</span>
                <div>
                  <Skeleton className="mb-2 h-4 w-28" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
                <div>
                  <Skeleton className="mb-2 h-4 w-40" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-6" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-6" />
                    </div>
                  </div>
                </div>
              </div>
            ) : stats.totalReviews === 0 ? (
              <p className="text-sm text-[var(--ds-color-text-primary)]">No reviews yet</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-[var(--ds-color-text-secondary)]">Review States</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(analytics?.reviewStates || stats.stateCounts).map(([state, count]) => (
                      <Badge key={state} variant={stateVariant[state] || "default"}>
                        {state.replace("_", " ")}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>

                {stats.commonCategories.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-[var(--ds-color-text-secondary)]">
                      Common Issue Categories
                    </h4>
                    <div className="space-y-2">
                      {stats.commonCategories.map(({ category, count }) => (
                        <div key={category} className="flex items-center justify-between text-sm">
                          <span className="text-[var(--ds-color-text-secondary)]">{category}</span>
                          <span className="font-medium text-[var(--ds-color-text-primary)]">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/repos")}>
              Add Repository
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/buddies")}>
              Create Buddy
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/reviews")}>
              View Reviews
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {reviewsLoading ? (
            <div className="space-y-2" role="status" aria-live="polite">
              <span className="sr-only">Loading recent activity...</span>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-[var(--ds-color-border-secondary)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : reviewsData?.reviews.length === 0 ? (
            <p className="text-sm text-[var(--ds-color-text-primary)]">No reviews yet</p>
          ) : (
            <div className="space-y-2">
              {reviewsData?.reviews.slice(0, 10).map((r, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-[var(--ds-color-border-secondary)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Badge variant={stateVariant[r.state] || "default"}>{r.state.replace("_", " ")}</Badge>
                    <span className="font-medium text-[var(--ds-color-text-primary)]">
                      {r.metadata.owner}/{r.metadata.repo} #{r.metadata.prNumber}
                    </span>
                    {r.buddyId && (
                      <span className="text-xs text-[var(--ds-color-text-primary)]">by {r.buddyId}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ds-color-text-primary)] sm:gap-3">
                    <span>{r.comments.length} comments</span>
                    <span>{(r.metadata.durationMs / 1000).toFixed(1)}s</span>
                    <span>{new Date(r.reviewedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
