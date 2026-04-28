import crypto from "node:crypto";
import type { CodeReview } from "@agent-buddy/core";

export function createJobBase() {
  return {
    id: crypto.randomUUID(),
    status: "queued" as const,
    createdAt: new Date(),
  };
}

export interface ReviewJob {
  id: string;
  repoId: string;
  prNumber: number;
  buddyId?: string;
  reviewType?: "low-context" | "high-context" | "auto";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: CodeReview;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  progressPercentage?: number;
  progressStage?: string;
  progressDetail?: string;
  retryCount?: number;
  maxRetries?: number;
  errorHistory?: ErrorEntry[];
}

export interface ErrorEntry {
  message: string;
  timestamp: Date;
  attempt: number;
}

export interface AnalysisJob {
  id: string;
  buddyId: string;
  repo: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: string;
  progressStage?: "queued" | "fetching_reviews" | "analyzing_patterns" | "generating_profile" | "completed" | "failed";
  progressPercentage?: number;
  progressDetail?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  retryCount?: number;
  maxRetries?: number;
  errorHistory?: ErrorEntry[];
}

export interface ReviewSchedule {
  repoId: string;
  enabled: boolean;
  intervalMinutes: number;
  lastRun?: string;
  timer?: NodeJS.Timeout;
  retryCount?: number;
  lastError?: string;
}

export const MAX_REVIEW_HISTORY = 1000;
export const reviewHistory: CodeReview[] = [];
export const reviewJobs = new Map<string, ReviewJob>();
export const analysisJobs = new Map<string, AnalysisJob>();
export const schedules = new Map<string, ReviewSchedule>();

export function addReview(review: CodeReview): void {
  reviewHistory.unshift(review);
  if (reviewHistory.length > MAX_REVIEW_HISTORY) {
    reviewHistory.length = MAX_REVIEW_HISTORY;
  }
}
