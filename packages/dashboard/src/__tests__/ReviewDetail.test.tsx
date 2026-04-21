// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewDetail } from "../components/ReviewDetail";
import type { CodeReview } from "../lib/api";

// Mock DiffViewer to verify props
const mockDiffViewer = vi.fn();
vi.mock("@/components/review/DiffViewer", () => ({
  DiffViewer: (props: any) => {
    mockDiffViewer(props);
    return <div data-testid="diff-viewer">{props.diff?.slice(0, 20)}...</div>;
  },
}));

import { DiffViewer } from "@/components/review/DiffViewer";

describe("ReviewDetail", () => {
  beforeEach(() => {
    mockDiffViewer.mockClear();
  });

  const mockReview: CodeReview = {
    summary: "This PR looks good overall. The implementation is clean and follows best practices.",
    state: "approved",
    comments: [
      {
        id: "comment-1",
        path: "src/components/Header.tsx",
        line: 10,
        startLine: 10,
        body: "Consider adding error handling for the API call.",
        severity: "warning",
        category: "error-handling",
        suggestion: "try { await api.call(); } catch (error) { handleError(error); }",
      },
      {
        id: "comment-2",
        path: "src/utils/helpers.ts",
        line: 25,
        body: "This function could be simplified using array methods.",
        severity: "suggestion",
        category: "code-quality",
      },
    ],
    buddyId: "buddy-1",
    reviewedAt: "2024-01-15T10:30:00Z",
    metadata: {
      prNumber: 123,
      repo: "agent-buddy",
      owner: "basement-agents",
      reviewType: "full",
      llmModel: "claude-3-opus",
      tokenUsage: {
        inputTokens: 1500,
        outputTokens: 500,
        totalTokens: 2000,
      },
      durationMs: 5000,
    },
  };

  it("renders review summary data", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText(mockReview.summary)).toBeInTheDocument();
  });

  it("displays review state badge", () => {
    render(<ReviewDetail review={mockReview} />);

    const badge = screen.getByText("approved");
    expect(badge).toBeInTheDocument();
  });

  it("displays file-level comments", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText("Changes (2 files)")).toBeInTheDocument();
    expect(screen.getByText("src/components/Header.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/utils/helpers.ts")).toBeInTheDocument();
  });

  it("displays comment details including severity and category", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("error-handling")).toBeInTheDocument();
    expect(screen.getByText("Line 10")).toBeInTheDocument();
    expect(screen.getByText("Consider adding error handling for the API call.")).toBeInTheDocument();
  });

  it("displays code suggestion when present", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText(/try \{ await api\.call/)).toBeInTheDocument();
  });

  it("shows review metadata", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText(/claude-3-opus/)).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
    expect(screen.getByText("Type:")).toBeInTheDocument();
    expect(screen.getByText("full")).toBeInTheDocument();
    expect(screen.getByText(/5\.0s/)).toBeInTheDocument();
  });

  it("handles empty comments array", () => {
    const reviewWithNoComments: CodeReview = {
      ...mockReview,
      comments: [],
    };

    render(<ReviewDetail review={reviewWithNoComments} />);

    expect(screen.queryByText("Comments")).not.toBeInTheDocument();
    expect(screen.getByText("Summary")).toBeInTheDocument();
  });

  it("handles missing comment path", () => {
    const reviewWithMissingPath: CodeReview = {
      ...mockReview,
      comments: [
        {
          id: "comment-no-path",
          path: "",
          body: "This comment has no path",
          severity: "info",
          category: "general",
        },
      ],
    };

    render(<ReviewDetail review={reviewWithMissingPath} />);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("This comment has no path")).toBeInTheDocument();
  });

  it("handles missing optional comment fields", () => {
    const reviewWithMinimalComments: CodeReview = {
      ...mockReview,
      comments: [
        {
          id: "comment-minimal",
          path: "src/test.ts",
          body: "Minimal comment",
          severity: "info",
          category: "test",
        },
      ],
    };

    render(<ReviewDetail review={reviewWithMinimalComments} />);

    expect(screen.getByText("Minimal comment")).toBeInTheDocument();
    expect(screen.queryByText("Line")).not.toBeInTheDocument();
  });

  it("handles different review states", () => {
    const states: Array<CodeReview["state"]> = ["approved", "commented", "changes_requested"];

    states.forEach((state) => {
      const { unmount } = render(<ReviewDetail review={{ ...mockReview, state }} />);
      expect(screen.getByText(state.replace("_", " "))).toBeInTheDocument();
      unmount();
    });
  });

  it("handles line range display", () => {
    const reviewWithLineRange: CodeReview = {
      ...mockReview,
      comments: [
        {
          id: "comment-range",
          path: "src/test.ts",
          line: 50,
          startLine: 45,
          body: "Issue with this range",
          severity: "error",
          category: "bug",
        },
      ],
    };

    render(<ReviewDetail review={reviewWithLineRange} />);

    expect(screen.getByText("Line 45-50")).toBeInTheDocument();
  });

  it("formats reviewed date correctly", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.getByText(/Reviewed:/)).toBeInTheDocument();
    const dateStr = new Date(mockReview.reviewedAt).toLocaleString();
    expect(screen.getByText(dateStr)).toBeInTheDocument();
  });

  it("groups comments by file path", () => {
    const reviewWithMultipleCommentsPerFile: CodeReview = {
      ...mockReview,
      comments: [
        {
          id: "comment-1",
          path: "src/test.ts",
          line: 10,
          body: "First comment in test.ts",
          severity: "info",
          category: "general",
        },
        {
          id: "comment-2",
          path: "src/test.ts",
          line: 20,
          body: "Second comment in test.ts",
          severity: "warning",
          category: "style",
        },
        {
          id: "comment-3",
          path: "src/other.ts",
          line: 5,
          body: "Comment in other.ts",
          severity: "error",
          category: "bug",
        },
      ],
    };

    render(<ReviewDetail review={reviewWithMultipleCommentsPerFile} />);

    // Should have two file groups
    const testTsHeaders = screen.getAllByText("src/test.ts");
    expect(testTsHeaders).toHaveLength(1);

    expect(screen.getByText("src/other.ts")).toBeInTheDocument();

    // Should show comment count per file
    expect(screen.getByText("2 comments")).toBeInTheDocument();
    expect(screen.getByText("1 comment")).toBeInTheDocument();
  });

  it("displays all severity types", () => {
    const severities = ["error", "warning", "info", "suggestion"];

    severities.forEach((severity) => {
      const reviewWithSeverity: CodeReview = {
        ...mockReview,
        comments: [
          {
            id: `comment-${severity}`,
            path: "src/test.ts",
            body: `${severity} comment`,
            severity,
            category: "test",
          },
        ],
      };

      const { unmount } = render(<ReviewDetail review={reviewWithSeverity} />);
      expect(screen.getByText(severity)).toBeInTheDocument();
      unmount();
    });
  });

  it("renders DiffViewer when review has diff data", () => {
    const reviewWithDiff: CodeReview = {
      ...mockReview,
      diff: `diff --git a/src/test.ts b/src/test.ts\n@@ -1,3 +1,4 @@\n import x\n-export function old() {}\n+export function new() {}\n+const added = true;\n`,
    };

    render(<ReviewDetail review={reviewWithDiff} />);

    expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
  });

  it("passes correct diff and comments to DiffViewer per file", () => {
    const fileDiff = `@@ -1,3 +1,4 @@\n import x\n-export function old() {}\n+export function new() {}\n+const added = true;\n`;
    const reviewWithDiff: CodeReview = {
      ...mockReview,
      diff: `diff --git a/src/test.ts b/src/test.ts\n${fileDiff}`,
      comments: [
        {
          id: "c1",
          path: "src/test.ts",
          line: 3,
          body: "New function looks good",
          severity: "suggestion",
          category: "code-quality",
        },
        {
          id: "c2",
          path: "src/other.ts",
          line: 10,
          body: "Unrelated comment",
          severity: "info",
          category: "general",
        },
      ],
    };

    render(<ReviewDetail review={reviewWithDiff} />);

    expect(mockDiffViewer).toHaveBeenCalledTimes(1);
    const call = mockDiffViewer.mock.calls[0][0];
    expect(call.diff).toContain("@@ -1,3 +1,4 @@");
    expect(call.comments).toHaveLength(1);
    expect(call.comments[0].path).toBe("src/test.ts");
    expect(call.comments[0].body).toBe("New function looks good");
  });

  it("gracefully handles reviews without diff data", () => {
    render(<ReviewDetail review={mockReview} />);

    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();
    expect(screen.getByText("Consider adding error handling for the API call.")).toBeInTheDocument();
  });

  it("renders multiple DiffViewers for multi-file diffs", () => {
    const reviewWithMultiDiff: CodeReview = {
      ...mockReview,
      comments: [],
      diff: `diff --git a/file1.ts b/file1.ts\n@@ -1,2 +1,2 @@\n-old\n+new\n\ndiff --git a/file2.ts b/file2.ts\n@@ -1,2 +1,2 @@\n-foo\n+bar\n`,
    };

    render(<ReviewDetail review={reviewWithMultiDiff} />);

    const diffViewers = screen.getAllByTestId("diff-viewer");
    expect(diffViewers).toHaveLength(2);
  });
});
