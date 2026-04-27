interface DiffLine {
  lineNumber: number;
  content: string;
  type: "add" | "remove" | "context";
}

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface DiffViewerProps {
  diff: string;
  comments?: Array<{
    path: string;
    line?: number;
    startLine?: number;
    body: string;
    severity: string;
  }>;
}

function parseDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split("\n");
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @~/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[3], 10);
      const oldCount = parseInt(hunkMatch[2] || "1", 10);
      const newCount = parseInt(hunkMatch[4] || "1", 10);
      currentHunk = { oldStart: oldLine, oldCount, newStart: newLine, newCount, lines: [] };
      continue;
    }

    if (!currentHunk) continue;

    if (raw.startsWith("+")) {
      currentHunk.lines.push({ lineNumber: newLine++, content: raw.slice(1), type: "add" });
    } else if (raw.startsWith("-")) {
      currentHunk.lines.push({ lineNumber: oldLine++, content: raw.slice(1), type: "remove" });
    } else {
      currentHunk.lines.push({ lineNumber: newLine++, content: raw, type: "context" });
      oldLine++;
      newLine++;
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: "border-l-red-500 bg-red-50 dark:bg-red-950/30",
  warning: "border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/30",
  suggestion: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/30",
  info: "border-l-zinc-400 bg-zinc-50 dark:bg-zinc-900/30",
};

export function DiffViewer({ diff, comments = [] }: DiffViewerProps) {
  const hunks = parseDiff(diff);

  if (hunks.length === 0) {
    return <div className="p-4 text-sm text-zinc-500">No diff to display</div>;
  }

  const commentMap = new Map<number, typeof comments>();
  for (const comment of comments) {
    const line = comment.startLine ?? comment.line;
    if (line) {
      const existing = commentMap.get(line);
      if (existing) {
        existing.push(comment);
      } else {
        commentMap.set(line, [comment]);
      }
    }
  }

  return (
    <div data-testid="diff-viewer" className="font-mono text-sm">
      {hunks.map((hunk, hIdx) => (
        <div key={hIdx} className="border border-zinc-200 dark:border-zinc-700 rounded-md mb-2 overflow-hidden">
          <div className="px-4 py-1 bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
            {`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`}
          </div>
          {hunk.lines.map((line, lIdx) => {
            const lineComments = line.type !== "remove" ? commentMap.get(line.lineNumber) : undefined;
            const bg =
              line.type === "add"
                ? "bg-green-50 dark:bg-green-950/20"
                : line.type === "remove"
                  ? "bg-red-50 dark:bg-red-950/20"
                  : "";

            return (
              <div key={lIdx}>
                <div className={`flex ${bg}`}>
                  <span className="w-8 sm:w-12 text-right pr-2 sm:pr-3 text-xs text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700 shrink-0">
                    {line.type === "remove" ? line.lineNumber : line.type === "context" ? line.lineNumber : ""}
                  </span>
                  <span className="w-8 sm:w-12 text-right pr-2 sm:pr-3 text-xs text-zinc-400 select-none border-r border-zinc-200 dark:border-zinc-700 shrink-0">
                    {line.type === "add" ? line.lineNumber : line.type === "context" ? line.lineNumber : ""}
                  </span>
                  <span
                    className={`flex-1 min-w-0 px-2 sm:px-3 whitespace-pre-wrap break-all ${
                      line.type === "add"
                        ? "text-green-700 dark:text-green-400"
                        : line.type === "remove"
                          ? "text-red-700 dark:text-red-400"
                          : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {line.type !== "context" ? (line.type === "add" ? "+" : "-") : " "}
                    {line.content}
                  </span>
                </div>
                {lineComments?.map((c, cIdx) => (
                  <div key={cIdx} className={`border-l-2 ${SEVERITY_COLORS[c.severity] || SEVERITY_COLORS.info} px-4 py-2 ml-24 text-sm`}>
                    <span className="font-semibold text-xs uppercase tracking-wide text-zinc-500">{c.severity.toUpperCase()}</span>
                    <p className="text-zinc-700 dark:text-zinc-300 mt-0.5">{c.body}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
