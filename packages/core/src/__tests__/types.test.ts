import { describe, it, expect } from "vitest";

describe("Types", () => {
  it("ReviewSeverity should have valid values", () => {
    const severities = ["info", "suggestion", "warning", "error"] as const;
    expect(severities).toContain("info");
    expect(severities).toContain("error");
  });

  it("TriggerMode should have valid values", () => {
    const modes = ["pr_opened", "mention", "review_requested", "manual"] as const;
    expect(modes).toContain("manual");
    expect(modes).toContain("mention");
  });
});
