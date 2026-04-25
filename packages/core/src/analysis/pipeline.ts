import type { LLMProvider } from "../llm/types.js";
import type {
  AnalysisResult,
  ReviewComment as GHReviewComment,
  PRReview,
  PullRequest,
} from "../index.js";
import { buildAnalysisPrompt, buildSoulPrompt, buildUserPrompt } from "../llm/prompts.js";
import { getErrorMessage } from "../utils/index.js";
import { BuddyFileSystemStorage } from "../buddy/storage.js";
import type { BuddyProfile, MemoryEntry } from "../buddy/types.js";
import { getFeedbackSummary, getRecentFeedback } from "../learning/feedback.js";

export class AnalysisPipeline {
  private llm: LLMProvider;
  private storage: BuddyFileSystemStorage;

  constructor(llm: LLMProvider, storage?: BuddyFileSystemStorage) {
    this.llm = llm;
    this.storage = storage || new BuddyFileSystemStorage();
  }

  private async analyzeWithPrompt(prompt: string, errorPrefix: string): Promise<AnalysisResult> {
    try {
      const { content } = await this.llm.generateStructured<AnalysisResult>([
        { role: "user", content: prompt },
      ]);
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
    const { content } = await this.llm.generate([{ role: "user", content: prompt }], { maxTokens: 8192 });
    return content;
  }

  async analyzePRReview(
    pr: PullRequest,
    reviews: PRReview[],
    comments: GHReviewComment[]
  ): Promise<AnalysisResult> {
    return this.analyzeWithPrompt(
      buildAnalysisPrompt([{ pr, reviews, comments }]),
      `analyzePRReview failed for PR #${pr.number}`
    );
  }

  async analyzeReviewerHistory(
    reviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[] }[]
  ): Promise<AnalysisResult> {
    return this.analyzeWithPrompt(
      buildAnalysisPrompt(reviewData),
      `analyzeReviewerHistory failed for ${reviewData.length} review(s)`
    );
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
    comments: GHReviewComment[]
  ): Promise<MemoryEntry> {
    const allComments = [
      ...reviews.map((r) => r.body).filter(Boolean),
      ...comments.map((c) => c.body),
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
    reviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[] }[],
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

    for (const { pr, reviews, comments } of reviewData) {
      await this.createMemoryEntry(username, org, repo, pr, reviews, comments);
    }

    return profile;
  }

  async updateBuddy(
    buddyId: string,
    newReviewData: { pr: PullRequest; reviews: PRReview[]; comments: GHReviewComment[] }[],
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

    for (const { pr, reviews, comments } of dataToProcess) {
      await this.createMemoryEntry(buddyId, org, repo, pr, reviews, comments);
    }

    return updated;
  }
}
