import type { ReviewSeverity } from "../buddy/types.js";

export interface AnalysisResult {
  buddyId?: string;
  username: string;
  reviewStyle: ReviewStyle;
  thinkingPatterns: ThinkingPattern[];
  topIssues: IssuePattern[];
  communicationTone: CommunicationTone;
  stats: AnalysisStats;
  preferredLanguages: string[];
  preferredFrameworks: string[];
  reviewPatterns: ReviewPattern[];
  generatedAt: Date;
}

export interface ReviewStyle {
  thoroughness: "minimal" | "standard" | "thorough" | "exhaustive";
  focus: ReviewFocus[];
  typicalSeverity: ReviewSeverity;
  severityDistribution: SeverityDistribution;
  approvalCriteria: string[];
  commentStyle: "brief" | "moderate" | "detailed" | "verbose";
  codeExampleUsage: "never" | "sometimes" | "often" | "always";
}

export interface SeverityDistribution {
  info: number;
  suggestion: number;
  warning: number;
  error: number;
}

export type ReviewFocus =
  | "security"
  | "performance"
  | "readability"
  | "correctness"
  | "testing"
  | "architecture"
  | "documentation"
  | "error-handling"
  | "naming"
  | "type-safety";

export interface ThinkingPattern {
  description: string;
  examples: string[];
  frequency: "rare" | "occasional" | "frequent" | "constant";
}

export interface IssuePattern {
  category: string;
  description: string;
  frequency: number;
  examples: string[];
  severity: ReviewSeverity;
}

export interface CommunicationTone {
  formality: "casual" | "friendly" | "professional" | "formal";
  encouragement: "minimal" | "moderate" | "high";
  directness: "indirect" | "balanced" | "direct";
  typicalPhrases: string[];
}

export interface AnalysisStats {
  totalPRsAnalyzed: number;
  totalComments: number;
  averageCommentsPerPR: number;
  uniqueRepos: number;
  dateRange: { start: Date; end: Date };
}

export interface ReviewPattern {
  pattern: string;
  description: string;
  frequency: "rare" | "occasional" | "frequent" | "constant";
  examples: string[];
}
