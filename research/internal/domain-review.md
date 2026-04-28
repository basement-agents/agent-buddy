# domain-review

Review is a domain object representing a code review on a PR.

## Review Entity

```
Review {
  id: string              # Unique identifier
  prNumber: number        # GitHub PR number
  repo: string            # owner/repo format
  buddyId: string         # Buddy ID that performed the review
  status: ReviewStatus    # pending | in_progress | completed | failed
  result: ReviewResult?   # Review result
  createdAt: Date
  completedAt: Date?
}

ReviewStatus = "pending" | "in_progress" | "completed" | "failed"

ReviewResult {
  comments: ReviewComment[]
  summary: string
  labels: string[]
}
```

## Review Types

### Low-Context Review (Diff-Based)
- Uses only the PR diff
- Line-by-line comments
- Rule-based automatic detection

### High-Context Review (Impact Analysis)
- Uses Buddy persona
- Impact analysis of code changes
- Related code references

## Review Pipeline

```
1. Webhook received (PR opened/updated)
2. Create job (queue)
3. Low-context review (synchronous)
4. High-context review (asynchronous, LLM calls)
5. Post results (GitHub comment or labels)
```

## Review Rules

Rule is a pattern to detect in diffs.

```
Rule {
  id: string
  name: string
  pattern: string        # regex or plain string
  severity: Severity     # error | warning | suggestion | info
  enabled: boolean
  category?: string
}
```

## Known Unknowns

- Fallback strategy on LLM call failure
- Performance optimization for large diffs
