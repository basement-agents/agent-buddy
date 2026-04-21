import type { BuddyProfile, PullRequest, ReviewComment, PRReview } from "../index.js";

export function buildAnalysisPrompt(
  reviews: { pr: PullRequest; reviews: PRReview[]; comments: ReviewComment[] }[]
): string {
  const reviewData = reviews
    .map(({ pr, reviews: rs, comments: cs }) => {
      const reviewTexts = rs.map(
        (r) => `[${r.state}] ${r.body || "(no body)"}`
      );
      const commentTexts = cs.map(
        (c) => `  [${c.path}:${c.line || "N/A"}] ${c.body}`
      );
      return `## PR #${pr.number}: ${pr.title}
Reviews:
${reviewTexts.join("\n")}
Comments:
${commentTexts.join("\n")}`;
    })
    .join("\n\n");

  return `Analyze the following code review history and extract the reviewer's patterns, style, and preferences.

${reviewData}

Respond with a JSON object with these fields:
{
  "reviewStyle": {
    "thoroughness": "minimal|standard|thorough|exhaustive",
    "focus": ["security", "performance", "readability", "correctness", "testing", "architecture", "documentation", "error-handling", "naming", "type-safety"],
    "typicalSeverity": "info|suggestion|warning|error",
    "severityDistribution": {
      "info": 0,
      "suggestion": 0,
      "warning": 0,
      "error": 0
    },
    "approvalCriteria": ["...", ...],
    "commentStyle": "brief|moderate|detailed|verbose",
    "codeExampleUsage": "never|sometimes|often|always"
  },
  "thinkingPatterns": [
    { "description": "...", "examples": ["..."], "frequency": "rare|occasional|frequent|constant" }
  ],
  "topIssues": [
    { "category": "...", "description": "...", "frequency": 0, "examples": ["..."], "severity": "info|suggestion|warning|error" }
  ],
  "communicationTone": {
    "formality": "casual|friendly|professional|formal",
    "encouragement": "minimal|moderate|high",
    "directness": "indirect|balanced|direct",
    "typicalPhrases": ["...", ...]
  },
  "preferredLanguages": ["TypeScript", "Python", ...],
  "preferredFrameworks": ["React", "Express", ...],
  "reviewPatterns": [
    { "pattern": "...", "description": "...", "frequency": "rare|occasional|frequent|constant", "examples": ["..."] }
  ]
}`;
}

export function buildSoulPrompt(
  analysisJson: string,
  username: string
): string {
  return `Based on the following analysis of ${username}'s code review behavior, generate a SOUL.md profile.
This profile should capture their review philosophy, priorities, and communication style in markdown.

Analysis:
${analysisJson}

Generate a markdown document with these sections:
# ${username} — Review Soul

## Review Philosophy
(Their overall approach to code reviews)

## Priorities
(What they value most in code, ordered by importance)

## Communication Style
(How they communicate feedback)

## Pet Peeves
(Things that consistently trigger comments)

## Approval Criteria
(What must be true before they approve)

## Severity Distribution
(Based on analysis - include breakdown of info/suggestion/warning/error comments and what triggers each severity level)

## Review Patterns
(Common patterns in their reviews - what they consistently look for, catch phrases, recurring themes)

Write in a natural, descriptive style that could be used to guide an AI to review code like this person.`;
}

export function buildUserPrompt(
  analysisJson: string,
  username: string
): string {
  return `Based on the following analysis of ${username}'s code review history, generate a USER.md profile.

Analysis:
${analysisJson}

Generate a markdown document:
# ${username} — Profile

## Expertise Areas
(What domains/languages/frameworks they are most knowledgeable about)

## Seniority Level
(junior|mid|senior|staff|principal)

## Programming Languages
(List languages they frequently review, ordered by frequency)

## Frameworks & Libraries
(Frameworks and libraries they are familiar with based on review comments)

## Preferred Tools
(Tools and frameworks they commonly use or recommend)

## Technical Interests
(Areas of technical interest inferred from their review patterns)

## Review Stats
(Based on the analysis data)`;
}

export function buildCodeReviewPrompt(
  pr: PullRequest,
  diff: string,
  buddyProfile?: BuddyProfile
): string {
  const buddyContext = buddyProfile
    ? `\n\nYou are reviewing this PR as "${buddyProfile.username}". Follow their review style and preferences:\n\n${buddyProfile.soul}\n\n${buddyProfile.user}`
    : "";

  return `Review the following pull request diff and provide feedback.${buddyContext}

## PR #${pr.number}: ${pr.title}
${pr.body || "(no description)"}

## Files Changed:
${pr.files.map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n")}

## Diff:
${diff}

## Review Guidelines

Severity levels — use them consistently:
- **error**: Bugs, security vulnerabilities, data loss risks, incorrect logic that will break at runtime
- **warning**: Potential issues, missing error handling, race conditions, performance concerns that matter
- **suggestion**: Improvements to readability, maintainability, or idiomatic usage — not blocking
- **info**: Observations, context, or "nice to know" — purely informational

When writing comments:
- Be specific: reference exact code, explain why it's an issue, suggest a fix
- Prioritize actionable feedback over vague observations
- Focus on problems that matter; skip style nitpicks unless the codebase has clear conventions
- If suggesting code, provide a concise replacement snippet
- Only flag "error" for things that will actually break — don't inflate severity

Respond with a JSON object:
{
  "summary": "Overall assessment of the PR",
  "state": "approved|changes_requested|commented",
  "comments": [
    {
      "path": "file path",
      "line": 42,
      "body": "Your feedback here",
      "severity": "info|suggestion|warning|error",
      "category": "bug|security|performance|readability|architecture|testing|documentation|style|type-safety|error-handling|suggestion",
      "suggestion": "Optional code suggestion"
    }
  ]
}`;
}

export function buildHighContextReviewPrompt(
  pr: PullRequest,
  diff: string,
  repoFiles: string[],
  buddyProfile?: BuddyProfile
): string {
  const buddyContext = buddyProfile
    ? `\n\nReviewing as "${buddyProfile.username}":\n${buddyProfile.soul}`
    : "";

  return `Perform a high-context code review. Analyze the impact of changes beyond just the diff.${buddyContext}

## PR #${pr.number}: ${pr.title}
${pr.body || ""}

## Diff:
${diff}

## Repository File Tree:
${repoFiles.join("\n")}

## Impact Analysis Framework

Evaluate the changes across these dimensions:

1. **Module impact**: Which modules/packages are affected by this change? Trace import chains and dependencies.
2. **Approach optimality**: Is this the right way to solve the problem? Could a simpler, more maintainable approach work?
3. **Side effects and regressions**: What existing behavior could break? Are there consumers that rely on the old behavior?
4. **Edge cases**: What inputs, states, or concurrency scenarios aren't handled?
5. **API/interface stability**: Does this change public APIs, types, or contracts? Are consumers notified?

## Severity Guidelines
- **error**: Breaking changes, data corruption, security vulnerabilities
- **warning**: Likely regressions, missing error paths, performance degradation
- **suggestion**: Better approaches, cleaner abstractions, improved patterns
- **info**: Context, observations, non-blocking notes

Respond with JSON:
{
  "summary": "High-level impact assessment",
  "state": "approved|changes_requested|commented",
  "comments": [
    {
      "path": "...",
      "line": 0,
      "body": "...",
      "severity": "info|suggestion|warning|error",
      "category": "...",
      "suggestion": "..."
    }
  ],
  "impactAssessment": {
    "overallRisk": "low|medium|high|critical",
    "affectedModules": ["..."],
    "breakingChanges": false,
    "migrationRequired": false
  },
  "alternativeApproaches": [
    { "description": "...", "pros": ["..."], "cons": ["..."], "complexity": "low|medium|high" }
  ],
  "sideEffects": [
    { "description": "...", "likelihood": "low|medium|high", "severity": "info|suggestion|warning|error", "mitigation": "..." }
  ]
}`;
}
