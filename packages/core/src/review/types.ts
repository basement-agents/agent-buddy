import type { ReviewSeverity } from "../buddy/types.js";

export interface CodeReview {
  summary: string;
  state: ReviewState;
  comments: ReviewCommentItem[];
  buddyId?: string;
  reviewedAt: Date;
  metadata: ReviewMetadata;
  diff?: string;
}

export type ReviewState = "approved" | "changes_requested" | "commented";

export interface ReviewCommentItem {
  id: string;
  path: string;
  line?: number;
  startLine?: number;
  body: string;
  severity: ReviewSeverity;
  category: ReviewCategory;
  suggestion?: string;
  inReplyTo?: string;
  threadId?: string;
}

export type ReviewCategory =
  | "bug"
  | "security"
  | "performance"
  | "readability"
  | "architecture"
  | "testing"
  | "documentation"
  | "style"
  | "type-safety"
  | "error-handling"
  | "suggestion";

export interface ReviewMetadata {
  prNumber: number;
  repo: string;
  owner: string;
  reviewType: "low-context" | "high-context" | "combined" | "chunked";
  llmModel: string;
  tokenUsage: TokenUsage;
  durationMs: number;
  chunkCount?: number;
  jobId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface HighContextAnalysis {
  impactAssessment: ImpactAssessment;
  alternativeApproaches: AlternativeApproach[];
  sideEffects: SideEffect[];
  dependencyChanges: DependencyChange[];
}

export interface ImpactAssessment {
  overallRisk: "low" | "medium" | "high" | "critical";
  affectedModules: string[];
  breakingChanges: boolean;
  migrationRequired: boolean;
}

export interface AlternativeApproach {
  description: string;
  pros: string[];
  cons: string[];
  complexity: "low" | "medium" | "high";
}

export interface SideEffect {
  description: string;
  likelihood: "low" | "medium" | "high";
  severity: ReviewSeverity;
  mitigation?: string;
}

export interface DependencyChange {
  package: string;
  type: "added" | "removed" | "updated";
  version?: string;
  risk: "low" | "medium" | "high";
}
