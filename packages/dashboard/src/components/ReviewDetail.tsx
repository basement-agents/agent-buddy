import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { DiffViewer } from "@/components/review/DiffViewer";
import type { CodeReview } from "@/lib/api";
import { stateVariant } from "@/lib/constants";

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
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge variant={stateVariant[review.state] || "default"}>
            {review.state.replace("_", " ")}
          </Badge>
          <h4 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Summary</h4>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-zinc-100 p-4 dark:border-zinc-800">
          <ReactMarkdown>{review.summary}</ReactMarkdown>
        </div>
      </div>

      {allFiles.size > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Changes ({allFiles.size} {allFiles.size === 1 ? "file" : "files"})
          </h4>
          <div className="space-y-4">
            {Array.from(allFiles).map((filePath) => {
              const comments = commentsByFile[filePath] || [];
              const fileDiff = fileDiffs[filePath];

              return (
                <div key={filePath} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                    <h5 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{filePath}</h5>
                    <p className="text-xs text-zinc-500">{comments.length} {comments.length === 1 ? "comment" : "comments"}</p>
                  </div>

                  {fileDiff && (
                    <div className="border-b border-zinc-100 dark:border-zinc-800">
                      <DiffViewer diff={fileDiff} comments={comments} />
                    </div>
                  )}

                  {!fileDiff && comments.length > 0 && (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {comments.map((comment, index) => (
                        <div key={comment.id || index} className="p-4">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={severityVariant[comment.severity] || "default"}>
                              {comment.severity}
                            </Badge>
                            {comment.line && (
                              <span className="text-xs text-zinc-500">
                                Line {comment.startLine && comment.startLine !== comment.line ? `${comment.startLine}-${comment.line}` : comment.line}
                              </span>
                            )}
                            <Badge variant="info">{comment.category}</Badge>
                          </div>
                          <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">{comment.body}</p>
                          {comment.suggestion && (
                            <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
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

      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="font-medium">Model:</span>
          <span>{review.metadata.llmModel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Tokens:</span>
          <span>{review.metadata.tokenUsage.totalTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Type:</span>
          <span>{review.metadata.reviewType}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Duration:</span>
          <span>{(review.metadata.durationMs / 1000).toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Reviewed:</span>
          <span>{new Date(review.reviewedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
