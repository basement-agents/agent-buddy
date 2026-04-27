import { useState } from "react";
import { useBuddyComparison, useNavigate } from "~/lib/hooks";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { ErrorState } from "~/components/system/error-state";
import { Input } from "~/components/system/input";
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Compare Buddies</h1>
        <p className="text-sm text-zinc-500">Analyze similarities between two buddy profiles</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input className="flex-1" placeholder="Buddy ID 1..." value={id1} onChange={(e) => setId1(e.target.value)} />
        <Input className="flex-1" placeholder="Buddy ID 2..." value={id2} onChange={(e) => setId2(e.target.value)} />
        <Button onClick={handleCompare} disabled={!id1 || !id2 || id1 === id2}>
          Compare
        </Button>
      </div>

      {id1 && id2 && id1 === id2 && (
        <p className="text-sm text-red-500">Cannot compare a buddy with itself</p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-500">Loading comparison...</div>
        </div>
      )}

      {error && (
        <ErrorState message={error} className="p-4" />
      )}

      {data && (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-900 dark:text-white">Overall Similarity</span>
              <Badge variant={scoreVariant}>{scorePercent}%</Badge>
            </div>
            <ProgressBar percentage={scorePercent} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500">Soul Overlap</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{Math.round(data.soulOverlap * 100)}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500">Philosophy</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{Math.round(data.analysis.philosophySimilarity * 100)}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500">Expertise Overlap</p>
              <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-white">{Math.round(data.analysis.expertiseOverlap * 100)}%</p>
            </div>
          </div>

          {data.sharedKeywords.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Shared Keywords</p>
              <div className="flex flex-wrap gap-1">
                {data.sharedKeywords.map((kw) => (
                  <Badge key={kw} variant="default">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {data.sharedRepos.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Shared Repos</p>
              <div className="flex flex-wrap gap-1">
                {data.sharedRepos.map((repo) => (
                  <Badge key={repo} variant="default">{repo}</Badge>
                ))}
              </div>
            </div>
          )}

          {data.analysis.commonPatterns.length > 0 && (
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Common Patterns</p>
              <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {data.analysis.commonPatterns.map((p, i) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
