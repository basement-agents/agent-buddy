import { useBuddy } from "~/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/system/card";
import { Badge } from "~/components/system/badge";
import { Button } from "~/components/system/button";
import { ProgressBar } from "~/components/shared/progress-bar";
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
  const sharedRepos = profile1.sourceRepos.filter((r) => profile2.sourceRepos.includes(r));

  const keywords1 = extractKeywords(profile1.soul);
  const keywords2 = extractKeywords(profile2.soul);

  const sharedKeywords = Array.from(keywords1).filter((k: string) => keywords2.has(k));

  const totalUniqueKeywords = new Set([...keywords1, ...keywords2]).size;
  const soulOverlap = totalUniqueKeywords > 0 ? sharedKeywords.length / totalUniqueKeywords : 0;

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
        <h3 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">{profile.username}</h3>
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
      <p className="text-xs text-[var(--ds-color-text-tertiary)]">Source repos: {profile.sourceRepos.join(", ")}</p>
    </div>
  );
}

export function BuddyComparison({ buddyId1, buddyId2, onClose }: BuddyComparisonProps) {
  const { data: profile1 } = useBuddy(buddyId1);
  const { data: profile2 } = useBuddy(buddyId2);

  if (!profile1 || !profile2) {
    return (
      <div className="rounded-lg border border-[var(--ds-color-feedback-danger-border)] bg-[var(--ds-color-feedback-danger-subtle)] p-6 text-center">
        <p className="text-[var(--ds-color-feedback-danger-text)]">One or both buddy profiles could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  }

  const similarity = compareBuddiesSimple(profile1, profile2);
  const similarityPercent = Math.round(similarity.score * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--ds-color-text-primary)]">Comparing Buddies</h2>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Similarity Score</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold text-[var(--ds-color-text-primary)]">{similarityPercent}%</div>
            <div className="flex-1">
              <ProgressBar percentage={similarityPercent} />
            </div>
          </div>
          <div className="mt-4 text-sm">
            <div>
              <span className="font-semibold text-[var(--ds-color-text-secondary)]">Shared Repos:</span>
              <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                {similarity.sharedRepos.length > 0
                  ? similarity.sharedRepos.join(", ")
                  : "None"}
              </p>
            </div>
            <div className="mt-2">
              <span className="font-semibold text-[var(--ds-color-text-secondary)]">Soul Profile Overlap:</span>
              <p className="mt-1 text-[var(--ds-color-text-secondary)]">
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
              <span className="font-semibold text-[var(--ds-color-text-secondary)]">Experience Sources:</span>
              <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                {profile1.username}: {profile1.sourceRepos.length} repositories &bull; {profile2.username}: {profile2.sourceRepos.length} repositories
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
