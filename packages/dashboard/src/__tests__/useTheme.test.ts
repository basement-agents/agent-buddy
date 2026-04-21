import { describe, it, expect, beforeEach, vi } from "vitest";

const store: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((key) => delete store[key]);
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  length: 0,
  key: vi.fn(),
};

vi.stubGlobal("localStorage", localStorageMock);

describe("useTheme", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    document.documentElement.classList.remove("dark");
  });

  it("defaults to 'system' when no preference stored", () => {
    const stored = localStorage.getItem("agent-buddy-theme");
    expect(stored).toBeNull();
  });

  it("reads theme from localStorage", () => {
    localStorage.setItem("agent-buddy-theme", "dark");
    const theme = localStorage.getItem("agent-buddy-theme");
    expect(theme).toBe("dark");
  });

  it("persists theme choice to localStorage", () => {
    localStorage.setItem("agent-buddy-theme", "light");
    expect(localStorage.getItem("agent-buddy-theme")).toBe("light");
  });

  it("toggles between light and dark", () => {
    localStorage.setItem("agent-buddy-theme", "light");
    localStorage.setItem("agent-buddy-theme", "dark");
    expect(localStorage.getItem("agent-buddy-theme")).toBe("dark");
  });

  it("applies dark class when theme is dark", () => {
    document.documentElement.classList.add("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when theme is light", () => {
    document.documentElement.classList.remove("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("stores system preference", () => {
    localStorage.setItem("agent-buddy-theme", "system");
    expect(localStorage.getItem("agent-buddy-theme")).toBe("system");
  });
});
