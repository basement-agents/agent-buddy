import { describe, it, expect } from "vitest";
import { createConcurrencyLimiter } from "../utils/concurrency.js";

describe("createConcurrencyLimiter", () => {
  it("should limit concurrent executions", async () => {
    const limit = createConcurrencyLimiter(2);
    let running = 0;
    let maxRunning = 0;

    const task = async (): Promise<number> => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 50));
      running--;
      return 1;
    };

    const results = await Promise.all([
      limit(task),
      limit(task),
      limit(task),
      limit(task),
      limit(task),
    ]);

    expect(results).toEqual([1, 1, 1, 1, 1]);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it("should propagate resolved values", async () => {
    const limit = createConcurrencyLimiter(3);
    const result = await limit(async () => 42);
    expect(result).toBe(42);
  });

  it("should propagate rejected errors", async () => {
    const limit = createConcurrencyLimiter(2);
    await expect(
      limit(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("should throw if maxConcurrent < 1", () => {
    expect(() => createConcurrencyLimiter(0)).toThrow("maxConcurrent must be at least 1");
  });

  it("should execute tasks one at a time when maxConcurrent is 1", async () => {
    const limit = createConcurrencyLimiter(1);
    let running = 0;
    let maxRunning = 0;

    const task = async (): Promise<void> => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
    };

    await Promise.all([limit(task), limit(task), limit(task)]);
    expect(maxRunning).toBe(1);
  });

  it("should not block when concurrency limit is not reached", async () => {
    const limit = createConcurrencyLimiter(10);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => limit(async () => i))
    );
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });
});
