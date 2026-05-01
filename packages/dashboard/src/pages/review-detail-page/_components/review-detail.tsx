import ReactMarkdown from "react-markdown";
import { Badge } from "~/components/system/badge";
import { DiffViewer } from "~/components/review/diff-viewer";
import type { CodeReview } from "~/lib/api";
import { stateVariant } from "~/lib/constants";

interface ReviewDetailProps {
  review: CodeReview;
}

const severityVariant: Record<string, "success" | "warning" | "error" | "default" | "info"> = {
  error: "error",
  warning: "warning",
  info: "info",
  suggestion: "default",
};

function extractFileDiffs(diff: string): Record<string, string> {
  const fileDiffs: Record<string, string> = {};
  const lines = diff.split("\n");
  let currentFile = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      if (currentFile && currentLines.length > 0) {
        fileDiffs[currentFile] = currentLines.join("\n");
      }
      currentFile = fileMatch[2];
      currentLines = [line];
    } else if (currentFile) {
      currentLines.push(line);
    }
  }

  if (currentFile && currentLines.length > 0) {
    fileDiffs[currentFile] = currentLines.join("\n");
  }

  return fileDiffs;
}

export function ReviewDetail({ review }: ReviewDetailProps) {
  const commentsByFile = review.comments.reduce((acc, comment) => {
    const path = comment.path || "Unknown";
    if (!acc[path]) acc[path] = [];
    acc[path].push(comment);
    return acc;
  }, {} as Record<string, typeof review.comments>);

  const fileDiffs = review.diff ? extractFileDiffs(review.diff) : {};
  const filesWithDiff = new Set(Object.keys(fileDiffs));
  const allFiles = new Set([...Object.keys(commentsByFile), ...filesWithDiff]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-10)" }}>
      {/* Summary */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Badge variant={stateVariant[review.state] || "default"}>
            {review.state.replace("_", " ")}
          </Badge>
          <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", margin: 0 }}>Summary</h4>
        </div>
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          style={{ borderTop: "1px solid var(--ds-color-border-secondary)", borderBottom: "1px solid var(--ds-color-border-secondary)", padding: "var(--ds-spacing-8) 0" }}
        >
          <ReactMarkdown>{review.summary}</ReactMarkdown>
        </div>
      </div>

      {/* File changes */}
      {allFiles.size > 0 && (
        <div>
          <h4 style={{ fontSize: "var(--ds-text-sm)", fontWeight: 600, color: "var(--ds-color-text-secondary)", marginBottom: "var(--ds-spacing-7)" }}>
            Changes ({allFiles.size} {allFiles.size === 1 ? "file" : "files"})
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-spacing-9)" }}>
            {Array.from(allFiles).map((filePath) => {
              const comments = commentsByFile[filePath] || [];
              const fileDiff = fileDiffs[filePath];

              return (
                <div key={filePath}>
                  {/* File header — top hairline only */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: "1px solid var(--ds-color-border-secondary)",
                    borderBottom: "1px solid var(--ds-color-border-secondary)",
                    background: "var(--ds-color-surface-app)",
                    padding: "var(--ds-spacing-7) 0",
                  }}>
                    <h5 style={{
                      fontSize: "var(--ds-text-sm)",
                      fontWeight: 500,
                      fontFamily: "monospace",
                      color: "var(--ds-color-text-primary)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>{filePath}</h5>
                    {comments.length > 0 && (
                      <Badge variant="info" size="small">{comments.length} {comments.length === 1 ? "comment" : "comments"}</Badge>
                    )}
                  </div>

                  {/* Diff viewer — no card chrome, only hairlines */}
                  {fileDiff && (
                    <div style={{ borderBottom: "1px solid var(--ds-color-border-secondary)" }}>
                      <DiffViewer diff={fileDiff} comments={comments} />
                    </div>
                  )}

                  {/* Comments as nested thread items */}
                  {!fileDiff && comments.length > 0 && (
                    <div>
                      {comments.map((comment, index) => (
                        <div
                          key={comment.id || index}
                          style={{
                            borderLeft: "2px solid var(--ds-color-border-secondary)",
                            paddingLeft: "var(--ds-spacing-9)",
                            paddingTop: "var(--ds-spacing-8)",
                            paddingBottom: "var(--ds-spacing-8)",
                            borderBottom: index < comments.length - 1 ? "1px solid var(--ds-color-border-secondary)" : undefined,
                          }}
                        >
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <Badge variant={severityVariant[comment.severity] || "default"}>
                              {comment.severity}
                            </Badge>
                            {comment.line && (
                              <span style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-secondary)" }}>
                                Line {comment.startLine && comment.startLine !== comment.line ? `${comment.startLine}-${comment.line}` : comment.line}
                              </span>
                            )}
                            <Badge variant="info">{comment.category}</Badge>
                          </div>
                          <p style={{ fontSize: "var(--ds-text-sm)", color: "var(--ds-color-text-secondary)", margin: 0 }}>{comment.body}</p>
                          {comment.suggestion && (
                            <pre style={{ marginTop: 8, overflowX: "auto", borderTop: "1px solid var(--ds-color-border-secondary)", borderBottom: "1px solid var(--ds-color-border-secondary)", padding: "var(--ds-spacing-7) 0", fontSize: "var(--ds-text-xs)", fontFamily: "monospace" }}>
                              <code>{comment.suggestion}</code>
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata — hairline-divided row */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        gap: "var(--ds-spacing-8)",
        borderTop: "1px solid var(--ds-color-border-secondary)",
        paddingTop: "var(--ds-spacing-8)",
      }}>
        <div>
          <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)", marginBottom: 2 }}>Model</p>
          <p style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)", margin: 0 }}>{review.metadata.llmModel}</p>
        </div>
        <div>
          <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)", marginBottom: 2 }}>Tokens</p>
          <p style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)", margin: 0 }}>{review.metadata.tokenUsage?.totalTokens?.toLocaleString() ?? "N/A"}</p>
        </div>
        <div>
          <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)", marginBottom: 2 }}>Type</p>
          <p style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)", margin: 0 }}>{review.metadata.reviewType}</p>
        </div>
        <div>
          <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)", marginBottom: 2 }}>Duration</p>
          <p style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)", margin: 0 }}>{review.metadata.durationMs != null ? (review.metadata.durationMs / 1000).toFixed(1) + "s" : "N/A"}</p>
        </div>
        <div>
          <p style={{ fontSize: "var(--ds-text-xs)", color: "var(--ds-color-text-tertiary)", marginBottom: 2 }}>Reviewed</p>
          <p style={{ fontSize: "var(--ds-text-sm)", fontWeight: 500, color: "var(--ds-color-text-primary)", margin: 0 }}>{new Date(review.reviewedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
