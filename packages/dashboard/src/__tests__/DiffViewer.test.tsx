import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DiffViewer } from "@/components/review/DiffViewer";

const SAMPLE_DIFF = `@@ -1,4 +1,5 @@
 import { hello } from "./utils";

-function greet(name: string) {
-  return "Hello " + name;
+function greet(name: string, prefix?: string) {
+  const p = prefix ?? "Hello";
+  return p + " " + name;
 }
`;

describe("DiffViewer", () => {
  it("renders diff hunks with correct line numbers", () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);

    expect(screen.getByText(/-1,4 \+1,5/)).toBeInTheDocument();
  });

  it("renders added lines with + prefix", () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);

    expect(screen.getByText(/const p = prefix/)).toBeInTheDocument();
    expect(screen.getByText(/return p \+ " " \+ name/)).toBeInTheDocument();
  });

  it("renders removed lines with - prefix", () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);

    expect(screen.getByText(/return "Hello " \+ name/)).toBeInTheDocument();
  });

  it("renders context lines", () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);

    expect(screen.getByText(/import \{ hello \}/)).toBeInTheDocument();
  });

  it("renders inline comments at correct line positions", () => {
    const comments = [
      { path: "src/greet.ts", line: 3, body: "Consider using template literals", severity: "suggestion" },
      { path: "src/greet.ts", line: 5, body: "Missing error handling", severity: "warning" },
    ];

    render(<DiffViewer diff={SAMPLE_DIFF} comments={comments} />);

    expect(screen.getByText("Consider using template literals")).toBeInTheDocument();
    expect(screen.getByText("Missing error handling")).toBeInTheDocument();
    expect(screen.getByText("SUGGESTION")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();
  });

  it("shows empty message when diff is empty", () => {
    render(<DiffViewer diff="" />);

    expect(screen.getByText("No diff to display")).toBeInTheDocument();
  });

  it("renders without comments prop", () => {
    render(<DiffViewer diff={SAMPLE_DIFF} />);

    expect(screen.getByText(/import \{ hello \}/)).toBeInTheDocument();
  });

  it("renders multiple hunks", () => {
    const multiHunkDiff = `@@ -1,2 +1,3 @@
 line1
-line2
+line2a
+line2b
@@ -10,2 +12,2 @@
 old
+new
`;

    render(<DiffViewer diff={multiHunkDiff} />);

    expect(screen.getByText(/-1,2 \+1,3/)).toBeInTheDocument();
    expect(screen.getByText(/-10,2 \+12,2/)).toBeInTheDocument();
  });
});
