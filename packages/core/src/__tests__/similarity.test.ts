import { describe, it, expect } from "vitest";
import { compareBuddies } from "../buddy/similarity.js";
import type { BuddyProfile } from "../buddy/types.js";

describe("compareBuddies", () => {
  const createMockBuddy = (
    id: string,
    soul: string,
    user: string,
    sourceRepos: string[] = []
  ): BuddyProfile => ({
    id,
    username: `user${id}`,
    soul,
    user,
    memory: "",
    sourceRepos,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  it("should calculate similarity score between 0 and 1", () => {
    const buddy1 = createMockBuddy(
      "1",
      "I prefer TypeScript and React",
      "Expertise: TypeScript, React"
    );
    const buddy2 = createMockBuddy(
      "2",
      "I like TypeScript and Vue",
      "Expertise: TypeScript, Vue"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("should identify shared keywords", () => {
    const buddy1 = createMockBuddy(
      "1",
      "I prefer TypeScript and React",
      "Expertise: TypeScript, React"
    );
    const buddy2 = createMockBuddy(
      "2",
      "I like TypeScript and React",
      "Expertise: React, Node.js"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedKeywords).toContain("typescript");
    expect(result.sharedKeywords).toContain("react");
  });

  it("should identify shared repos", () => {
    const buddy1 = createMockBuddy(
      "1",
      "Code review philosophy",
      "User profile",
      ["repo1", "repo2", "repo3"]
    );
    const buddy2 = createMockBuddy(
      "2",
      "Different philosophy",
      "Different profile",
      ["repo2", "repo4"]
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedRepos).toContain("repo2");
    expect(result.sharedRepos).not.toContain("repo1");
    expect(result.sharedRepos).not.toContain("repo4");
  });

  it("should calculate soul overlap ratio", () => {
    const buddy1 = createMockBuddy(
      "1",
      "I prefer TypeScript and React testing",
      "Expertise: TypeScript"
    );
    const buddy2 = createMockBuddy(
      "2",
      "I like TypeScript and React",
      "Expertise: React"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.soulOverlap).toBeGreaterThanOrEqual(0);
    expect(result.soulOverlap).toBeLessThanOrEqual(1);
  });

  it("should return analysis with philosophy similarity", () => {
    const buddy1 = createMockBuddy(
      "1",
      "Clean code is important for maintainability",
      "Expertise: Architecture"
    );
    const buddy2 = createMockBuddy(
      "2",
      "Clean code practices improve maintainability",
      "Expertise: Testing"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.analysis.philosophySimilarity).toBeGreaterThanOrEqual(0);
    expect(result.analysis.philosophySimilarity).toBeLessThanOrEqual(1);
  });

  it("should return analysis with expertise overlap", () => {
    const buddy1 = createMockBuddy(
      "1",
      "Philosophy",
      "# Expertise\nTypeScript, React, Node.js"
    );
    const buddy2 = createMockBuddy(
      "2",
      "Philosophy",
      "# Skills\nTypeScript, Python"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.analysis.expertiseOverlap).toBeGreaterThanOrEqual(0);
    expect(result.analysis.expertiseOverlap).toBeLessThanOrEqual(1);
  });

  it("should extract common patterns from soul text", () => {
    const buddy1 = createMockBuddy(
      "1",
      'I prefer clean code. I always write tests.',
      "Expertise"
    );
    const buddy2 = createMockBuddy(
      "2",
      'I prefer clean code. I always write tests.',
      "Expertise"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.analysis.commonPatterns).toEqual(
      expect.arrayContaining([
        expect.stringContaining("i prefer"),
        expect.stringContaining("i always"),
      ])
    );
  });

  it("should handle empty soul text", () => {
    const buddy1 = createMockBuddy("1", "", "");
    const buddy2 = createMockBuddy("2", "", "");

    const result = compareBuddies(buddy1, buddy2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.sharedKeywords).toEqual([]);
  });

  it("should handle identical soul text", () => {
    const soul = "I prefer TypeScript and React for clean code";
    const buddy1 = createMockBuddy("1", soul, "Expertise: TypeScript");
    const buddy2 = createMockBuddy("2", soul, "Expertise: TypeScript");

    const result = compareBuddies(buddy1, buddy2);
    expect(result.score).toBeGreaterThan(0);
    expect(result.soulOverlap).toBe(1);
  });

  it("should handle completely different soul text", () => {
    const buddy1 = createMockBuddy("1", "TypeScript React Angular", "Expertise: Frontend");
    const buddy2 = createMockBuddy("2", "Python Django Flask", "Expertise: Backend");

    const result = compareBuddies(buddy1, buddy2);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.sharedKeywords).toEqual([]);
  });

  it("should be case insensitive for text comparison", () => {
    const buddy1 = createMockBuddy(
      "1",
      "# Philosophy\n\nI prefer TypeScript and React testing.",
      "# Profile\n\n## Expertise\n\nTypeScript.",
      []
    );
    const buddy2 = createMockBuddy(
      "2",
      "# PHILOSOPHY\n\nI PREFER TYPESCRIPT AND REACT TESTING.",
      "# PROFILE\n\n## EXPERTISE\n\nTYPESCRIPT.",
      []
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.sharedKeywords).toContain("typescript");
    expect(result.sharedKeywords).toContain("react");
  });

  it("should handle no shared repos", () => {
    const buddy1 = createMockBuddy("1", "Philosophy", "User", ["repo1", "repo2"]);
    const buddy2 = createMockBuddy("2", "Philosophy", "User", ["repo3", "repo4"]);

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedRepos).toEqual([]);
  });

  it("should handle all shared repos", () => {
    const repos = ["repo1", "repo2", "repo3"];
    const buddy1 = createMockBuddy("1", "Philosophy", "User", repos);
    const buddy2 = createMockBuddy("2", "Philosophy", "User", repos);

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedRepos).toEqual(repos);
    expect(result.score).toBeGreaterThan(0);
  });

  it("should extract tech terms from soul text", () => {
    const buddy1 = createMockBuddy(
      "1",
      "I work with TypeScript and React",
      "Expertise: Node.js"
    );
    const buddy2 = createMockBuddy(
      "2",
      "I work with TypeScript and React",
      "Expertise: Docker"
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedKeywords).toContain("typescript");
    expect(result.sharedKeywords).toContain("react");
  });

  it("should handle expertise section without heading", () => {
    const buddy1 = createMockBuddy("1", "Philosophy", "TypeScript and React");
    const buddy2 = createMockBuddy("2", "Philosophy", "Python and Django");

    const result = compareBuddies(buddy1, buddy2);
    expect(result.analysis.expertiseOverlap).toBe(0);
  });

  it("should boost score when repos overlap", () => {
    const buddy1 = createMockBuddy(
      "1",
      "Philosophy",
      "# Expertise\nTypeScript",
      ["repo1"]
    );
    const buddy2 = createMockBuddy(
      "2",
      "Philosophy",
      "# Expertise\nPython",
      ["repo1"]
    );

    const result = compareBuddies(buddy1, buddy2);
    expect(result.sharedRepos).toContain("repo1");
  });
});
