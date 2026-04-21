import { describe, it, expect } from "vitest";
import {
  buildAnalysisPrompt,
  buildSoulPrompt,
  buildUserPrompt,
  buildCodeReviewPrompt,
  buildHighContextReviewPrompt,
} from "../llm/prompts.js";

describe("buildAnalysisPrompt", () => {
  it("includes PR numbers and titles in output", () => {
    const reviews = [
      {
        pr: {
          number: 123,
          title: "Fix authentication bug",
          body: "This fixes the login issue",
          files: [],
        },
        reviews: [],
        comments: [],
      },
    ];

    const result = buildAnalysisPrompt(reviews);

    expect(result).toContain("PR #123");
    expect(result).toContain("Fix authentication bug");
  });

  it("includes review states and bodies", () => {
    const reviews = [
      {
        pr: { number: 1, title: "Test PR", files: [] },
        reviews: [
          { state: "APPROVED", body: "Looks good!" },
          { state: "CHANGES_REQUESTED", body: "Fix the typo" },
          { state: "COMMENTED", body: "" },
        ],
        comments: [],
      },
    ];

    const result = buildAnalysisPrompt(reviews);

    expect(result).toContain("[APPROVED] Looks good!");
    expect(result).toContain("[CHANGES_REQUESTED] Fix the typo");
    expect(result).toContain("[COMMENTED] (no body)");
  });

  it("includes comment paths and bodies", () => {
    const reviews = [
      {
        pr: { number: 1, title: "Test PR", files: [] },
        reviews: [],
        comments: [
          { path: "src/auth.ts", line: 42, body: "Add error handling" },
          { path: "src/utils.ts", line: 10, body: "Consider using lodash" },
          { path: "README.md", body: "Update docs" },
        ],
      },
    ];

    const result = buildAnalysisPrompt(reviews);

    expect(result).toContain("[src/auth.ts:42] Add error handling");
    expect(result).toContain("[src/utils.ts:10] Consider using lodash");
    expect(result).toContain("[README.md:N/A] Update docs");
  });
});

describe("buildSoulPrompt", () => {
  it("includes username in output", () => {
    const analysis = '{"reviewStyle": {"thoroughness": "thorough"}}';
    const result = buildSoulPrompt(analysis, "janedoe");

    expect(result).toContain("janedoe");
    expect(result).toContain("# janedoe — Review Soul");
  });
});

describe("buildUserPrompt", () => {
  it("includes username in output", () => {
    const analysis = '{"reviewStyle": {"thoroughness": "standard"}}';
    const result = buildUserPrompt(analysis, "bobsmith");

    expect(result).toContain("bobsmith");
    expect(result).toContain("# bobsmith — Profile");
  });
});

describe("buildCodeReviewPrompt", () => {
  const mockPR = {
    number: 42,
    title: "Add new feature",
    body: "This adds a new feature",
    files: [
      { filename: "src/feature.ts", additions: 100, deletions: 5 },
      { filename: "src/utils.ts", additions: 10, deletions: 2 },
    ],
  };

  it("includes PR details and diff", () => {
    const diff = "@@ -1,1 +1,2 @@\n-old line\n+new line";
    const result = buildCodeReviewPrompt(mockPR, diff);

    expect(result).toContain("PR #42");
    expect(result).toContain("Add new feature");
    expect(result).toContain("This adds a new feature");
    expect(result).toContain("src/feature.ts (+100/-5)");
    expect(result).toContain("src/utils.ts (+10/-2)");
    expect(result).toContain(diff);
  });

  it("includes buddy context when profile provided", () => {
    const profile = {
      username: "reviewer-bot",
      soul: "## Review Philosophy\nBe kind and thorough",
      user: "## Expertise\nTypeScript expert",
    };
    const result = buildCodeReviewPrompt(mockPR, "diff here", profile);

    expect(result).toContain('reviewing this PR as "reviewer-bot"');
    expect(result).toContain("Be kind and thorough");
    expect(result).toContain("TypeScript expert");
  });

  it("omits buddy context when no profile", () => {
    const result = buildCodeReviewPrompt(mockPR, "diff here");

    expect(result).not.toContain("reviewing this PR as");
    expect(result).not.toContain("Review Philosophy");
  });
});

describe("buildHighContextReviewPrompt", () => {
  const mockPR = {
    number: 7,
    title: "Refactor API",
    body: "Breaking change to API",
    files: [],
  };

  it("includes repo file tree", () => {
    const repoFiles = ["src/index.ts", "src/api/", "src/utils.ts"];
    const result = buildHighContextReviewPrompt(mockPR, "diff", repoFiles);

    expect(result).toContain("Repository File Tree:");
    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/api/");
    expect(result).toContain("src/utils.ts");
  });

  it("includes impact analysis framework", () => {
    const result = buildHighContextReviewPrompt(mockPR, "diff", ["src/"]);

    expect(result).toContain("Impact Analysis Framework");
    expect(result).toContain("Module impact");
    expect(result).toContain("Approach optimality");
    expect(result).toContain("Side effects and regressions");
    expect(result).toContain("Edge cases");
    expect(result).toContain("API/interface stability");
  });

  it("includes buddy context when profile provided", () => {
    const profile = {
      username: "senior-dev",
      soul: "## Philosophy\nFocus on architecture",
      user: "## Skills\nSystem design",
    };
    const result = buildHighContextReviewPrompt(
      mockPR,
      "diff",
      ["src/"],
      profile
    );

    expect(result).toContain('Reviewing as "senior-dev"');
    expect(result).toContain("Focus on architecture");
  });

  it("omits buddy context when no profile", () => {
    const result = buildHighContextReviewPrompt(mockPR, "diff", ["src/"]);

    expect(result).not.toContain("Reviewing as");
  });
});
