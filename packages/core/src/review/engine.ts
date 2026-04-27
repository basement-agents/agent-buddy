import type { LLMProvider } from "../llm/types.js";
import type {
  BuddyProfile,
  PullRequest,
  CodeReview,
  ReviewCommentItem,
  ReviewState,
  TokenUsage,
  CustomRule,
  HighContextAnalysis,
  DependencyChange,
} from "../index.js";
import { buildCodeReviewPrompt, buildHighContextReviewPrompt } from "../llm/prompts.js";
import type { CreateReviewRequest } from "../github/types.js";
import { evaluateCustomRules } from "./rules.js";
import { Logger } from "../utils/index.js";
import { FileContextCache } from "../cache/file-cache.js";
import { getFeedbackSummary, getRecentFeedback } from "../learning/feedback.js";

interface RawReviewResponse {
  summary: string;
  state: ReviewState;
  comments: RawComment[];
  impactAssessment?: {
    overallRisk: "low" | "medium" | "high" | "critical";
    affectedModules: string[];
    breakingChanges: boolean;
    migrationRequired: boolean;
  };
  alternativeApproaches?: Array<{
    description: string;
    pros: string[];
    cons: string[];
    complexity: "low" | "medium" | "high";
  }>;
  sideEffects?: Array<{
    description: string;
    likelihood: "low" | "medium" | "high";
    severity: string;
    mitigation?: string;
  }>;
}

interface RawComment {
  path: string;
  line?: number;
  startLine?: number;
  body: string;
  severity: string;
  category: string;
  suggestion?: string;
}

export class ReviewEngine {
  private static readonly SEVERITY_ORDER: readonly string[] = ["error", "warning", "suggestion", "info"];
  private static readonly SEVERITY_EMOJI: Record<string, string> = {
    error: "[ERROR]",
    warning: "[WARN]",
    suggestion: "[SUGGEST]",
    info: "[INFO]",
  };

  private llm: LLMProvider;
  private customRules?: CustomRule[];
  private logger: Logger;
  private maxTokensPerReview: number;
  private fileCache?: FileContextCache;
  private feedbackContext?: { buddyId: string };

  constructor(
    llm: LLMProvider,
    customRules?: CustomRule[],
    maxTokensPerReview = 8000,
    fileCache?: FileContextCache,
    feedbackContext?: { buddyId: string }
  ) {
    this.llm = llm;
    this.customRules = customRules;
    this.logger = new Logger("review-engine");
    this.maxTokensPerReview = maxTokensPerReview;
    this.fileCache = fileCache;
    this.feedbackContext = feedbackContext;
  }

  private async appendFeedbackContext(prompt: string): Promise<string> {
    if (!this.feedbackContext) return prompt;
    const feedback = await this.buildFeedbackContext();
    return feedback ? `${prompt}\n\n${feedback}` : prompt;
  }

  async reviewDiff(
    pr: PullRequest,
    diff: string,
    buddyProfile?: BuddyProfile
  ): Promise<CodeReview> {
    const truncatedDiff = this.truncateToTokenBudget(diff);
    let prompt = buildCodeReviewPrompt(pr, truncatedDiff, buddyProfile);
    prompt = await this.appendFeedbackContext(prompt);

    const start = Date.now();

    const { content, usage, model } = await this.llm.generateStructured<RawReviewResponse>([
      { role: "user", content: prompt },
    ]);

    const durationMs = Date.now() - start;
    let comments = this.normalizeComments(content.comments);

    if (this.customRules) {
      const customComments = evaluateCustomRules(this.customRules, diff);
      comments = [...comments, ...customComments];
    }

    const state = this.determineReviewState(content.state, comments);

    return {
      summary: content.summary,
      state,
      comments,
      buddyId: buddyProfile?.id,
      reviewedAt: new Date(),
      metadata: {
        prNumber: pr.number,
        repo: pr.base.repo.name,
        owner: pr.base.repo.owner.login,
        reviewType: "low-context",
        llmModel: model,
        tokenUsage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
        durationMs,
      },
    };
  }

  private splitDiffIntoChunks(diff: string): string[] {
    const estimatedTokens = Math.ceil(diff.length / 4);
    const maxCharsPerChunk = Math.floor(this.maxTokensPerReview * 0.7 * 4);

    if (estimatedTokens <= this.maxTokensPerReview) {
      return [diff];
    }

    const fileDiffPattern = /^diff --git .+$/m;
    const splits = diff.split(fileDiffPattern).filter((s) => s.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = "";

    for (const split of splits) {
      const entry = `diff --git${split}`;
      if (currentChunk.length + entry.length > maxCharsPerChunk && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = entry;
      } else {
        currentChunk += entry;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async reviewChunkedDiff(
    pr: PullRequest,
    diff: string,
    buddyProfile?: BuddyProfile
  ): Promise<{ comments: ReviewCommentItem[]; summaryParts: string[]; tokenUsage: TokenUsage; durationMs: number; model: string } | null> {
    const chunks = this.splitDiffIntoChunks(diff);

    if (chunks.length <= 1) {
      return null;
    }

    const start = Date.now();
    const allComments: ReviewCommentItem[] = [];
    const summaryParts: string[] = [];
    const totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    let model = "";

    for (let i = 0; i < chunks.length; i++) {
      let chunkPrompt = buildCodeReviewPrompt(pr, chunks[i], buddyProfile);
      chunkPrompt += `\n\nNote: This is part ${i + 1} of ${chunks.length} chunks of a large PR. Focus only on the files in this chunk.`;
      chunkPrompt = await this.appendFeedbackContext(chunkPrompt);

      const { content, usage, model: m } = await this.llm.generateStructured<RawReviewResponse>([
        { role: "user", content: chunkPrompt },
      ]);

      model = m;
      allComments.push(...this.normalizeComments(content.comments));
      summaryParts.push(content.summary);
      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;
      totalUsage.totalTokens += usage.inputTokens + usage.outputTokens;
    }

    return {
      comments: allComments,
      summaryParts,
      tokenUsage: totalUsage,
      durationMs: Date.now() - start,
      model,
    };
  }

  async reviewWithContext(
    pr: PullRequest,
    diff: string,
    repoFiles: string[],
    buddyProfile?: BuddyProfile
  ): Promise<CodeReview> {
    const truncatedDiff = this.truncateToTokenBudget(diff);
    let prompt = buildHighContextReviewPrompt(pr, truncatedDiff, repoFiles, buddyProfile);
    prompt = await this.appendFeedbackContext(prompt);

    const start = Date.now();

    const { content, usage, model } = await this.llm.generateStructured<RawReviewResponse>([
      { role: "user", content: prompt },
    ]);

    const durationMs = Date.now() - start;
    const comments = this.normalizeComments(content.comments);
    const state = this.determineReviewState(content.state, comments);

    if (this.fileCache && repoFiles.length > 0) {
      const cacheKey = `fileTree:${pr.base.repo.owner.login}/${pr.base.repo.name}`;
      this.fileCache.set(cacheKey, repoFiles);
      this.logger.info("Cached file tree", { cacheKey, fileCount: repoFiles.length });
    }

    let enhancedSummary = content.summary;
    if (content.impactAssessment || content.alternativeApproaches || content.sideEffects) {
      const highContextAnalysis: HighContextAnalysis = {
        impactAssessment: content.impactAssessment ? {
          overallRisk: content.impactAssessment.overallRisk,
          affectedModules: content.impactAssessment.affectedModules,
          breakingChanges: content.impactAssessment.breakingChanges,
          migrationRequired: content.impactAssessment.migrationRequired,
        } : {
          overallRisk: "low",
          affectedModules: [],
          breakingChanges: false,
          migrationRequired: false,
        },
        alternativeApproaches: content.alternativeApproaches?.map(aa => ({
          description: aa.description,
          pros: aa.pros,
          cons: aa.cons,
          complexity: aa.complexity,
        })) || [],
        sideEffects: content.sideEffects?.map(se => ({
          description: se.description,
          likelihood: se.likelihood,
          severity: this.parseSeverity(se.severity),
          mitigation: se.mitigation,
        })) || [],
        dependencyChanges: this.parseDependencyChanges(diff),
      };

      enhancedSummary = this.formatHighContextSummary(content.summary, highContextAnalysis);
    }

    return {
      summary: enhancedSummary,
      state,
      comments,
      buddyId: buddyProfile?.id,
      reviewedAt: new Date(),
      metadata: {
        prNumber: pr.number,
        repo: pr.base.repo.name,
        owner: pr.base.repo.owner.login,
        reviewType: "high-context",
        llmModel: model,
        tokenUsage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens },
        durationMs,
      },
    };
  }

  async performReview(
    pr: PullRequest,
    diff: string,
    buddyProfile?: BuddyProfile,
    repoFiles?: string[]
  ): Promise<CodeReview> {
    const estimatedTokens = Math.ceil(diff.length / 4);
    if (estimatedTokens > this.maxTokensPerReview && !repoFiles) {
      const chunked = await this.tryChunkedReview(pr, diff, buddyProfile);
      if (chunked) return chunked;
    }

    const effectiveRepoFiles = this.resolveRepoFiles(pr, repoFiles);
    if (effectiveRepoFiles) {
      return this.performCombinedReview(pr, diff, effectiveRepoFiles, buddyProfile);
    }

    return this.reviewDiff(pr, diff, buddyProfile);
  }

  private async tryChunkedReview(pr: PullRequest, diff: string, buddyProfile?: BuddyProfile): Promise<CodeReview | null> {
    const chunkedResult = await this.reviewChunkedDiff(pr, diff, buddyProfile);
    if (!chunkedResult) return null;

    let comments = chunkedResult.comments;
    if (this.customRules) {
      const customComments = evaluateCustomRules(this.customRules, diff);
      comments = [...comments, ...customComments];
    }
    const state = this.determineReviewState("commented", comments);
    return {
      summary: chunkedResult.summaryParts.join("\n\n---\n\n"),
      state,
      comments,
      buddyId: buddyProfile?.id,
      reviewedAt: new Date(),
      metadata: {
        prNumber: pr.number,
        repo: pr.base.repo.name,
        owner: pr.base.repo.owner.login,
        reviewType: "chunked",
        llmModel: chunkedResult.model,
        tokenUsage: chunkedResult.tokenUsage,
        durationMs: chunkedResult.durationMs,
        chunkCount: chunkedResult.summaryParts.length,
      },
    };
  }

  private resolveRepoFiles(pr: PullRequest, repoFiles?: string[]): string[] | undefined {
    if (repoFiles) return repoFiles;
    if (!this.fileCache) return undefined;

    const cacheKey = `fileTree:${pr.base.repo.owner.login}/${pr.base.repo.name}`;
    const cachedFiles = this.fileCache.get<string[]>(cacheKey);
    if (cachedFiles) {
      this.logger.info("Using cached file tree", { cacheKey, fileCount: cachedFiles.length });
    }
    return cachedFiles;
  }

  private async performCombinedReview(
    pr: PullRequest,
    diff: string,
    repoFiles: string[],
    buddyProfile?: BuddyProfile
  ): Promise<CodeReview> {
    const [lowCtx, highCtx] = await Promise.all([
      this.reviewDiff(pr, diff, buddyProfile),
      this.reviewWithContext(pr, diff, repoFiles, buddyProfile),
    ]);

    const mergedComments = this.deduplicateComments([...lowCtx.comments, ...highCtx.comments]);
    const state = this.determineReviewState(
      highCtx.state === "changes_requested" ? "changes_requested" : lowCtx.state,
      mergedComments
    );

    const totalUsage: TokenUsage = {
      inputTokens: lowCtx.metadata.tokenUsage.inputTokens + highCtx.metadata.tokenUsage.inputTokens,
      outputTokens: lowCtx.metadata.tokenUsage.outputTokens + highCtx.metadata.tokenUsage.outputTokens,
      totalTokens: lowCtx.metadata.tokenUsage.totalTokens + highCtx.metadata.tokenUsage.totalTokens,
    };

    return {
      summary: `${lowCtx.summary}\n\n## High-Context Analysis\n${highCtx.summary}`,
      state,
      comments: mergedComments,
      buddyId: buddyProfile?.id,
      reviewedAt: new Date(),
      metadata: {
        ...lowCtx.metadata,
        reviewType: "combined",
        tokenUsage: totalUsage,
        durationMs: lowCtx.metadata.durationMs + highCtx.metadata.durationMs,
      },
    };
  }

  formatMarkdownSummary(review: CodeReview, highContextAnalysis?: {
    impactAssessment?: RawReviewResponse["impactAssessment"];
    alternativeApproaches?: RawReviewResponse["alternativeApproaches"];
    sideEffects?: RawReviewResponse["sideEffects"];
  }): string {
    const lines: string[] = [];
    lines.push("## Code Review Summary");
    lines.push("");
    lines.push(review.summary);
    lines.push("");
    lines.push(this.formatReviewState(review.state));
    lines.push("");
    lines.push(this.formatKeyFindings(review.comments));
    if (highContextAnalysis) {
      lines.push(this.formatExternalHighContextAnalysis(highContextAnalysis));
    }
    lines.push(this.formatMetadata(review));
    return lines.join("\n");
  }

  private formatReviewState(state: ReviewState): string {
    const stateEmoji: Record<string, string> = {
      approved: "✅",
      changes_requested: "🔄",
      commented: "💬",
    };
    return `**State:** ${stateEmoji[state]} ${state.replace(/_/g, " ").toUpperCase()}`;
  }

  private formatKeyFindings(comments: ReviewCommentItem[]): string {
    const lines: string[] = [];
    const commentsBySeverity = {
      error: comments.filter((c) => c.severity === "error"),
      warning: comments.filter((c) => c.severity === "warning"),
      suggestion: comments.filter((c) => c.severity === "suggestion"),
      info: comments.filter((c) => c.severity === "info"),
    };

    const hasComments = Object.values(commentsBySeverity).some((c) => c.length > 0);
    if (!hasComments) return "";

    lines.push("## Key Findings");
    lines.push("");

    const severityHeader: Record<string, string> = {
      error: "❌ Errors",
      warning: "⚠️ Warnings",
      suggestion: "💡 Suggestions",
      info: "ℹ️ Info",
    };

    for (const [severity, group] of Object.entries(commentsBySeverity)) {
      if (group.length === 0) continue;
      lines.push(`### ${severityHeader[severity]} (${group.length})`);
      lines.push("");
      for (const comment of group) {
        const location = comment.line ? `${comment.path}:${comment.line}` : comment.path;
        lines.push(`- **[${location}]** ${comment.body}`);
        if (comment.suggestion) {
          lines.push(`  - Suggestion: ${comment.suggestion}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatExternalHighContextAnalysis(highContextAnalysis: {
    impactAssessment?: RawReviewResponse["impactAssessment"];
    alternativeApproaches?: RawReviewResponse["alternativeApproaches"];
    sideEffects?: RawReviewResponse["sideEffects"];
  }): string {
    const lines: string[] = [];

    if (highContextAnalysis.impactAssessment) {
      const impact = highContextAnalysis.impactAssessment;
      lines.push("## Impact Assessment");
      lines.push("");
      lines.push(`- **Overall Risk:** ${impact.overallRisk.toUpperCase()}`);
      lines.push(`- **Affected Modules:** ${impact.affectedModules.join(", ") || "None identified"}`);
      lines.push(`- **Breaking Changes:** ${impact.breakingChanges ? "Yes" : "No"}`);
      lines.push(`- **Migration Required:** ${impact.migrationRequired ? "Yes" : "No"}`);
      lines.push("");
    }

    if (highContextAnalysis.alternativeApproaches && highContextAnalysis.alternativeApproaches.length > 0) {
      lines.push("## Alternative Approaches");
      lines.push("");
      for (const approach of highContextAnalysis.alternativeApproaches) {
        lines.push(`### ${approach.description} (Complexity: ${approach.complexity})`);
        lines.push("");
        lines.push("**Pros:**");
        for (const pro of approach.pros) lines.push(`- ${pro}`);
        lines.push("**Cons:**");
        for (const con of approach.cons) lines.push(`- ${con}`);
        lines.push("");
      }
    }

    if (highContextAnalysis.sideEffects && highContextAnalysis.sideEffects.length > 0) {
      lines.push("## Potential Side Effects");
      lines.push("");
      for (const effect of highContextAnalysis.sideEffects) {
        lines.push(`- **${effect.description}**`);
        lines.push(`  - Likelihood: ${effect.likelihood.toUpperCase()}`);
        lines.push(`  - Severity: ${effect.severity}`);
        if (effect.mitigation) lines.push(`  - Mitigation: ${effect.mitigation}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private formatMetadata(review: CodeReview): string {
    const lines: string[] = [];
    lines.push("---");
    lines.push("");
    lines.push(`*Reviewed by ${review.buddyId ? `buddy: ${review.buddyId}` : "AI"} on ${review.reviewedAt.toISOString()}*`);
    lines.push(`*Model: ${review.metadata.llmModel} | Tokens: ${review.metadata.tokenUsage.totalTokens} | Duration: ${(review.metadata.durationMs / 1000).toFixed(1)}s*`);
    return lines.join("\n");
  }

  private formatHighContextSummary(baseSummary: string, highContextAnalysis: HighContextAnalysis): string {
    const lines: string[] = [baseSummary];

    if (highContextAnalysis.impactAssessment) {
      const { impactAssessment } = highContextAnalysis;
      lines.push("");
      lines.push("## Impact Assessment");
      lines.push("");
      lines.push(`**Overall Risk:** ${impactAssessment.overallRisk.toUpperCase()}`);
      lines.push(`**Breaking Changes:** ${impactAssessment.breakingChanges ? "Yes" : "No"}`);
      lines.push(`**Migration Required:** ${impactAssessment.migrationRequired ? "Yes" : "No"}`);

      if (impactAssessment.affectedModules.length > 0) {
        lines.push("");
        lines.push("**Affected Modules:**");
        impactAssessment.affectedModules.forEach(module => {
          lines.push(`- ${module}`);
        });
      }
    }

    if (highContextAnalysis.alternativeApproaches.length > 0) {
      lines.push("");
      lines.push("## Alternative Approaches");
      lines.push("");
      highContextAnalysis.alternativeApproaches.forEach((approach, index) => {
        lines.push(`### Option ${index + 1}: ${approach.description}`);
        lines.push("");
        lines.push(`**Complexity:** ${approach.complexity.toUpperCase()}`);
        lines.push("");
        lines.push("**Pros:**");
        approach.pros.forEach(pro => lines.push(`- ${pro}`));
        lines.push("");
        lines.push("**Cons:**");
        approach.cons.forEach(con => lines.push(`- ${con}`));
        lines.push("");
      });
    }

    if (highContextAnalysis.sideEffects.length > 0) {
      lines.push("");
      lines.push("## Potential Side Effects");
      lines.push("");
      highContextAnalysis.sideEffects.forEach(effect => {
        lines.push(`- **${effect.description}** (Likelihood: ${effect.likelihood.toUpperCase()}, Severity: ${effect.severity})`);
        if (effect.mitigation) {
          lines.push(`  - Mitigation: ${effect.mitigation}`);
        }
      });
    }

    if (highContextAnalysis.dependencyChanges.length > 0) {
      lines.push("");
      lines.push("## Dependency Changes");
      lines.push("");
      for (const dep of highContextAnalysis.dependencyChanges) {
        const version = dep.version ? ` (${dep.version})` : "";
        lines.push(`- **${dep.package}**${version} — ${dep.type} [${dep.risk} risk]`);
      }
    }

    return lines.join("\n");
  }

  private parseDependencyChanges(diff: string): DependencyChange[] {
    const changes: DependencyChange[] = [];
    const depFiles = [
      "package.json",
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "Cargo.toml",
      "requirements.txt",
      "go.mod",
    ];

    const depFilePattern = new RegExp(`^diff --git a/.+ b/(.+)$`, "gm");
    let match: RegExpExecArray | null;

    while ((match = depFilePattern.exec(diff)) !== null) {
      const fileName = match[1];
      if (!depFiles.some((f) => fileName.endsWith(f))) continue;

      const startIdx = match.index;
      const nextDiff = diff.indexOf("\ndiff --git ", startIdx + 1);
      const blockEnd = nextDiff === -1 ? diff.length : nextDiff;
      const block = diff.substring(startIdx, blockEnd);

      const hunks = block.split(/^@@\s.*@@\s*$/m).slice(1);
      for (const hunk of hunks) {
        for (const line of hunk.split("\n")) {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            const content = line.substring(1).trim();
            const dep = this.parseDependencyLine(content, fileName);
            if (dep) changes.push(dep);
          } else if (line.startsWith("-") && !line.startsWith("---")) {
            const content = line.substring(1).trim();
            const dep = this.parseDependencyLine(content, fileName);
            if (dep) changes.push({ ...dep, type: "removed" });
          }
        }
      }
    }

    return changes;
  }

  private parseDependencyLine(content: string, fileName: string): DependencyChange | null {
    if (fileName.endsWith("package.json")) {
      const jsonMatch = content.match(/^"([^"]+)":\s*"([^"]+)"/);
      if (jsonMatch) {
        const name = jsonMatch[1];
        if (name === "name" || name === "version") return null;
        return { package: name, type: "added", version: jsonMatch[2], risk: "low" };
      }
    }

    if (fileName.endsWith("package-lock.json") || fileName.endsWith("pnpm-lock.yaml")) {
      const versionMatch = content.match(/"([^"]+)"[^"]*"([^"]+)"/);
      if (versionMatch) {
        return { package: versionMatch[1], type: "added", version: versionMatch[2], risk: "low" };
      }
    }

    if (fileName.endsWith("yarn.lock")) {
      const versionMatch = content.match(/^([^@\s][^ ]+)@([^:]+):/);
      if (versionMatch) {
        return { package: versionMatch[1], type: "added", version: versionMatch[2], risk: "low" };
      }
    }

    if (fileName.endsWith("Cargo.toml")) {
      const tomlMatch = content.match(/^(\w[\w-]*)\s*=\s*"([^"]+)"/);
      if (tomlMatch) {
        return { package: tomlMatch[1], type: "added", version: tomlMatch[2], risk: "low" };
      }
    }

    if (fileName.endsWith("requirements.txt")) {
      const reqMatch = content.match(/^([A-Za-z0-9_.-]+)(?:[=<>~!]+(.+))?/);
      if (reqMatch) {
        return { package: reqMatch[1], type: "added", version: reqMatch[2], risk: "low" };
      }
    }

    if (fileName.endsWith("go.mod")) {
      const goMatch = content.match(/^\s+(\S+)\s+(\S+)/);
      if (goMatch) {
        return { package: goMatch[1], type: "added", version: goMatch[2], risk: "low" };
      }
    }

    return null;
  }

  formatForGitHub(review: CodeReview): CreateReviewRequest {
    const event = review.state === "approved"
      ? "APPROVE"
      : review.state === "changes_requested"
        ? "REQUEST_CHANGES"
        : "COMMENT";

    const comments = review.comments
      .filter((c) => c.line)
      .map((c) => ({
        path: c.path,
        line: c.line,
        body: this.formatCommentBody(c),
        start_line: c.startLine,
      }));

    return {
      body: review.summary,
      event,
      comments,
    };
  }

  private truncateToTokenBudget(diff: string): string {
    const estimatedTokens = Math.ceil(diff.length / 4);

    if (estimatedTokens <= this.maxTokensPerReview) {
      return diff;
    }

    const maxChars = this.maxTokensPerReview * 4;
    const truncated = diff.slice(0, maxChars);

    this.logger.info("Diff truncated to token budget", {
      originalLength: diff.length,
      truncatedLength: truncated.length,
      estimatedTokensOriginal: estimatedTokens,
      estimatedTokensTruncated: Math.ceil(truncated.length / 4),
      maxTokensPerReview: this.maxTokensPerReview,
    });

    return truncated;
  }

  private normalizeComments(raw: RawComment[]): ReviewCommentItem[] {
    return raw.map((c, i) => ({
      id: `comment-${i}`,
      path: c.path,
      line: c.line,
      startLine: c.startLine,
      body: c.body,
      severity: this.parseSeverity(c.severity),
      category: this.parseCategory(c.category),
      suggestion: c.suggestion,
      threadId: `thread-${c.path}:${c.line || 0}`,
    }));
  }

  private parseEnum<T extends string>(value: string, valid: readonly T[], fallback: T): T {
    if (valid.includes(value as T)) return value as T;
    return fallback;
  }

  private parseSeverity(s: string): ReviewCommentItem["severity"] {
    return this.parseEnum(s, ["info", "suggestion", "warning", "error"] as const, "suggestion");
  }

  private parseCategory(c: string): ReviewCommentItem["category"] {
    return this.parseEnum(c, [
      "bug", "security", "performance", "readability", "architecture",
      "testing", "documentation", "style", "type-safety", "error-handling", "suggestion",
    ] as const, "suggestion");
  }

  private determineReviewState(
    llmState: ReviewState,
    comments: ReviewCommentItem[]
  ): ReviewState {
    const hasErrors = comments.some((c) => c.severity === "error");
    if (hasErrors && llmState !== "approved") return "changes_requested";
    if (llmState === "approved" && hasErrors) return "commented";
    return llmState;
  }

  deduplicateComments(comments: ReviewCommentItem[]): ReviewCommentItem[] {
    const seen: ReviewCommentItem[] = [];
    const severityOrder = ReviewEngine.SEVERITY_ORDER;

    for (const comment of comments) {
      const overlapIdx = seen.findIndex((existing) => {
        if (existing.path !== comment.path) return false;
        return this.rangesOverlap(existing, comment);
      });

      if (overlapIdx === -1) {
        seen.push(comment);
      } else {
        const existingSeverity = severityOrder.indexOf(seen[overlapIdx].severity);
        const newSeverity = severityOrder.indexOf(comment.severity);
        if (newSeverity < existingSeverity) {
          seen[overlapIdx] = comment;
        }
      }
    }

    return seen;
  }

  private rangesOverlap(a: ReviewCommentItem, b: ReviewCommentItem): boolean {
    const aStart = a.startLine ?? a.line ?? 0;
    const aEnd = a.line ?? a.startLine ?? 0;
    const bStart = b.startLine ?? b.line ?? 0;
    const bEnd = b.line ?? b.startLine ?? 0;
    return aStart <= bEnd && bStart <= aEnd;
  }

  private formatCommentBody(comment: ReviewCommentItem): string {
    let body = `${ReviewEngine.SEVERITY_EMOJI[comment.severity]} ${comment.body}`;
    if (comment.threadId) {
      body += `\n\n_Thread: ${comment.threadId}_`;
    }
    if (comment.suggestion) {
      body += `\n\n\`\`\`suggestion\n${comment.suggestion}\n\`\`\``;
    }
    return body;
  }

  private async buildFeedbackContext(): Promise<string | null> {
    if (!this.feedbackContext) {
      return null;
    }

    try {
      const [summary, recent] = await Promise.all([
        getFeedbackSummary(this.feedbackContext.buddyId),
        getRecentFeedback(this.feedbackContext.buddyId, 5),
      ]);

      if (summary.helpful === 0 && summary.notHelpful === 0 && recent.length === 0) {
        return null;
      }

      const lines: string[] = ["## Feedback Context"];

      if (summary.helpful > 0 || summary.notHelpful > 0) {
        lines.push(`\n**Review Performance:**`);
        lines.push(`- Helpful reviews: ${summary.helpful}`);
        lines.push(`- Not helpful reviews: ${summary.notHelpful}`);

        if (summary.patterns.length > 0) {
          lines.push(`\n**Common Patterns:**`);
          lines.push(`- ${summary.patterns.join(", ")}`);
        }
      }

      if (recent.length > 0) {
        lines.push(`\n**Recent Feedback:**`);

        const avoidItems: string[] = [];
        const continueItems: string[] = [];

        for (const feedback of recent) {
          if (!feedback.wasHelpful && feedback.userResponse) {
            avoidItems.push(`- ${feedback.userResponse}`);
          } else if (feedback.wasHelpful && feedback.userResponse) {
            continueItems.push(`- ${feedback.userResponse}`);
          }
        }

        if (avoidItems.length > 0) {
          lines.push(`\n**Avoid:**`);
          lines.push(...avoidItems);
        }

        if (continueItems.length > 0) {
          lines.push(`\n**Continue:**`);
          lines.push(...continueItems);
        }
      }

      return lines.join("\n");
    } catch (error) {
      this.logger.warn("Failed to load feedback context", { error });
      return null;
    }
  }
}
