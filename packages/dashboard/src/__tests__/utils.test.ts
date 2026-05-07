import { describe, it, expect } from "vitest";
import { cn } from "../lib/utils";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
    expect(cn("text-sm", "font-bold", "text-red-500")).toBe("text-sm font-bold text-red-500");
  });

  it("handles conditional classes", () => {
    const flags: Record<"active" | "hidden" | "zero", boolean | number> = {
      active: true,
      hidden: false,
      zero: 0,
    };

    expect(cn("base", flags.active && "active", flags.hidden && "hidden")).toBe("base active");
    expect(cn("base", undefined, null)).toBe("base");
    expect(cn("base", "", "visible")).toBe("base visible");
    expect(cn("base", flags.zero && "zero")).toBe("base");
  });

  it("handles tailwind merge conflicts", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("w-10", "w-20")).toBe("w-20");
  });
});
