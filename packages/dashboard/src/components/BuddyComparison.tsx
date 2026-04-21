import { useBuddy } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/ProgressBar";
import ReactMarkdown from "react-markdown";

interface SimilarityResult {
  score: number;
  sharedRepos: string[];
  soulOverlap: number;
}

interface BuddyComparisonProps {
  buddyId1: string;
  buddyId2: string;
  onClose: () => void;
}

function compareBuddiesSimple(profile1: NonNullable<ReturnType<typeof useBuddy>["data"]>, profile2: NonNullable<ReturnType<typeof useBuddy>["data"]>): SimilarityResult {
  // Find shared repos
  const sharedRepos = profile1.sourceRepos.filter((r) => profile2.sourceRepos.includes(r));

  // Extract keywords from soul profiles
  const keywords1 = extractKeywords(profile1.soul);
  const keywords2 = extractKeywords(profile2.soul);

  // Calculate shared keywords
  const sharedKeywords = Array.from(keywords1).filter((k: string) => keywords2.has(k));

  // Calculate keyword overlap ratio
  const totalUniqueKeywords = new Set([...keywords1, ...keywords2]).size;
  const soulOverlap = totalUniqueKeywords > 0 ? sharedKeywords.length / totalUniqueKeywords : 0;

  // Calculate overall score
  const repoScore = sharedRepos.length > 0 ? 0.3 : 0;
  const score = soulOverlap * 0.7 + repoScore;

  return {
    score: Math.min(1, Math.max(0, score)),
    sharedRepos,
    soulOverlap,
  };
}

function extractKeywords(soul: string): Set<string> {
  const keywords = new Set<string>();

  // Common tech/programming terms to look for
  const techTerms = [
    "typescript", "javascript", "python", "rust", "go", "java", "c++",
    "react", "vue", "angular", "svelte", "node", "deno", "bun",
    "testing", "tdd", "bdd", "unit", "integration", "e2e",
    "security", "performance", "optimization", "scalability",
    "architecture", "design", "patterns", "clean code", "refactoring",
    "api", "rest", "graphql", "grpc", "websocket",
    "database", "sql", "nosql", "postgres", "mongodb", "redis",
    "docker", "kubernetes", "ci/cd", "devops", "infrastructure",
    "agile", "scrum", "kanban", "code review", "pr",
  ];

  const lowerSoul = soul.toLowerCase();

  // Extract tech terms
  for (const term of techTerms) {
    if (lowerSoul.includes(term)) {
      keywords.add(term);
    }
  }

  return keywords;
}

function BuddyProfileCard({ profile }: { profile: NonNullable<ReturnType<typeof useBuddy>["data"]> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{profile.username}</h3>
        <Badge variant="info">{profile.sourceRepos.length} repos</Badge>
      </div>
      {[
        { title: "Soul Profile", content: profile.soul },
        { title: "User Profile", content: profile.user },
        { title: "Memory", content: profile.memory },
      ].map((section) => (
        <Card key={section.title}>
          <CardHeader><CardTitle className="text-base">{section.title}</CardTitle></CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-zinc-400">Source repos: {profile.sourceRepos.join(", ")}</p>
    </div>
  );
}

export function BuddyComparison({ buddyId1, buddyId2, onClose }: BuddyComparisonProps) {
  const { data: profile1, loading: loading1 } = useBuddy(buddyId1);
  const { data: profile2, loading: loading2 } = useBuddy(buddyId2);

  if (loading1 || loading2) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Comparing Buddies</h2>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!profile1 || !profile2) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-900/20">
        <p className="text-red-600 dark:text-red-400">One or both buddy profiles could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const similarity = compareBuddiesSimple(profile1, profile2);
  const similarityPercent = Math.round(similarity.score * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Comparing Buddies</h2>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Similarity Score</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-zinc-900 dark:text-white">{similarityPercent}%</div>
            <div className="flex-1">
              <ProgressBar percentage={similarityPercent} />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <div>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Shared Repos:</span>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {similarity.sharedRepos.length > 0
                  ? similarity.sharedRepos.join(", ")
                  : "None"}
              </p>
            </div>
            <div className="mt-2">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Soul Profile Overlap:</span>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {Math.round(similarity.soulOverlap * 100)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <BuddyProfileCard profile={profile1} />
        <BuddyProfileCard profile={profile2} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Key Differences</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Experience Sources:</span>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {profile1.username}: {profile1.sourceRepos.length} repositories &bull; {profile2.username}: {profile2.sourceRepos.length} repositories
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
