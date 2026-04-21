import { describe, it, expect } from "vitest";
import { evaluateCustomRules } from "../review/rules.js";

describe("Custom Rules", () => {
  it("should match a rule against diff", () => {
    const rules = [
      {
        id: "r1",
        name: "No console.log",
        description: "Don't use console.log",
        pattern: "console\\.log\\(",
        severity: "warning" as const,
        enabled: true,
      },
    ];
    const diff = "+ console.log('hello');\n+ return true;";
    const comments = evaluateCustomRules(rules, diff);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain("No console.log");
  });

  it("should skip disabled rules", () => {
    const rules = [
      { id: "r1", name: "Test", description: "", pattern: "foo", severity: "info" as const, enabled: false },
    ];
    const comments = evaluateCustomRules(rules, "foo bar");
    expect(comments).toHaveLength(0);
  });

  it("should handle invalid regex gracefully", () => {
    const rules = [
      { id: "r1", name: "Bad", description: "", pattern: "[invalid", severity: "error" as const, enabled: true },
    ];
    const comments = evaluateCustomRules(rules, "anything");
    expect(comments).toHaveLength(0);
  });

  it("should handle multiple matches", () => {
    const rules = [
      { id: "r1", name: "No TODO", description: "", pattern: "TODO", severity: "suggestion" as const, enabled: true },
    ];
    const diff = "+ // TODO: fix this\n+ // TODO: also this";
    const comments = evaluateCustomRules(rules, diff);
    expect(comments.length).toBeGreaterThanOrEqual(2);
  });

  describe("no-console rule", () => {
    it("should detect console.log statements", () => {
      const rules = [
        {
          id: "no-console-log",
          name: "No console.log",
          description: "Remove console.log statements before committing",
          pattern: "console\\.log\\(",
          severity: "warning" as const,
          enabled: true,
        },
      ];
      const diff = "+ console.log('debugging');\n+ console.log('another one');";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toContain("No console.log");
      expect(comments[0].severity).toBe("warning");
    });

    it("should detect console.error and console.warn", () => {
      const rules = [
        {
          id: "no-console-error",
          name: "No console.error",
          description: "Use proper error handling instead",
          pattern: "console\\.(error|warn)\\(",
          severity: "error" as const,
          enabled: true,
        },
      ];
      const diff = "+ console.error('failed');\n+ console.warn('deprecated');";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(2);
      expect(comments.every((c) => c.severity === "error")).toBe(true);
    });
  });

  describe("max-lines rule", () => {
    it("should detect files exceeding max line limit", () => {
      const rules = [
        {
          id: "max-lines",
          name: "Max file length",
          description: "File exceeds 300 lines - consider splitting",
          pattern: "\\+.*\\n\\+.*\\n\\+.*\\n\\+.*\\n\\+.*",
          severity: "suggestion" as const,
          enabled: true,
        },
      ];
      // Create a diff with many lines
      const longDiff = Array.from({ length: 50 }, (_, i) => `+ line ${i}`).join("\n");
      const comments = evaluateCustomRules(rules, longDiff);
      expect(comments.length).toBeGreaterThan(0);
      expect(comments[0].category).toBe("suggestion");
    });

    it("should allow files within line limit", () => {
      const rules = [
        {
          id: "max-lines-strict",
          name: "Max lines strict",
          description: "Too many lines added in one PR",
          pattern: "^(\\+.*\\n){100,}",
          severity: "warning" as const,
          enabled: true,
        },
      ];
      const shortDiff = "+ line 1\n+ line 2\n+ line 3";
      const comments = evaluateCustomRules(rules, shortDiff);
      expect(comments).toHaveLength(0);
    });
  });

  describe("import-order rule", () => {
    it("should detect out-of-order imports", () => {
      const rules = [
        {
          id: "import-order",
          name: "Import order",
          description: "Imports should be grouped: external, internal, relative",
          pattern: "from ['\"]\\.\\/.*['\"];\\n.*import.*from ['\"]@",
          severity: "suggestion" as const,
          enabled: true,
        },
      ];
      const diff = "+ import local from './local';\n+ import external from '@external/package';";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(1);
      expect(comments[0].body).toContain("Import order");
    });

    it("should detect missing blank line between import groups", () => {
      const rules = [
        {
          id: "import-spacing",
          name: "Import grouping",
          description: "Add blank line between import groups",
          pattern: "from ['\"]\\w+['\"];\\n\\+ import",
          severity: "info" as const,
          enabled: true,
        },
      ];
      const diff = "+ import { foo } from 'external';\n+ import { bar } from './internal';";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(1);
      expect(comments[0].severity).toBe("info");
    });
  });

  describe("multiple rule types together", () => {
    it("should apply all enabled rules", () => {
      const rules = [
        {
          id: "console",
          name: "No console.log",
          description: "",
          pattern: "console\\.log",
          severity: "warning" as const,
          enabled: true,
        },
        {
          id: "todo",
          name: "No TODO",
          description: "",
          pattern: "TODO:",
          severity: "suggestion" as const,
          enabled: true,
        },
        {
          id: "any",
          name: "No any types",
          description: "",
          pattern: ": any",
          severity: "error" as const,
          enabled: true,
        },
      ];
      const diff = "+ console.log('test');\n+ // TODO: fix\n+ const x: any;";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(3);
      expect(comments.some((c) => c.severity === "warning")).toBe(true);
      expect(comments.some((c) => c.severity === "suggestion")).toBe(true);
      expect(comments.some((c) => c.severity === "error")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should handle empty diff", () => {
      const rules = [
        { id: "r1", name: "Test", description: "", pattern: "foo", severity: "info" as const, enabled: true },
      ];
      const comments = evaluateCustomRules(rules, "");
      expect(comments).toHaveLength(0);
    });

    it("should handle rules with complex regex patterns", () => {
      const rules = [
        {
          id: "complex",
          name: "Complex pattern",
          description: "",
          pattern: "\\b(var|let)\\s+\\w+\\s*=\\s*require\\(",
          severity: "warning" as const,
          enabled: true,
        },
      ];
      const diff = "+ var fs = require('fs');\n+ let path = require('path');";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(2);
    });

    it("should calculate correct line numbers", () => {
      const rules = [
        { id: "r1", name: "Test", description: "", pattern: "pattern", severity: "info" as const, enabled: true },
      ];
      const diff = "line 1\nline 2\n+ pattern here\nline 4";
      const comments = evaluateCustomRules(rules, diff);
      expect(comments).toHaveLength(1);
      expect(comments[0].line).toBe(3);
    });
  });
});
