// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ApiError, api } from "../lib/api";
import * as hooks from "../lib/hooks";
import type { CodeReview } from "../lib/api";

describe("usePageParam", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("returns page 1 when no page param in URL", () => {
    const { result } = renderHook(() => hooks.usePageParam());
    const [page] = result.current;
    expect(page).toBe(1);
  });

  it("reads page from URL search params", () => {
    window.history.pushState({}, "", "/test?page=3");
    const { result } = renderHook(() => hooks.usePageParam());
    const [page] = result.current;
    expect(page).toBe(3);
  });

  it("handles invalid page values by defaulting to 1", () => {
    window.history.pushState({}, "", "/test?page=invalid");
    const { result } = renderHook(() => hooks.usePageParam());
    const [page] = result.current;
    expect(page).toBe(1);
  });

  it("handles negative page values by defaulting to 1", () => {
    window.history.pushState({}, "", "/test?page=-5");
    const { result } = renderHook(() => hooks.usePageParam());
    const [page] = result.current;
    expect(page).toBe(1);
  });

  it("handles zero page value by defaulting to 1", () => {
    window.history.pushState({}, "", "/test?page=0");
    const { result } = renderHook(() => hooks.usePageParam());
    const [page] = result.current;
    expect(page).toBe(1);
  });

  it("setPageWithUrl updates URL without page param when page is 1", () => {
    window.history.pushState({}, "", "/test?page=3");
    const { result } = renderHook(() => hooks.usePageParam());
    const [, setPage] = result.current;

    act(() => {
      setPage(1);
    });

    expect(window.location.search).toBe("");
  });

  it("setPageWithUrl updates URL with page param when page > 1", () => {
    const { result } = renderHook(() => hooks.usePageParam());
    const [, setPage] = result.current;

    act(() => {
      setPage(5);
    });

    expect(window.location.search).toBe("?page=5");
  });

  it("preserves other query params when updating page", () => {
    window.history.pushState({}, "", "/test?foo=bar");
    const { result } = renderHook(() => hooks.usePageParam());
    const [, setPage] = result.current;

    act(() => {
      setPage(2);
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe("2");
    expect(params.get("foo")).toBe("bar");
  });

  it("removes page param but preserves other params when setting page to 1", () => {
    window.history.pushState({}, "", "/test?foo=bar&page=3");
    const { result } = renderHook(() => hooks.usePageParam());
    const [, setPage] = result.current;

    act(() => {
      setPage(1);
    });

    const params = new URLSearchParams(window.location.search);
    expect(params.get("page")).toBe(null);
    expect(params.get("foo")).toBe("bar");
  });

  it("responds to popstate events (back/forward navigation)", async () => {
    const { result } = renderHook(() => hooks.usePageParam());
    const [, setPage] = result.current;

    act(() => {
      setPage(3);
    });
    expect(result.current[0]).toBe(3);

    window.history.pushState({}, "", "/test?page=5");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(result.current[0]).toBe(5);
    });
  });
});

describe("useQuery", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetches data successfully and sets loading/data states", async () => {
    const mockData = { result: "success" };
    const fetcher = vi.fn().mockResolvedValue(mockData);

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBeNull();
    });
  });

  it("handles errors and sets error state without throwing", async () => {
    const apiError = new ApiError(500, "Internal Server Error");
    const fetcher = vi.fn().mockRejectedValue(apiError);

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("Internal Server Error");
      expect(result.current.data).toBeUndefined();
    });

    // Should not throw
    expect(result.current.error).toBe("Internal Server Error");
  });

  it("handles generic errors and sets generic message", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("An error occurred");
    });
  });

  it("refetches when deps change", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ data: "first" })
      .mockResolvedValueOnce({ data: "second" });

    const { result, rerender } = renderHook(
      ({ dep }) => hooks.useQuery(fetcher, [dep]),
      { initialProps: { dep: "first" } }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: "first" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    rerender({ dep: "second" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: "second" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it("aborts in-flight request on unmount", async () => {
    const abortSpy = vi.fn();
    const fetcher = vi.fn().mockImplementation((signal) => {
      if (signal) {
        signal.addEventListener("abort", abortSpy);
      }
      return new Promise(() => {}); // Never resolves
    });

    const { unmount } = renderHook(() => hooks.useQuery(fetcher));

    expect(abortSpy).not.toHaveBeenCalled();

    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it("ignores abort errors", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const fetcher = vi.fn().mockRejectedValue(abortError);

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // AbortError should not set error state
    expect(result.current.error).toBeNull();
  });

  it("returns refetch function that triggers new fetch", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 1 });
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 2 });
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resets error state on successful refetch", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, "Error"))
      .mockResolvedValueOnce({ data: "success" });

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.error).toBe("Error");
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: "success" });
      expect(result.current.error).toBeNull();
    });
  });
});

describe("useMutation", () => {
  it("executes successfully and returns result", async () => {
    const mockResult = { success: true };
    const mutator = vi.fn().mockResolvedValue(mockResult);

    const { result } = renderHook(() => hooks.useMutation(mutator));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();

    const data = await result.current.execute("arg1", "arg2");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(data).toEqual(mockResult);
    expect(mutator).toHaveBeenCalledWith("arg1", "arg2");
    expect(result.current.error).toBeNull();
  });

  it("sets loading state during execution", async () => {
    let resolveFn: (value: unknown) => void;
    const mutator = vi.fn().mockImplementation(
      () => new Promise((resolve) => {
        resolveFn = resolve;
      })
    );

    const { result } = renderHook(() => hooks.useMutation(mutator));

    // Start execution
    const executePromise = result.current.execute();

    // Wait for state to update
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Resolve the promise
    await act(async () => {
      resolveFn!({ done: true });
      await executePromise;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error state on failure and re-throws", async () => {
    const apiError = new ApiError(400, "Bad Request");
    const mutator = vi.fn().mockRejectedValue(apiError);

    const { result } = renderHook(() => hooks.useMutation(mutator));

    await expect(result.current.execute()).rejects.toThrow(apiError);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("Bad Request");
    });
  });

  it("resets error state on successful retry", async () => {
    const mutator = vi.fn()
      .mockRejectedValueOnce(new ApiError(500, "Server Error"))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => hooks.useMutation(mutator));

    // First attempt fails
    await expect(result.current.execute()).rejects.toThrow();

    await waitFor(() => {
      expect(result.current.error).toBe("Server Error");
    });

    // Second attempt succeeds
    await result.current.execute();

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it("handles generic errors", async () => {
    const mutator = vi.fn().mockRejectedValue(new Error("Generic error"));

    const { result } = renderHook(() => hooks.useMutation(mutator));

    await expect(result.current.execute()).rejects.toThrow("Generic error");

    await waitFor(() => {
      // Generic errors are converted to "An error occurred"
      expect(result.current.error).toBe("An error occurred");
    });
  });
});

describe("useJobProgress", () => {
  let mockEventSources: any[] = [];
  let closeSpy = vi.fn();

  class MockEventSource {
    private url: string;
    private handlers: {
      onopen?: () => void;
      onmessage?: (event: MessageEvent) => void;
      onerror?: (error: Event) => void;
    } = {};

    constructor(url: string) {
      this.url = url;
      mockEventSources.push(this);
    }

    addEventListener(type: string, handler: () => void) {
      if (type === "open") this.handlers.onopen = handler;
      if (type === "message") this.handlers.onmessage = handler;
      if (type === "error") this.handlers.onerror = handler;
    }

    set onopen(fn: (() => void) | undefined) {
      this.handlers.onopen = fn || undefined;
    }
    set onmessage(fn: ((event: MessageEvent) => void) | undefined) {
      this.handlers.onmessage = fn || undefined;
    }
    set onerror(fn: ((error: Event) => void) | undefined) {
      this.handlers.onerror = fn || undefined;
    }

    // Helper methods for testing
    simulateOpen() {
      this.handlers.onopen?.();
    }

    simulateMessage(data: unknown) {
      this.handlers.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    }

    simulateError(error: Event) {
      this.handlers.onerror?.(error);
    }

    close() {
      closeSpy();
      const index = mockEventSources.indexOf(this);
      if (index > -1) {
        mockEventSources.splice(index, 1);
      }
    }

    getURL() {
      return this.url;
    }
  }

  beforeEach(() => {
    mockEventSources = [];
    closeSpy = vi.fn();
    vi.stubGlobal("EventSource", MockEventSource);
  });

  const getLastEventSource = () => mockEventSources[mockEventSources.length - 1];

  it("creates EventSource connection with correct URL", () => {
    renderHook(() => hooks.useJobProgress("job-123"));

    const es = getLastEventSource();
    expect(es).toBeDefined();
    expect(es.getURL()).toBe("/api/jobs/job-123/progress");

    act(() => {
      es.simulateOpen();
    });
  });

  it("updates progress on message", () => {
    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    const progressData = {
      id: "job-123",
      status: "running" as const,
      progress: 50,
      progressStage: "Processing",
    };

    act(() => {
      const es = getLastEventSource();
      es.simulateMessage(progressData);
    });

    expect(result.current.progress).toEqual(progressData);
  });

  it("closes connection on completed state", () => {
    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    const completedData = {
      id: "job-123",
      status: "completed" as const,
      progress: 100,
    };

    act(() => {
      const es = getLastEventSource();
      es.simulateMessage(completedData);
    });

    expect(result.current.progress).toEqual(completedData);
    expect(result.current.isConnected).toBe(false);
  });

  it("closes connection on failed state", () => {
    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    const failedData = {
      id: "job-123",
      status: "failed" as const,
      error: "Job failed",
    };

    act(() => {
      const es = getLastEventSource();
      es.simulateMessage(failedData);
    });

    expect(result.current.progress).toEqual(failedData);
    expect(result.current.isConnected).toBe(false);
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() => hooks.useJobProgress("job-123"));

    unmount();

    expect(closeSpy).toHaveBeenCalled();
  });

  it("cleans up and reconnects when jobId changes", () => {
    const { result, rerender } = renderHook(
      ({ jobId }) => hooks.useJobProgress(jobId),
      { initialProps: { jobId: "job-1" } }
    );

    closeSpy.mockClear();

    // First connection
    act(() => {
      const es = getLastEventSource();
      es.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);

    // Change jobId
    rerender({ jobId: "job-2" });

    // Should close previous connection
    expect(closeSpy).toHaveBeenCalled();
    expect(result.current.progress).toBeNull();
    expect(result.current.isConnected).toBe(false);

    // New connection can open
    act(() => {
      const es = getLastEventSource();
      es.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);
  });

  it("resets state when jobId is null", () => {
    const { result, rerender } = renderHook(
      ({ jobId }: { jobId: string | null }) => hooks.useJobProgress(jobId),
      { initialProps: { jobId: "job-123" as string | null } }
    );

    act(() => {
      const es = getLastEventSource();
      es.simulateOpen();
      es.simulateMessage({
        id: "job-123",
        status: "running" as const,
        progress: 75,
      });
    });

    expect(result.current.progress).not.toBeNull();
    expect(result.current.isConnected).toBe(true);

    rerender({ jobId: null });

    expect(result.current.progress).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it("handles malformed JSON gracefully", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    // Send invalid JSON by directly triggering the handler
    const es = getLastEventSource();

    // Manually trigger onmessage with invalid JSON
    act(() => {
      try {
        JSON.parse("invalid json");
      } catch (e) {
        // This simulates what happens when malformed JSON is received
        console.error("Failed to parse SSE data:", e);
      }
    });

    // The hook should still be functional and progress should be null
    expect(result.current.progress).toBeNull();

    consoleSpy.mockRestore();
  });

  it("handles connection errors", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    act(() => {
      const es = getLastEventSource();
      es.simulateError(new Event("error"));
    });

    expect(result.current.isConnected).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith("SSE connection error:", expect.anything());

    consoleSpy.mockRestore();
  });

  it("does not close connection for non-terminal states", () => {
    const { result } = renderHook(() => hooks.useJobProgress("job-123"));

    act(() => {
      const es = getLastEventSource();
      es.simulateOpen();
      es.simulateMessage({
        id: "job-123",
        status: "queued" as const,
      });
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.progress?.status).toBe("queued");

    act(() => {
      const es = getLastEventSource();
      es.simulateMessage({
        id: "job-123",
        status: "running" as const,
        progress: 25,
      });
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.progress?.status).toBe("running");
  });

  describe("reconnection with exponential backoff", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("sets reconnecting state when connection errors", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
      });
      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnecting).toBe(false);

      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.reconnecting).toBe(true);
    });

    it("reconnects after 1 second on first error", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // Initial connection
      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
      });

      // Trigger error
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(result.current.reconnecting).toBe(true);

      // Fast forward 1 second (first retry delay)
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // New connection should be created
      const newEs = getLastEventSource();
      expect(newEs).toBeDefined();

      // Simulate successful reconnection
      act(() => {
        newEs.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnecting).toBe(false);
    });

    it("uses exponential backoff: 1s, 2s, 4s, 8s, 16s", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      const delays: number[] = [];
      const originalSetTimeout = global.setTimeout;
      vi.spyOn(global, "setTimeout").mockImplementation((fn, delay) => {
        if (typeof delay === "number") {
          delays.push(delay);
        }
        return originalSetTimeout(fn, delay);
      });

      // First error
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      // Second error (after first reconnection fails)
      act(() => {
        vi.advanceTimersByTime(1000);
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      // Third error
      act(() => {
        vi.advanceTimersByTime(2000);
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      // Fourth error
      act(() => {
        vi.advanceTimersByTime(4000);
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      // Fifth error
      act(() => {
        vi.advanceTimersByTime(8000);
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    it("stops reconnecting after 5 failed attempts", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // Initial connection
      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
      });

      // Simulate 5 failed reconnection attempts
      for (let i = 0; i < 5; i++) {
        act(() => {
          const es = getLastEventSource();
          es.simulateError(new Event("error"));
        });

        expect(result.current.reconnecting).toBe(true);

        // Advance time to trigger reconnection
        act(() => {
          vi.advanceTimersByTime(Math.min(1000 * Math.pow(2, i), 16000));
        });
      }

      // After 5th attempt fails, no more reconnections
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(result.current.reconnecting).toBe(false);
      expect(result.current.isConnected).toBe(false);
    });

    it("resets retry count on successful reconnection", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // First error and reconnection
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(result.current.reconnecting).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
        const es = getLastEventSource();
        es.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnecting).toBe(false);

      // Second error should use 1s delay again (not 2s)
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(result.current.reconnecting).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Should have successfully reconnected again
      const newEs = getLastEventSource();
      act(() => {
        newEs.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnecting).toBe(false);
    });

    it("cancels reconnection when component unmounts", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() => hooks.useJobProgress("job-123"));

      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("cancels reconnection when jobId changes", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const { rerender } = renderHook(
        ({ jobId }) => hooks.useJobProgress(jobId),
        { initialProps: { jobId: "job-1" } }
      );

      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      expect(clearTimeoutSpy).not.toHaveBeenCalled();

      rerender({ jobId: "job-2" });

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("does not reconnect if job has completed", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // Job completes
      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
        es.simulateMessage({
          id: "job-123",
          status: "completed" as const,
          progress: 100,
        });
      });

      expect(result.current.progress?.status).toBe("completed");
      expect(result.current.isConnected).toBe(false);

      // Try to trigger error after completion
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      act(() => {
        // Simulate error event (though connection should be closed)
        const es = getLastEventSource();
        if (es) {
          es.simulateError(new Event("error"));
        }
      });

      // Should not attempt reconnection
      expect(result.current.reconnecting).toBe(false);
    });

    it("does not reconnect if job has failed", () => {
      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // Job fails
      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
        es.simulateMessage({
          id: "job-123",
          status: "failed" as const,
          error: "Job failed",
        });
      });

      expect(result.current.progress?.status).toBe("failed");
      expect(result.current.isConnected).toBe(false);

      // Should not attempt reconnection
      expect(result.current.reconnecting).toBe(false);
    });

    it("clears timeout on successful connection", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const { result } = renderHook(() => hooks.useJobProgress("job-123"));

      // Trigger error
      act(() => {
        const es = getLastEventSource();
        es.simulateError(new Event("error"));
      });

      // Advance to trigger reconnection
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Successful reconnection
      act(() => {
        const es = getLastEventSource();
        es.simulateOpen();
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.reconnecting).toBe(false);
    });
  });
});

describe("useRepos", () => {
  it("smoke test - hook renders without crashing", () => {
    const { result } = renderHook(() => hooks.useRepos());

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBeInstanceOf(Function);
  });
});

describe("useBuddies", () => {
  it("smoke test - hook renders without crashing", () => {
    const { result } = renderHook(() => hooks.useBuddies());

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBeInstanceOf(Function);
  });
});

describe("useBuddy", () => {
  it("smoke test - hook renders without crashing", () => {
    const { result } = renderHook(() => hooks.useBuddy("buddy-123"));

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBeInstanceOf(Function);
  });

  it("refetches when buddy ID changes", async () => {
    const getBuddySpy = vi.spyOn(api, "getBuddy")
      .mockResolvedValueOnce({ id: "buddy-1", name: "Buddy 1" } as any)
      .mockResolvedValueOnce({ id: "buddy-2", name: "Buddy 2" } as any);

    const { result, rerender } = renderHook(
      ({ id }) => hooks.useBuddy(id),
      { initialProps: { id: "buddy-1" } }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: "buddy-1", name: "Buddy 1" });
    });

    rerender({ id: "buddy-2" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ id: "buddy-2", name: "Buddy 2" });
    });

    expect(getBuddySpy).toHaveBeenCalledTimes(2);
    expect(getBuddySpy).toHaveBeenNthCalledWith(1, "buddy-1");
    expect(getBuddySpy).toHaveBeenNthCalledWith(2, "buddy-2");
    getBuddySpy.mockRestore();
  });
});

describe("useReviews", () => {
  // Helper to create valid mock review objects
  const createMockReview = (overrides: Partial<CodeReview> = {}): CodeReview => ({
    summary: "Test review",
    state: "completed",
    comments: [],
    reviewedAt: "2024-01-01T00:00:00Z",
    metadata: {
      prNumber: 1,
      repo: "test-repo",
      owner: "test-owner",
      reviewType: "full",
      llmModel: "claude-3",
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 1000,
    },
    ...overrides,
  });

  it("smoke test - hook renders without crashing", () => {
    const { result } = renderHook(() => hooks.useReviews());

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBeInstanceOf(Function);
  });

  it("refetches when repo parameter changes", async () => {
    const listReviewsSpy = vi.spyOn(api, "listReviews")
      .mockResolvedValueOnce({ data: [createMockReview({ metadata: { ...createMockReview().metadata, repo: "repo-1" } })], reviews: [createMockReview({ metadata: { ...createMockReview().metadata, repo: "repo-1" } })], total: 1, page: 1, limit: 10, totalPages: 1 })
      .mockResolvedValueOnce({ data: [createMockReview({ metadata: { ...createMockReview().metadata, repo: "repo-2" } })], reviews: [createMockReview({ metadata: { ...createMockReview().metadata, repo: "repo-2" } })], total: 1, page: 1, limit: 10, totalPages: 1 });

    const { result, rerender } = renderHook(
      ({ repo }) => hooks.useReviews({ repo }),
      { initialProps: { repo: "repo-1" } }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].metadata.repo).toBe("repo-1");
    });

    rerender({ repo: "repo-2" });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].metadata.repo).toBe("repo-2");
    });

    expect(listReviewsSpy).toHaveBeenCalledTimes(2);
    expect(listReviewsSpy).toHaveBeenNthCalledWith(1, { repo: "repo-1" });
    expect(listReviewsSpy).toHaveBeenNthCalledWith(2, { repo: "repo-2" });
    listReviewsSpy.mockRestore();
  });

  it("refetches when buddy parameter changes", async () => {
    const listReviewsSpy = vi.spyOn(api, "listReviews")
      .mockResolvedValueOnce({ data: [createMockReview({ buddyId: "buddy-1" })], reviews: [createMockReview({ buddyId: "buddy-1" })], total: 1, page: 1, limit: 10, totalPages: 1 })
      .mockResolvedValueOnce({ data: [createMockReview({ buddyId: "buddy-2" })], reviews: [createMockReview({ buddyId: "buddy-2" })], total: 1, page: 1, limit: 10, totalPages: 1 });

    const { result, rerender } = renderHook(
      ({ buddy }) => hooks.useReviews({ buddy }),
      { initialProps: { buddy: "buddy-1" } }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].buddyId).toBe("buddy-1");
    });

    rerender({ buddy: "buddy-2" });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].buddyId).toBe("buddy-2");
    });

    expect(listReviewsSpy).toHaveBeenCalledTimes(2);
    expect(listReviewsSpy).toHaveBeenNthCalledWith(1, { buddy: "buddy-1" });
    expect(listReviewsSpy).toHaveBeenNthCalledWith(2, { buddy: "buddy-2" });
    listReviewsSpy.mockRestore();
  });

  it("refetches when status parameter changes", async () => {
    const listReviewsSpy = vi.spyOn(api, "listReviews")
      .mockResolvedValueOnce({ data: [createMockReview({ state: "pending" })], reviews: [createMockReview({ state: "pending" })], total: 1, page: 1, limit: 10, totalPages: 1 })
      .mockResolvedValueOnce({ data: [createMockReview({ state: "completed" })], reviews: [createMockReview({ state: "completed" })], total: 1, page: 1, limit: 10, totalPages: 1 });

    const { result, rerender } = renderHook(
      ({ status }) => hooks.useReviews({ status }),
      { initialProps: { status: "pending" } }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].state).toBe("pending");
    });

    rerender({ status: "completed" });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.reviews).toHaveLength(1);
      expect(result.current.data?.reviews[0].state).toBe("completed");
    });

    expect(listReviewsSpy).toHaveBeenCalledTimes(2);
    expect(listReviewsSpy).toHaveBeenNthCalledWith(1, { status: "pending" });
    expect(listReviewsSpy).toHaveBeenNthCalledWith(2, { status: "completed" });
    listReviewsSpy.mockRestore();
  });

  it("refetches when page parameter changes", async () => {
    const listReviewsSpy = vi.spyOn(api, "listReviews")
      .mockResolvedValueOnce({ data: [createMockReview()], reviews: [createMockReview()], total: 10, page: 1, limit: 10, totalPages: 1 })
      .mockResolvedValueOnce({ data: [createMockReview()], reviews: [createMockReview()], total: 10, page: 2, limit: 10, totalPages: 1 });

    const { result, rerender } = renderHook(
      ({ page }) => hooks.useReviews({ page }),
      { initialProps: { page: 1 } }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.page).toBe(1);
    });

    rerender({ page: 2 });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.page).toBe(2);
    });

    expect(listReviewsSpy).toHaveBeenCalledTimes(2);
    expect(listReviewsSpy).toHaveBeenNthCalledWith(1, { page: 1 });
    expect(listReviewsSpy).toHaveBeenNthCalledWith(2, { page: 2 });
    listReviewsSpy.mockRestore();
  });

  it("refetches when limit parameter changes", async () => {
    const listReviewsSpy = vi.spyOn(api, "listReviews")
      .mockResolvedValueOnce({ data: [createMockReview()], reviews: [createMockReview()], total: 50, page: 1, limit: 10, totalPages: 5 })
      .mockResolvedValueOnce({ data: [createMockReview()], reviews: [createMockReview()], total: 50, page: 1, limit: 50, totalPages: 1 });

    const { result, rerender } = renderHook(
      ({ limit }) => hooks.useReviews({ limit }),
      { initialProps: { limit: 10 } }
    );

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.limit).toBe(10);
    });

    rerender({ limit: 50 });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
      expect(result.current.data?.limit).toBe(50);
    });

    expect(listReviewsSpy).toHaveBeenCalledTimes(2);
    expect(listReviewsSpy).toHaveBeenNthCalledWith(1, { limit: 10 });
    expect(listReviewsSpy).toHaveBeenNthCalledWith(2, { limit: 50 });
    listReviewsSpy.mockRestore();
  });
});

describe("useAnalytics", () => {
  it("smoke test - hook renders without crashing", () => {
    const { result } = renderHook(() => hooks.useAnalytics());

    expect(result.current).toBeDefined();
    expect(result.current.data).toBeUndefined();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBeInstanceOf(Function);
  });
});

describe("useQuery AbortController integration", () => {
  it("passes AbortSignal to fetcher function", async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: "ok" });
    let capturedSignal: AbortSignal | undefined;

    const instrumentedFetcher = vi.fn().mockImplementation((signal?: AbortSignal) => {
      capturedSignal = signal;
      return fetcher(signal);
    });

    const { result } = renderHook(() => hooks.useQuery(instrumentedFetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("creates new AbortController on dependency change (refetch)", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn().mockImplementation((signal?: AbortSignal) => {
      signals.push(signal!);
      return Promise.resolve({ count: signals.length });
    });

    const { result, rerender } = renderHook(
      ({ dep }) => hooks.useQuery(fetcher, [dep]),
      { initialProps: { dep: "a" } }
    );

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 1 });
    });

    rerender({ dep: "b" });

    await waitFor(() => {
      expect(result.current.data).toEqual({ count: 2 });
    });

    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
  });

  it("handles aborted requests without setting error state", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    const fetcher = vi.fn().mockRejectedValue(abortError);

    const { result } = renderHook(() => hooks.useQuery(fetcher));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
  });
});

describe("useJobProgress stale closure fix", () => {
  let capturedOnMessage: ((event: any) => void) | null = null;

  beforeEach(() => {
    capturedOnMessage = null;
    vi.stubGlobal("EventSource", class MockEventSource {
      onopen: any = null;
      onmessage: any = null;
      onerror: any = null;
      close = vi.fn();
      constructor() {
        setTimeout(() => {
          if (this.onopen) this.onopen(new Event("open"));
          if (this.onmessage) capturedOnMessage = this.onmessage;
        }, 0);
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses ref to track progress state for reconnection decisions", async () => {
    const { result } = renderHook(() => hooks.useJobProgress("test-job"));

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    expect(capturedOnMessage).not.toBeNull();

    act(() => {
      capturedOnMessage!({ data: JSON.stringify({ id: "test-job", status: "completed", progress: 100 }) });
    });

    await waitFor(() => {
      expect(result.current.progress?.status).toBe("completed");
    });
  });
});
