import type { BuddyProfile } from "./types.js";

export interface SimilarityResult {
  score: number;
  sharedKeywords: string[];
  sharedRepos: string[];
  soulOverlap: number;
  analysis: {
    philosophySimilarity: number;
    expertiseOverlap: number;
    commonPatterns: string[];
  };
}

export function compareBuddies(buddy1: BuddyProfile, buddy2: BuddyProfile): SimilarityResult {
  // Extract keywords from soul profiles
  const keywords1 = extractKeywords(buddy1.soul);
  const keywords2 = extractKeywords(buddy2.soul);

  // Calculate shared keywords
  const sharedKeywords = Array.from(keywords1).filter((k) => keywords2.has(k));

  // Calculate keyword overlap ratio
  const totalUniqueKeywords = new Set([...keywords1, ...keywords2]).size;
  const soulOverlap = totalUniqueKeywords > 0 ? sharedKeywords.length / totalUniqueKeywords : 0;

  // Find shared repos
  const sharedRepos = buddy1.sourceRepos.filter((r) => buddy2.sourceRepos.includes(r));

  // Analyze philosophy similarity
  const philosophySimilarity = calculatePhilosophySimilarity(buddy1.soul, buddy2.soul);

  // Analyze expertise overlap from user profiles
  const expertiseOverlap = calculateExpertiseOverlap(buddy1.user, buddy2.user);

  // Find common patterns
  const commonPatterns = extractCommonPatterns(buddy1.soul, buddy2.soul);

  // Calculate overall score (weighted average)
  const score = (
    soulOverlap * 0.4 +
    philosophySimilarity * 0.3 +
    expertiseOverlap * 0.2 +
    (sharedRepos.length > 0 ? 0.1 : 0)
  );

  return {
    score: Math.min(1, Math.max(0, score)), // Clamp between 0 and 1
    sharedKeywords: Array.from(sharedKeywords),
    sharedRepos,
    soulOverlap,
    analysis: {
      philosophySimilarity,
      expertiseOverlap,
      commonPatterns,
    },
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

  // Extract capitalized words (likely proper nouns/concepts)
  const capitalizedWords = soul.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  for (const match of capitalizedWords) {
    const phrase = match[1].toLowerCase();
    if (phrase.length > 3 && phrase.length < 30) {
      keywords.add(phrase);
    }
  }

  // Extract words in quotes (likely emphasis)
  const quotedWords = soul.matchAll(/"([^"]+)"/g);
  for (const match of quotedWords) {
    keywords.add(match[1].toLowerCase());
  }

  return keywords;
}

function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;
  const intersection = new Set([...set1].filter((w) => set2.has(w)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

function extractPatternMatches(text: string, regex: RegExp): Set<string> {
  const matches = new Set<string>();
  for (const match of text.matchAll(regex)) {
    matches.add(match[0].toLowerCase());
  }
  return matches;
}

function calculatePhilosophySimilarity(soul1: string, soul2: string): number {
  const words1 = new Set(soul1.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  const words2 = new Set(soul2.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
  return jaccardSimilarity(words1, words2);
}

function calculateExpertiseOverlap(user1: string, user2: string): number {
  // Look for expertise section indicators
  const expertise1 = extractSection(user1, ["expertise", "skills", "technologies"]);
  const expertise2 = extractSection(user2, ["expertise", "skills", "technologies"]);

  if (!expertise1 || !expertise2) return 0;

  const keywords1 = extractKeywords(expertise1);
  const keywords2 = extractKeywords(expertise2);

  return jaccardSimilarity(keywords1, keywords2);
}

function extractCommonPatterns(soul1: string, soul2: string): string[] {
  const patternRegex = /I\s+(prefer|avoid|always|never|recommend|don't like)\s+([^.]+)\./gi;

  const patterns1 = extractPatternMatches(soul1, patternRegex);
  const patterns2 = extractPatternMatches(soul2, patternRegex);

  return [...patterns1].filter((p) => patterns2.has(p));
}

function extractSection(text: string, headings: string[]): string | null {
  const lines = text.split("\n");
  let inSection = false;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if this is a section heading
    if (trimmedLine.startsWith("#")) {
      const headingText = trimmedLine.replace(/^#+\s*/, "").toLowerCase();

      if (headings.some((h) => headingText.includes(h))) {
        inSection = true;
        continue;
      } else if (inSection) {
        // We've reached the next section, stop
        break;
      }
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.length > 0 ? sectionLines.join("\n") : null;
}
