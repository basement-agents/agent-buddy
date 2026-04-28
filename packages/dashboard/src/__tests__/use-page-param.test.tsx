// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePageParam } from "../lib/hooks";

describe("usePageParam", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as unknown as Record<string, unknown>).history;
    window.history = {
      replaceState: vi.fn(),
      pushState: vi.fn(),
      scrollRestoration: "auto",
      length: 1,
      state: null,
      go: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    };
    Object.defineProperty(window, "location", {
      value: {
        search: "",
        pathname: "/repos",
        href: "/repos",
        assign: vi.fn(),
        replace: vi.fn(),
        reload: vi.fn(),
        toString: () => "/repos",
      },
      writable: true,
    });
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns page 1 when no page param in URL", () => {
    window.location.search = "";
    const { result } = renderHook(() => usePageParam());
    expect(result.current[0]).toBe(1);
  });

  it("reads initial page from URL param", () => {
    window.location.search = "?page=3";
    const { result } = renderHook(() => usePageParam());
    expect(result.current[0]).toBe(3);
  });

  it("defaults to page 1 for invalid page param", () => {
    window.location.search = "?page=abc";
    const { result } = renderHook(() => usePageParam());
    expect(result.current[0]).toBe(1);
  });

  it("defaults to page 1 for negative page param", () => {
    window.location.search = "?page=-1";
    const { result } = renderHook(() => usePageParam());
    expect(result.current[0]).toBe(1);
  });

  it("defaults to page 1 for zero page param", () => {
    window.location.search = "?page=0";
    const { result } = renderHook(() => usePageParam());
    expect(result.current[0]).toBe(1);
  });

  it("updates page state and calls replaceState", () => {
    window.location.search = "";
    const { result } = renderHook(() => usePageParam());

    act(() => {
      result.current[1](3);
    });

    expect(result.current[0]).toBe(3);
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it("removes page param from URL when page is 1", () => {
    window.location.search = "";
    const { result } = renderHook(() => usePageParam());

    act(() => {
      result.current[1](1);
    });

    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/repos"
    );
  });

  it("sets page param in URL when page > 1", () => {
    window.location.search = "";
    const { result } = renderHook(() => usePageParam());

    act(() => {
      result.current[1](5);
    });

    const call = (window.history.replaceState as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toContain("page=5");
  });

  it("registers popstate listener on mount", () => {
    renderHook(() => usePageParam());
    expect(window.addEventListener).toHaveBeenCalledWith("popstate", expect.any(Function));
  });

  it("removes popstate listener on unmount", () => {
    const { unmount } = renderHook(() => usePageParam());
    unmount();
    expect(window.removeEventListener).toHaveBeenCalledWith("popstate", expect.any(Function));
  });
});
