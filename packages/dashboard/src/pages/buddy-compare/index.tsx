import { useState, Suspense } from "react";
import { useBuddyComparison, useNavigate } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
import { Spinner } from "~/components/system/spinner";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { ProgressBar } from "~/components/shared/progress-bar";
import { PageColumn } from "~/components/common/page-column";
import { FeedList, FeedItem } from "~/components/common/feed-list";

function ComparisonResult({ id1, id2 }: { id1: string; id2: string }) {
  const { data } = useBuddyComparison(id1, id2);

  if (!data) return null;

  const scorePercent = Math.round(data.score * 100);
  const scoreVariant = scorePercent > 70 ? "success" : scorePercent > 40 ? "warning" : "error";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-10)", marginTop: "var(--ds-spacing-9)" }}>
      <section>
        <FeedList>
          <FeedItem
            title="Overall Similarity"
            trailing={<Badge variant={scoreVariant}>{scorePercent}%</Badge>}
          />
        </FeedList>
        <div style={{ marginTop: "var(--ds-spacing-7)" }}>
          <ProgressBar percentage={scorePercent} />
        </div>
      </section>

      <section>
        <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Breakdown</p>
        <FeedList>
          <FeedItem title="Soul Overlap" trailing={<span style={{ fontWeight: 700, color: "var(--ds-color-text-primary)" }}>{Math.round(data.soulOverlap * 100)}%</span>} />
          <FeedItem title="Philosophy" trailing={<span style={{ fontWeight: 700, color: "var(--ds-color-text-primary)" }}>{Math.round(data.analysis.philosophySimilarity * 100)}%</span>} />
          <FeedItem title="Expertise Overlap" trailing={<span style={{ fontWeight: 700, color: "var(--ds-color-text-primary)" }}>{Math.round(data.analysis.expertiseOverlap * 100)}%</span>} />
        </FeedList>
      </section>

      {data.sharedKeywords.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Shared Keywords</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.sharedKeywords.map((kw) => (
              <Badge key={kw} variant="default">{kw}</Badge>
            ))}
          </div>
        </section>
      )}

      {data.sharedRepos.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Shared Repos</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.sharedRepos.map((repo) => (
              <Badge key={repo} variant="default">{repo}</Badge>
            ))}
          </div>
        </section>
      )}

      {data.analysis.commonPatterns.length > 0 && (
        <section>
          <p style={{ fontSize: "var(--ds-text-base)", fontWeight: 600, color: "var(--ds-color-text-primary)", marginBottom: "var(--ds-spacing-7)" }}>Common Patterns</p>
          <FeedList>
            {data.analysis.commonPatterns.map((p, i) => (
              <FeedItem key={i} title={`• ${p}`} />
            ))}
          </FeedList>
        </section>
      )}
    </div>
  );
}

export function BuddyComparePage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [id1, setId1] = useState(params.get("id1") || "");
  const [id2, setId2] = useState(params.get("id2") || "");
  const ready = !!(id1 && id2 && id1 !== id2);

  const handleCompare = () => {
    const sp = new URLSearchParams();
    if (id1) sp.set("id1", id1);
    if (id2) sp.set("id2", id2);
    navigate(`/buddies/compare?${sp}`);
  };

  return (
    <PageColumn variant="wide">
      <div>
        <h1 style={{ fontSize: "var(--ds-text-xl, 22px)", fontWeight: 700, color: "var(--ds-color-text-primary)", margin: 0 }}>Compare Buddies</h1>
        <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", marginTop: 4 }}>Analyze similarities between two buddy profiles</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-7)", marginTop: "var(--ds-spacing-9)" }}>
        <div style={{ display: "flex", gap: "var(--ds-spacing-7)", flexWrap: "wrap" }}>
          <Input style={{ flex: 1 }} placeholder="Buddy ID 1..." value={id1} onChange={(e) => setId1(e.target.value)} />
          <Input style={{ flex: 1 }} placeholder="Buddy ID 2..." value={id2} onChange={(e) => setId2(e.target.value)} />
          <Button onClick={handleCompare} disabled={!id1 || !id2 || id1 === id2}>
            Compare
          </Button>
        </div>

        {id1 && id2 && id1 === id2 && (
          <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-feedback-danger)", margin: 0 }}>Cannot compare a buddy with itself</p>
        )}
      </div>

      {ready && (
        <ErrorBoundary fallback={<ErrorState message="Failed to load comparison" className="p-4" />}>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
                <span className="sr-only">Loading comparison...</span>
                <Spinner size="medium" />
              </div>
            }
          >
            <ComparisonResult id1={id1} id2={id2} />
          </Suspense>
        </ErrorBoundary>
      )}
    </PageColumn>
  );
}
