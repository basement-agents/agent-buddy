import type { BuddyId, ReviewSeverity } from "../buddy/types.js";

export interface AgentBuddyConfig {
  version: string;
  githubToken?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubAppInstallationId?: string;
  repos: RepoConfig[];
  defaultBuddyId?: BuddyId;
  server?: ServerConfig;
  review?: ReviewConfig;
}

export interface RepoConfig {
  id: string;
  owner: string;
  repo: string;
  buddyId?: BuddyId;
  buddies?: BuddyId[];
  autoReview: boolean;
  triggerMode: TriggerMode;
  customRules?: CustomRule[];
  schedule?: ReviewSchedule;
}

export type TriggerMode = "pr_opened" | "mention" | "review_requested" | "manual";

export interface ServerConfig {
  port: number;
  host: string;
  webhookSecret: string;
  apiKey: string;
}

export interface ReviewConfig {
  defaultSeverity: ReviewSeverity;
  maxComments: number;
  autoApproveBelow: boolean;
  reviewDelaySeconds: number;
  maxTokensPerReview?: number;
  quietHours?: { start: string; end: string; timezone: string };
}

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  severity: ReviewSeverity;
  enabled: boolean;
}

export interface TriggerConfig {
  event: "pull_request" | "issue_comment" | "pull_request_review";
  actions: string[];
  repoFilter?: string[];
}

export interface ReviewSchedule {
  enabled: boolean;
  intervalMinutes: number;
  lastRun?: string;
}
