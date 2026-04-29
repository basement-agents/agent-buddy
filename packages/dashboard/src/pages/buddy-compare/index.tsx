import { useState } from "react";
import { useBuddyComparison, useNavigate } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
import { Card, CardContent } from "~/components/system/card";
import { BuddyComparePageSkeleton } from "~/components/common/page-skeletons";
import { ProgressBar } from "~/components/shared/progress-bar";

export function BuddyComparePage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const [id1, setId1] = useState(params.get("id1") || "");
  const [id2, setId2] = useState(params.get("id2") || "");
  const { data, loading, error } = useBuddyComparison(id1, id2);

  const handleCompare = () => {
    const sp = new URLSearchParams();
    if (id1) sp.set("id1", id1);
    if (id2) sp.set("id2", id2);
    navigate(`/buddies/compare?${sp}`);
  };

  const scorePercent = data ? Math.round(data.score * 100) : 0;
  const scoreVariant = scorePercent > 70 ? "success" : scorePercent > 40 ? "warning" : "error";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Compare Buddies</h1>
        <p className="text-sm text-[var(--ds-color-text-primary)]">Analyze similarities between two buddy profiles</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input className="flex-1" placeholder="Buddy ID 1..." value={id1} onChange={(e) => setId1(e.target.value)} />
        <Input className="flex-1" placeholder="Buddy ID 2..." value={id2} onChange={(e) => setId2(e.target.value)} />
        <Button onClick={handleCompare} disabled={!id1 || !id2 || id1 === id2}>
          Compare
        </Button>
      </div>

      {id1 && id2 && id1 === id2 && (
        <p className="text-sm text-[var(--ds-color-feedback-danger)]">Cannot compare a buddy with itself</p>
      )}

      {loading && <BuddyComparePageSkeleton />}

      {error && (
        <ErrorState message={error} className="p-4" />
      )}

      {data && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--ds-color-text-primary)]">Overall Similarity</span>
                <Badge variant={scoreVariant}>{scorePercent}%</Badge>
              </div>
              <ProgressBar percentage={scorePercent} />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-[var(--ds-color-text-primary)]">Soul Overlap</p>
                <p className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">{Math.round(data.soulOverlap * 100)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-[var(--ds-color-text-primary)]">Philosophy</p>
                <p className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">{Math.round(data.analysis.philosophySimilarity * 100)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-[var(--ds-color-text-primary)]">Expertise Overlap</p>
                <p className="mt-1 text-lg font-bold text-[var(--ds-color-text-primary)]">{Math.round(data.analysis.expertiseOverlap * 100)}%</p>
              </CardContent>
            </Card>
          </div>

          {data.sharedKeywords.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium text-[var(--ds-color-text-primary)]">Shared Keywords</p>
                <div className="flex flex-wrap gap-1">
                  {data.sharedKeywords.map((kw) => (
                    <Badge key={kw} variant="default">{kw}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.sharedRepos.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium text-[var(--ds-color-text-primary)]">Shared Repos</p>
                <div className="flex flex-wrap gap-1">
                  {data.sharedRepos.map((repo) => (
                    <Badge key={repo} variant="default">{repo}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data.analysis.commonPatterns.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="mb-2 text-sm font-medium text-[var(--ds-color-text-primary)]">Common Patterns</p>
                <ul className="space-y-1 text-sm text-[var(--ds-color-text-secondary)]">
                  {data.analysis.commonPatterns.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
