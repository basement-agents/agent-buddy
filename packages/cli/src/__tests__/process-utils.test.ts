import { describe, it, expect } from "vitest";
import { isAlive } from "../daemon/process-utils.js";

describe("isAlive", () => {
  it("returns true for current process", () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it("returns false for clearly-dead PID", () => {
    expect(isAlive(99999999)).toBe(false);
  });

  it("returns false for zero or negative", () => {
    expect(isAlive(0)).toBe(false);
    expect(isAlive(-1)).toBe(false);
  });
});
