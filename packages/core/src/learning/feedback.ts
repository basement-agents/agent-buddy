import { promises as fs } from "node:fs";
import path from "node:path";
import { Logger } from "../utils/logger.js";
import { BASE_DIR, getErrorMessage } from "../utils/index.js";

const logger = new Logger("feedback");

const FEEDBACK_DIR = path.join(BASE_DIR, "feedback");

let initPromise: Promise<string | undefined> | null = null;

async function ensureFeedbackDir(): Promise<void> {
  if (!initPromise) {
    initPromise = fs.mkdir(FEEDBACK_DIR, { recursive: true });
  }
  await initPromise;
}

export interface ReviewFeedback {
  buddyId: string;
  reviewId: string;
  commentId: string;
  wasHelpful: boolean;
  userResponse?: string;
  timestamp: string;
}

export interface FeedbackSummary {
  helpful: number;
  notHelpful: number;
  patterns: string[];
}

async function readFeedbackLines(buddyId: string): Promise<ReviewFeedback[]> {
  const feedbackFile = path.join(FEEDBACK_DIR, `${buddyId}.jsonl`);
  const content = await fs.readFile(feedbackFile, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const parsed: ReviewFeedback[] = [];
  for (let i = 0; i < lines.length; i++) {
    const feedback = parseFeedbackLine(lines[i], i + 1);
    if (feedback) parsed.push(feedback);
  }
  return parsed;
}

export async function recordFeedback(feedback: ReviewFeedback): Promise<void> {
  await ensureFeedbackDir();
  const feedbackFile = path.join(FEEDBACK_DIR, `${feedback.buddyId}.jsonl`);
  const line = JSON.stringify(feedback);
  await fs.appendFile(feedbackFile, line + "\n");
}

function isReviewFeedback(data: unknown): data is ReviewFeedback {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.buddyId === "string" &&
    typeof obj.reviewId === "string" &&
    typeof obj.commentId === "string" &&
    typeof obj.wasHelpful === "boolean" &&
    typeof obj.timestamp === "string"
  );
}

function parseFeedbackLine(line: string, lineNumber: number): ReviewFeedback | null {
  try {
    const data = JSON.parse(line);
    if (!isReviewFeedback(data)) {
      logger.warn(`Skipping invalid feedback line ${lineNumber}: structure mismatch`);
      return null;
    }
    return data;
  } catch (err) {
    logger.warn(`Skipping malformed feedback line ${lineNumber}`, { error: getErrorMessage(err) });
    return null;
  }
}

export async function getFeedbackSummary(buddyId: string): Promise<FeedbackSummary> {
  const empty: FeedbackSummary = { helpful: 0, notHelpful: 0, patterns: [] };

  try {
    const allFeedback = await readFeedbackLines(buddyId);

    let helpful = 0;
    let notHelpful = 0;
    const patterns: Map<string, number> = new Map();

    for (const feedback of allFeedback) {
      if (feedback.wasHelpful) {
        helpful++;
      } else {
        notHelpful++;
      }

      if (feedback.userResponse) {
        const words = feedback.userResponse.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 4) {
            patterns.set(word, (patterns.get(word) || 0) + 1);
          }
        }
      }
    }

    const topPatterns = [...patterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern]) => pattern);

    return { helpful, notHelpful, patterns: topPatterns };
  } catch (err) {
    logger.warn("Failed to get feedback summary", { buddyId, error: getErrorMessage(err) });
    return empty;
  }
}

export async function getRecentFeedback(
  buddyId: string,
  limit = 10
): Promise<ReviewFeedback[]> {
  try {
    const allFeedback = await readFeedbackLines(buddyId);
    return allFeedback
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  } catch (err) {
    logger.warn("Failed to get recent feedback", { buddyId, error: getErrorMessage(err) });
    return [];
  }
}
