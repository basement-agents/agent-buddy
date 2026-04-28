import { describe, it, expect, vi } from "vitest";
import { noopReporter, withHeartbeat, type ProgressReporter, type ProgressUpdate } from "../utils/progress.js";

function createSpyReporter(): ProgressReporter & { calls: ProgressUpdate[] } {
  const calls: ProgressUpdate[] = [];
  return {
    calls,
    report(u) { calls.push(u); },
  };
}

describe("noopReporter", () => {
  it("does nothing on report", () => {
    expect(() => noopReporter.report({ stage: "x" })).not.toThrow();
  });
});

describe("withHeartbeat", () => {
  it("returns the wrapped fn result", async () => {
    const reporter = createSpyReporter();
    const result = await withHeartbeat(reporter, { stage: "llm_call", model: "test-model" }, async () => "done");
    expect(result).toBe("done");
  });

  it("emits an initial elapsedMs=0 update with base fields", async () => {
    const reporter = createSpyReporter();
    await withHeartbeat(reporter, { stage: "llm_call", model: "claude" }, async () => 1);
    expect(reporter.calls[0]).toEqual({ stage: "llm_call", model: "claude", elapsedMs: 0 });
  });

  it("emits a final elapsedMs update on success", async () => {
    const reporter = createSpyReporter();
    await withHeartbeat(reporter, { stage: "llm_call" }, async () => "ok");
    const last = reporter.calls[reporter.calls.length - 1];
    expect(last.stage).toBe("llm_call");
    expect(typeof last.elapsedMs).toBe("number");
    expect(last.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates errors and clears the heartbeat interval", async () => {
    vi.useFakeTimers();
    const reporter = createSpyReporter();
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    try {
      await expect(
        withHeartbeat(reporter, { stage: "llm_call" }, async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("emits heartbeat ticks while fn is in flight", async () => {
    vi.useFakeTimers();
    const reporter = createSpyReporter();
    let resolve: (v: string) => void = () => {};
    const pending = new Promise<string>((res) => { resolve = res; });

    const promise = withHeartbeat(reporter, { stage: "llm_call", model: "m" }, () => pending, 100);

    await vi.advanceTimersByTimeAsync(350);
    const tickCount = reporter.calls.length;
    expect(tickCount).toBeGreaterThanOrEqual(3);

    resolve("ok");
    vi.useRealTimers();
    await expect(promise).resolves.toBe("ok");
  });
});
