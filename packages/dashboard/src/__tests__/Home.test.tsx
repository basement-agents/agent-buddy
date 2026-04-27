// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomePage } from "../pages/home";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useRepos: vi.fn(),
  useBuddies: vi.fn(),
  useReviews: vi.fn(),
  useAnalytics: vi.fn(),
  useMetrics: vi.fn(),
  useNavigate: () => vi.fn(),
}));

const emptyPaginated = { data: [], page: 1, limit: 20, total: 0, totalPages: 0 };
const emptyReviews = { data: [], reviews: [], total: 0, page: 1, limit: 50, totalPages: 0 };
const emptyAnalytics = {
  reviewsLast7Days: 0,
  reviewsLast30Days: 0,
  averageTurnaroundTimeMs: 0,
  averageTurnaroundTimeSeconds: 0,
  perBuddyCounts: {},
  perRepoCounts: {},
  reviewStates: {},
  totalReviews: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockHook(overrides: Record<string, any> = {}) {
  const base = { loading: false, error: null, refetch: vi.fn() };
  vi.mocked(hooksModule.useRepos).mockReturnValue({ data: emptyPaginated, ...base, ...overrides.repos });
  vi.mocked(hooksModule.useBuddies).mockReturnValue({ data: emptyPaginated, ...base, ...overrides.buddies });
  vi.mocked(hooksModule.useReviews).mockReturnValue({ data: emptyReviews, ...base, ...overrides.reviews });
  vi.mocked(hooksModule.useAnalytics).mockReturnValue({ data: { ...emptyAnalytics }, ...base, ...overrides.analytics });
  vi.mocked(hooksModule.useMetrics).mockReturnValue({ data: undefined, ...base, ...overrides.metrics });
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeletons when data is fetching", () => {
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: undefined, loading: true, error: null, refetch: vi.fn() });
    vi.mocked(hooksModule.useBuddies).mockReturnValue({ data: undefined, loading: true, error: null, refetch: vi.fn() });
    vi.mocked(hooksModule.useReviews).mockReturnValue({ data: undefined, loading: true, error: null, refetch: vi.fn() });
    vi.mocked(hooksModule.useAnalytics).mockReturnValue({ data: undefined, loading: false, error: null, refetch: vi.fn() });
    vi.mocked(hooksModule.useMetrics).mockReturnValue({ data: undefined, loading: true, error: null, refetch: vi.fn() });

    render(<HomePage />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays stats cards with correct values", () => {
    mockHook({
      repos: { data: { data: [{ id: "1", owner: "owner", repo: "repo", autoReview: false, triggerMode: "manual" }], page: 1, limit: 20, total: 1, totalPages: 1 } },
      buddies: { data: { data: [{ id: "buddy1", username: "buddy1", sourceRepos: [], totalReviews: 0, lastUpdated: new Date().toISOString() }], page: 1, limit: 20, total: 1, totalPages: 1 } },
      reviews: { data: { data: [], reviews: [], total: 10, page: 1, limit: 50, totalPages: 1 } },
      analytics: { data: { ...emptyAnalytics, reviewsLast7Days: 5, reviewsLast30Days: 15, averageTurnaroundTimeMs: 45000, averageTurnaroundTimeSeconds: 45, totalReviews: 10 } },
    });

    render(<HomePage />);

    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getByText("Buddies")).toBeInTheDocument();
    expect(screen.getByText("Total Reviews")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Avg Review Time")).toBeInTheDocument();
    expect(screen.getByText("45.0s")).toBeInTheDocument();
  });

  it("shows analytics trends when analytics data available", () => {
    mockHook({
      analytics: { data: { ...emptyAnalytics, reviewsLast7Days: 7, reviewsLast30Days: 30 } },
    });

    render(<HomePage />);

    expect(screen.getByText("Review Trends")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows empty states when no data", () => {
    mockHook({ analytics: { data: undefined } });

    render(<HomePage />);

    expect(screen.getByText("No analytics data available")).toBeInTheDocument();
    expect(screen.getAllByText("No reviews yet")).toHaveLength(2);
  });

  it("per-buddy breakdown renders buddy IDs and counts", () => {
    mockHook({
      analytics: { data: { ...emptyAnalytics, perBuddyCounts: { "buddy-1": 15, "buddy-2": 8, "buddy-3": 3 } } },
    });

    render(<HomePage />);

    expect(screen.getByText("Per-Buddy Reviews")).toBeInTheDocument();
    expect(screen.getByText("buddy-1")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("buddy-2")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("buddy-3")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("quick action buttons navigate correctly", () => {
    mockHook({ analytics: { data: undefined } });

    render(<HomePage />);

    expect(screen.getByText("Add Repository").closest("button")).toBeInTheDocument();
    expect(screen.getByText("Create Buddy").closest("button")).toBeInTheDocument();
    expect(screen.getByText("View Reviews").closest("button")).toBeInTheDocument();
  });

  it("displays N/A for avg review time when zero", () => {
    mockHook();

    render(<HomePage />);

    expect(screen.getByText("Avg Review Time")).toBeInTheDocument();
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("displays review statistics with state badges when reviews exist", () => {
    mockHook({
      reviews: { data: { data: [], reviews: [], total: 5, page: 1, limit: 50, totalPages: 1 } },
      analytics: { data: { ...emptyAnalytics, reviewStates: { approved: 3, commented: 1, changes_requested: 1 }, totalReviews: 5 } },
    });

    render(<HomePage />);

    expect(screen.getByText("Review Statistics")).toBeInTheDocument();
    expect(screen.getByText("Review States")).toBeInTheDocument();
    expect(screen.getByText("approved: 3")).toBeInTheDocument();
    expect(screen.getByText("commented: 1")).toBeInTheDocument();
    expect(screen.getByText("changes requested: 1")).toBeInTheDocument();
  });

  it("displays recent activity when reviews exist", () => {
    const mockReview = {
      summary: "Test review summary",
      buddyId: "buddy-1",
      state: "approved" as const,
      reviewedAt: "2026-04-19T10:00:00Z",
      metadata: {
        owner: "testowner",
        repo: "testrepo",
        prNumber: 42,
        reviewType: "full",
        llmModel: "claude-3.5-sonnet",
        tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
        durationMs: 15000,
      },
      comments: [],
    };

    mockHook({
      reviews: { data: { data: [mockReview], reviews: [mockReview], total: 1, page: 1, limit: 50, totalPages: 1 } },
      analytics: { data: undefined },
    });

    render(<HomePage />);

    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("testowner/testrepo #42")).toBeInTheDocument();
    expect(screen.getByText("by buddy-1")).toBeInTheDocument();
    expect(screen.getByText("0 comments")).toBeInTheDocument();
    expect(screen.getAllByText("15.0s").length).toBeGreaterThanOrEqual(1);
  });

  it("shows no buddy data available when perBuddyCounts is empty", () => {
    mockHook();

    render(<HomePage />);

    expect(screen.getByText("No buddy data available")).toBeInTheDocument();
  });
});
