import type { LLMProvider } from "../llm/types.js";
import type {
  AnalysisResult,
  ReviewComment as GHReviewComment,
  IssueComment,
  PRReview,
  PullRequest,
} from "../index.js";
import { buildAnalysisPrompt, buildSoulPrompt, buildUserPrompt } from "../llm/prompts.js";
import { getErrorMessage } from "../utils/index.js";
import { BuddyFileSystemStorage } from "../buddy/storage.js";
import type { BuddyProfile, MemoryEntry } from "../buddy/types.js";
import { getFeedbackSummary, getRecentFeedback } from "../learning/feedback.js";

// SOUL/USER profiles can span many sections; 16384 prevents mid-section truncation.
// If your model's completion limit is lower, pass a custom maxTokens via LLMOptions.
const PROFILE_MAX_TOKENS = 16384;

export class AnalysisPipeline {
  private llm: LLMProvider;
  private storage: BuddyFileSystemStorage;

  constructor(llm: LLMProvider, storage?: BuddyFileSystemStorage) {
    this.llm = llm;
    this.storage = storage || new BuddyFileSystemStorage();
  }

  private async analyzeWithPrompt(prompt: string, errorPrefix: string): Promise<AnalysisResult> {
    try {
      const { content } = await this.llm.generateStructured<AnalysisResult>(
        [{ role: "user", content: prompt }],
        { maxTokens: 16384 },
      );
      return { ...content, generatedAt: new Date() };
    } catch (error) {
      throw new Error(`${errorPrefix}: ${getErrorMessage(error)}`, { cause: error });
    }
  }

  private async generateProfile(
    promptFn: (json: string, username: string) => string,
    analysisResult: AnalysisResult,
    username: string
  ): Promise<string> {
    const prompt = promptFn(JSON.stringify(analysisResult, null, 2), username);
    const { content } = await this.llm.generate([{ role: "user", content: prompt }], { maxTokens: PROFILE_MAX_TOKENS });
    if (!content || content.trim().length === 0) {
      throw new Error(`Profile generation returned empty content for ${username}`);
    }
    return content;
  }

  async analyzePRReview(
    pr: PullRequest,
    reviews: PRReview[],
    comments: GHReviewComment[],
    issueComments: IssueComment[] = []
  ): Promise<AnalysisResult> {
    return this.analyzeWithPrompt(
      buildAnalysisPrompt([{ pr, reviews, comments, issueComments }]),
      `analyzePRReview failed for PR #${pr.number}`
    );
  }

  async analyzeReviewerHistory(
    reviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[]; issueComments?: IssueComment[] }[]
  ): Promise<AnalysisResult> {
    const BATCH_SIZE = 3;

    if (reviewData.length <= BATCH_SIZE) {
      return this.analyzeWithPrompt(
        buildAnalysisPrompt(reviewData),
        `analyzeReviewerHistory failed for ${reviewData.length} review(s)`
      );
    }

    // Split into batches and analyze sequentially to avoid rate limits
    const batches: typeof reviewData[] = [];
    for (let i = 0; i < reviewData.length; i += BATCH_SIZE) {
      batches.push(reviewData.slice(i, i + BATCH_SIZE));
    }

    const batchResults: AnalysisResult[] = [];
    for (let i = 0; i < batches.length; i++) {
      const result = await this.analyzeWithPrompt(
        buildAnalysisPrompt(batches[i]),
        `analyzeReviewerHistory batch ${i + 1}/${batches.length}`
      );
      batchResults.push(result);
    }

    return mergeAnalysisResults(batchResults);
  }

  async buildSoulProfile(analysisResult: AnalysisResult, username: string, feedbackNotes?: string): Promise<string> {
    const promptFn = feedbackNotes
      ? (json: string, user: string) => buildSoulPrompt(json, user, feedbackNotes)
      : buildSoulPrompt;
    return this.generateProfile(promptFn, analysisResult, username);
  }

  async buildUserProfile(analysisResult: AnalysisResult, username: string): Promise<string> {
    return this.generateProfile(buildUserPrompt, analysisResult, username);
  }

  async createMemoryEntry(
    buddyId: string,
    org: string,
    repo: string,
    pr: PullRequest,
    reviews: PRReview[],
    comments: GHReviewComment[],
    issueComments: IssueComment[] = []
  ): Promise<MemoryEntry> {
    const allComments = [
      ...reviews.map((r) => r.body).filter(Boolean),
      ...comments.map((c) => c.body),
      ...issueComments.map((c) => c.body),
    ].join("\n---\n");

    const keyLearnings: string[] = [];
    const categories: string[] = [];

    if (reviews.some((r) => r.state === "changes_requested")) {
      keyLearnings.push("Requested changes on this PR");
      categories.push("approval-pattern");
    }
    if (comments.length > 5) {
      keyLearnings.push("Detailed review with many comments");
      categories.push("detailed-reviewer");
    }

    // Analyze comment patterns for categorization
    const commentTexts = [
      ...comments.map((c) => c.body.toLowerCase()),
      ...reviews.map((r) => r.body?.toLowerCase() ?? ""),
    ];
    const keywordCategories: Array<{ keywords: string[]; category: string }> = [
      { keywords: ["security", "vulnerability"], category: "security-focus" },
      { keywords: ["performance", "optimize"], category: "performance-focus" },
      { keywords: ["test", "testing"], category: "testing-focus" },
      { keywords: ["type", "typescript"], category: "type-safety-focus" },
      { keywords: ["readability", "naming"], category: "readability-focus" },
    ];
    for (const { keywords, category } of keywordCategories) {
      if (commentTexts.some((c) => keywords.some((kw) => c.includes(kw)))) {
        categories.push(category);
      }
    }

    const entry: MemoryEntry = {
      buddyId,
      org,
      repo,
      prNumber: pr.number,
      prTitle: pr.title,
      content: `# ${org}/${repo} PR #${pr.number}: ${pr.title}\n\n${allComments}\n\n## Categories\n${categories.length > 0 ? categories.map((c) => `- ${c}`).join("\n") : "- general"}`,
      keyLearnings,
      createdAt: new Date(),
    };

    await this.storage.addMemoryEntry(entry);
    return entry;
  }

  async createBuddy(
    username: string,
    reviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[]; issueComments?: IssueComment[] }[],
    org: string,
    repo: string
  ): Promise<BuddyProfile> {
    const analysis = await this.analyzeReviewerHistory(reviewData);

    const [soul, user] = await Promise.all([
      this.buildSoulProfile(analysis, username),
      this.buildUserProfile(analysis, username),
    ]);

    // Get the highest PR number from the review data
    const highestPrNumber = Math.max(...reviewData.map(({ pr }) => pr.number), 0);

    const profile: BuddyProfile = {
      id: username,
      username,
      soul,
      user,
      memory: `# Memory Index\n`,
      sourceRepos: [`${org}/${repo}`],
      lastAnalyzedPr: highestPrNumber > 0 ? highestPrNumber : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.writeProfile(username, profile);

    for (const { pr, reviews, comments, issueComments } of reviewData) {
      await this.createMemoryEntry(username, org, repo, pr, reviews, comments, issueComments);
    }

    return profile;
  }

  async updateBuddy(
    buddyId: string,
    newReviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[]; issueComments?: IssueComment[] }[],
    org: string,
    repo: string,
    options?: { sincePr?: number; force?: boolean }
  ): Promise<BuddyProfile> {
    const existing = await this.storage.readProfile(buddyId);
    if (!existing) throw new Error(`Buddy ${buddyId} not found`);

    // Filter review data based on options
    let dataToProcess = newReviewData;
    if (!options?.force && options?.sincePr !== undefined) {
      const sincePr = options.sincePr;
      dataToProcess = newReviewData.filter(({ pr }) => pr.number > sincePr);
    }

    // If no new PRs to process, return existing profile
    if (dataToProcess.length === 0) {
      return existing;
    }

    const newAnalysis = await this.analyzeReviewerHistory(dataToProcess);

    // Read feedback for this buddy
    const feedbackSummary = await getFeedbackSummary(buddyId);
    const recentFeedback = await getRecentFeedback(buddyId, 20);

    let feedbackNotes: string | undefined;
    if (recentFeedback.length > 0) {
      const negativePatterns = recentFeedback
        .filter((f) => !f.wasHelpful && f.userResponse)
        .map((f) => `Avoid: ${f.userResponse}`)
        .join("\n");

      const positivePatterns = recentFeedback
        .filter((f) => f.wasHelpful && f.userResponse)
        .map((f) => `Continue: ${f.userResponse}`)
        .join("\n");

      feedbackNotes = [
        negativePatterns ? `### Patterns to Avoid\n${negativePatterns}` : "",
        positivePatterns ? `### Patterns to Continue\n${positivePatterns}` : "",
        `### Feedback Summary\n- Helpful reviews: ${feedbackSummary.helpful}\n- Not helpful reviews: ${feedbackSummary.notHelpful}\n- Top patterns: ${feedbackSummary.patterns.join(", ") || "None"}`,
      ].filter(Boolean).join("\n\n");
    }

    const [newSoul, newUser] = await Promise.all([
      this.buildSoulProfile(newAnalysis, buddyId, feedbackNotes),
      this.buildUserProfile(newAnalysis, buddyId),
    ]);

    // Calculate the highest PR number from processed data
    const highestPrNumber = Math.max(...dataToProcess.map(({ pr }) => pr.number), 0);

    const updated: BuddyProfile = {
      ...existing,
      soul: newSoul,
      user: newUser,
      sourceRepos: [...new Set([...existing.sourceRepos, `${org}/${repo}`])],
      lastAnalyzedPr: highestPrNumber > 0 ? highestPrNumber : existing.lastAnalyzedPr,
      updatedAt: new Date(),
    };

    await this.storage.writeProfile(buddyId, updated);

    for (const { pr, reviews, comments, issueComments } of dataToProcess) {
      await this.createMemoryEntry(buddyId, org, repo, pr, reviews, comments, issueComments);
    }

    return updated;
  }
}

function modal<T>(values: T[]): T {
  const freq = new Map<T, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function mergeAnalysisResults(results: AnalysisResult[]): AnalysisResult {
  if (results.length === 1) return results[0];

  const dist = { info: 0, suggestion: 0, warning: 0, error: 0 };
  for (const r of results) {
    dist.info += r.reviewStyle.severityDistribution.info;
    dist.suggestion += r.reviewStyle.severityDistribution.suggestion;
    dist.warning += r.reviewStyle.severityDistribution.warning;
    dist.error += r.reviewStyle.severityDistribution.error;
  }

  const merged: AnalysisResult = {
    username: results[0].username,
    reviewStyle: {
      thoroughness: modal(results.map((r) => r.reviewStyle.thoroughness)),
      focus: [...new Set(results.flatMap((r) => r.reviewStyle.focus))],
      typicalSeverity: modal(results.map((r) => r.reviewStyle.typicalSeverity)),
      severityDistribution: dist,
      approvalCriteria: [...new Set(results.flatMap((r) => r.reviewStyle.approvalCriteria ?? []))],
      commentStyle: modal(results.map((r) => r.reviewStyle.commentStyle)),
      codeExampleUsage: modal(results.map((r) => r.reviewStyle.codeExampleUsage)),
    },
    thinkingPatterns: dedupeBy(results.flatMap((r) => r.thinkingPatterns ?? []), (p) => p.description),
    topIssues: mergeIssues(results.flatMap((r) => r.topIssues ?? [])),
    communicationTone: {
      formality: modal(results.map((r) => r.communicationTone.formality)),
      encouragement: modal(results.map((r) => r.communicationTone.encouragement)),
      directness: modal(results.map((r) => r.communicationTone.directness)),
      typicalPhrases: [...new Set(results.flatMap((r) => r.communicationTone.typicalPhrases ?? []))],
    },
    preferredLanguages: [...new Set(results.flatMap((r) => r.preferredLanguages ?? []))],
    preferredFrameworks: [...new Set(results.flatMap((r) => r.preferredFrameworks ?? []))],
    reviewPatterns: dedupeBy(results.flatMap((r) => r.reviewPatterns ?? []), (p) => p.pattern),
    stats: (() => {
      const toDate = (d: unknown): Date => d instanceof Date ? d : new Date(d as string);
      const totalPRs = results.reduce((sum, r) => sum + (r.stats?.totalPRsAnalyzed ?? 0), 0);
      const totalComments = results.reduce((sum, r) => sum + (r.stats?.totalComments ?? 0), 0);
      const starts = results.filter(r => r.stats?.dateRange?.start).map(r => toDate(r.stats.dateRange.start).getTime());
      const ends = results.filter(r => r.stats?.dateRange?.end).map(r => toDate(r.stats.dateRange.end).getTime());
      return {
        totalPRsAnalyzed: totalPRs,
        totalComments,
        averageCommentsPerPR: totalPRs > 0 ? totalComments / totalPRs : 0,
        uniqueRepos: results.reduce((sum, r) => sum + (r.stats?.uniqueRepos ?? 0), 0),
        dateRange: {
          start: starts.length > 0 ? new Date(Math.min(...starts)) : new Date(),
          end: ends.length > 0 ? new Date(Math.max(...ends)) : new Date(),
        },
      };
    })(),
    generatedAt: new Date(),
  };

  return merged;
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function mergeIssues(issues: import("./types.js").IssuePattern[]): import("./types.js").IssuePattern[] {
  const map = new Map<string, import("./types.js").IssuePattern>();
  for (const issue of issues) {
    const existing = map.get(issue.category);
    if (existing) {
      existing.frequency += issue.frequency;
      existing.examples = [...new Set([...existing.examples, ...issue.examples])];
    } else {
      map.set(issue.category, { ...issue });
    }
  }
  return [...map.values()].sort((a, b) => b.frequency - a.frequency);
}
