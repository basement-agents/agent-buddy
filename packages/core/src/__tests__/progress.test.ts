import { describe, it, expect, vi } from "vitest";
import { noopReporter, withHeartbeat, bandReporter, type ProgressReporter, type ProgressUpdate } from "../utils/progress.js";

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

  it("does not emit fraction by default", async () => {
    const reporter = createSpyReporter();
    await withHeartbeat(reporter, { stage: "llm_call" }, async () => "ok");
    expect(reporter.calls.every((c) => c.fraction === undefined)).toBe(true);
  });

  it("emits asymptotic fraction within range when fractionRange is provided", async () => {
    vi.useFakeTimers();
    const reporter = createSpyReporter();
    let resolve: (v: string) => void = () => {};
    const pending = new Promise<string>((res) => { resolve = res; });

    const promise = withHeartbeat(
      reporter,
      { stage: "llm_call" },
      () => pending,
      { intervalMs: 1000, fractionRange: [0, 1], timeConstantMs: 10_000 }
    );

    expect(reporter.calls[0].fraction).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    const midTicks = reporter.calls.filter((c) => c.fraction !== undefined && c.fraction > 0 && c.fraction < 1);
    expect(midTicks.length).toBeGreaterThan(0);
    midTicks.forEach((c) => {
      expect(c.fraction).toBeGreaterThan(0);
      expect(c.fraction).toBeLessThan(1);
    });

    resolve("ok");
    vi.useRealTimers();
    await promise;
    expect(reporter.calls[reporter.calls.length - 1].fraction).toBe(1);
  });

  it("scales fractionRange so emitted fraction stays within band", async () => {
    vi.useFakeTimers();
    const reporter = createSpyReporter();
    let resolve: (v: string) => void = () => {};
    const pending = new Promise<string>((res) => { resolve = res; });

    const promise = withHeartbeat(
      reporter,
      { stage: "llm_call", subStep: "chunk 2/4" },
      () => pending,
      { intervalMs: 500, fractionRange: [0.25, 0.5], timeConstantMs: 5_000 }
    );

    await vi.advanceTimersByTimeAsync(20_000);
    reporter.calls.forEach((c) => {
      if (c.fraction !== undefined) {
        expect(c.fraction).toBeGreaterThanOrEqual(0.25);
        expect(c.fraction).toBeLessThanOrEqual(0.5);
      }
    });

    resolve("ok");
    vi.useRealTimers();
    await promise;
    expect(reporter.calls[reporter.calls.length - 1].fraction).toBe(0.5);
  });
});

describe("bandReporter", () => {
  it("forwards updates without fraction unchanged", () => {
    const calls: ProgressUpdate[] = [];
    const parent: ProgressReporter = { report: (u) => calls.push(u) };
    const wrapped = bandReporter(parent, [0.5, 1]);
    wrapped.report({ stage: "x", model: "m" });
    expect(calls[0]).toEqual({ stage: "x", model: "m" });
  });

  it("scales fraction into the configured band", () => {
    const calls: ProgressUpdate[] = [];
    const parent: ProgressReporter = { report: (u) => calls.push(u) };
    const wrapped = bandReporter(parent, [0.4, 0.6]);
    wrapped.report({ fraction: 0 });
    wrapped.report({ fraction: 0.5 });
    wrapped.report({ fraction: 1 });
    expect(calls.map((c) => c.fraction)).toEqual([0.4, 0.5, 0.6]);
  });

  it("clamps out-of-range fraction to band edges", () => {
    const calls: ProgressUpdate[] = [];
    const parent: ProgressReporter = { report: (u) => calls.push(u) };
    const wrapped = bandReporter(parent, [0.2, 0.8]);
    wrapped.report({ fraction: -1 });
    wrapped.report({ fraction: 2 });
    expect(calls[0].fraction).toBe(0.2);
    expect(calls[1].fraction).toBe(0.8);
  });
});
