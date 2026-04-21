import type { CustomRule } from "../config/types.js";
import type { ReviewCommentItem } from "./types.js";
import { Logger } from "../utils/logger.js";
import { getErrorMessage } from "../utils/index.js";

const logger = new Logger("custom-rules");

export function evaluateCustomRules(
  rules: CustomRule[],
  diff: string
): ReviewCommentItem[] {
  const comments: ReviewCommentItem[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    try {
      const pattern = new RegExp(rule.pattern, "gm");
      const matches = diff.matchAll(pattern);

      for (const match of matches) {
        const line = diff.substring(0, match.index).split("\n").length;

        comments.push({
          id: `custom-rule-${rule.id}-${line}`,
          path: "custom-rule", // Custom rules apply to the diff as a whole
          line,
          body: rule.name + (rule.description ? `\n\n${rule.description}` : ""),
          severity: rule.severity,
          category: "suggestion",
          suggestion: rule.description,
        });
      }
    } catch (err) {
      logger.warn("Skipping rule with invalid regex", { ruleId: rule.id, ruleName: rule.name, pattern: rule.pattern, error: getErrorMessage(err) });
    }
  }

  return comments;
}
