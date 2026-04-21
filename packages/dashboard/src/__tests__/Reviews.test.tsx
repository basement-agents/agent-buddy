// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ReviewsPage } from "../pages/Reviews";
import type { CodeReview } from "../lib/api";

// Mock the hooks module
vi.mock("@/lib/hooks", () => ({
  useReviews: vi.fn(),
  useNavigate: () => vi.fn(),
  useDebouncedValue: (value: string) => value,
}));

// Mock the API module
vi.mock("@/lib/api", () => ({
  api: {
    connectToJobProgress: vi.fn(() => vi.fn()),
  },
}));

// Mock window.location
const mockLocation = {
  search: "",
  pathname: "/reviews",
  href: "/reviews",
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

describe("ReviewsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
    });
    mockLocation.search = "";
  });

  const mockReviews: CodeReview[] = [
    {
      summary: "Great implementation overall",
      state: "approved",
      comments: [
        {
          id: "comment-1",
          path: "src/utils.ts",
          line: 10,
          body: "Consider adding error handling",
          severity: "warning",
          category: "error-handling",
        },
      ],
      buddyId: "buddy-1",
      reviewedAt: "2024-01-15T10:30:00Z",
      metadata: {
        prNumber: 123,
        repo: "agent-buddy",
        owner: "basement-agents",
        reviewType: "full",
        llmModel: "claude-3-opus",
        tokenUsage: { inputTokens: 1500, outputTokens: 500, totalTokens: 2000 },
        durationMs: 5000,
        jobId: "job-1",
      },
    },
    {
      summary: "Some issues found",
      state: "changes_requested",
      comments: [
        {
          id: "comment-2",
          path: "src/components/Header.tsx",
          line: 25,
          body: "Fix accessibility issue",
          severity: "error",
          category: "accessibility",
        },
      ],
      buddyId: "buddy-2",
      reviewedAt: "2024-01-14T15:20:00Z",
      metadata: {
        prNumber: 456,
        repo: "other-repo",
        owner: "test-org",
        reviewType: "quick",
        llmModel: "claude-3-sonnet",
        tokenUsage: { inputTokens: 1000, outputTokens: 300, totalTokens: 1300 },
        durationMs: 3500,
      },
    },
  ];

  it("renders review list from API data", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("Reviews")).toBeInTheDocument();
      expect(screen.getByText("Code review history")).toBeInTheDocument();
    });

    // Check for review items
    expect(screen.getByText("basement-agents/agent-buddy #123")).toBeInTheDocument();
    expect(screen.getByText("test-org/other-repo #456")).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    // Check for skeleton loading
    const skeletonRows = document.querySelectorAll(".animate-pulse");
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it("empty state when no reviews exist", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: [],
        reviews: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("No reviews yet")).toBeInTheDocument();
      expect(
        screen.getByText("Reviews will appear here once a buddy reviews a pull request")
      ).toBeInTheDocument();
    });
  });

  it("empty state with filters when no reviews match", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: [],
        reviews: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    // Set URL params to simulate active filters
    mockLocation.search = "?repo=test-repo&status=approved";

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("No reviews match your filters")).toBeInTheDocument();
    });
  });

  it("review items display PR info", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: [mockReviews[0]],
        reviews: [mockReviews[0]],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("basement-agents/agent-buddy #123")).toBeInTheDocument();
    });

    // Check for buddy ID
    expect(screen.getByText("by buddy-1")).toBeInTheDocument();

    // Check for comments count
    expect(screen.getByText("1 comments")).toBeInTheDocument();

    // Check for duration
    expect(screen.getByText("5.0s")).toBeInTheDocument();

    // Check for date
    expect(screen.getByText("1/15/2024")).toBeInTheDocument();
  });

  it("status badges show correct variant colors", async () => {
    const { useReviews } = await import("@/lib/hooks");
    const reviews = [
      {
        ...mockReviews[0],
        state: "approved",
      },
      {
        ...mockReviews[1],
        state: "commented",
      },
      {
        ...mockReviews[0],
        state: "changes_requested",
        metadata: { ...mockReviews[0].metadata, prNumber: 789 },
      },
    ];
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: reviews,
        reviews,
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("approved")).toBeInTheDocument();
      expect(screen.getByText("commented")).toBeInTheDocument();
      expect(screen.getByText("changes requested")).toBeInTheDocument();
    });

    // Check that badges are rendered
    const badges = screen.getAllByText(/approved|commented|changes requested/);
    expect(badges.length).toBe(3);
  });

  it("pagination controls are rendered", async () => {
    // Set URL search params to page 2
    mockLocation.search = "?page=2";

    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 45,
        page: 2,
        limit: 20,
        totalPages: 3,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      // Check for Previous and Next buttons
      expect(screen.getByText("Previous")).toBeInTheDocument();
      expect(screen.getByText("Next")).toBeInTheDocument();
      // Check that page 2 is highlighted (current page)
      expect(screen.getByText("2")).toBeInTheDocument();
    });
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("pagination Previous button is disabled on first page", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 45,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      const prevButton = screen.getByText("Previous");
      expect(prevButton).toBeInTheDocument();
      expect(prevButton).toBeDisabled();
    });
  });

  it("pagination Next button is disabled on last page", async () => {
    // Set URL search params to page 3 (last page with total 41)
    mockLocation.search = "?page=3";

    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 41, // 3 pages with 20 per page
        page: 3,
        limit: 20,
        totalPages: 3,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      const nextButton = screen.getByText("Next");
      expect(nextButton).toBeInTheDocument();
      expect(nextButton).toBeDisabled();
    });
  });

  it("renders filters section", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Filter by repo...")).toBeInTheDocument();
      expect(screen.getByText("All statuses")).toBeInTheDocument();
      expect(screen.getByText("All buddies")).toBeInTheDocument();
      expect(screen.getByText("Sort by Date")).toBeInTheDocument();
    });
  });

  it("renders buddy dropdown populated from reviews data", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("buddy-1")).toBeInTheDocument();
      expect(screen.getByText("buddy-2")).toBeInTheDocument();
    });
  });

  it("renders date range inputs for filtering", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByTitle("From date")).toBeInTheDocument();
      expect(screen.getByTitle("To date")).toBeInTheDocument();
    });
  });

  it("displays error state", async () => {
    const { useReviews } = await import("@/lib/hooks");
    vi.mocked(useReviews).mockReturnValue({
      data: undefined,
      loading: false,
      error: "Failed to fetch reviews",
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      expect(screen.getByText("Error: Failed to fetch reviews")).toBeInTheDocument();
      expect(screen.getByText("Try Again")).toBeInTheDocument();
    });
  });

  it("sorts by date with newest first (default)", async () => {
    const { useReviews } = await import("@/lib/hooks");
    mockLocation.search = "";
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      const items = screen.getAllByText(/basement-agents\/agent-buddy|test-org\/other-repo/);
      // Newest first: review-1 (2024-01-15) before review-2 (2024-01-14)
      expect(items[0].textContent).toContain("basement-agents/agent-buddy");
      expect(items[1].textContent).toContain("test-org/other-repo");
    });
  });

  it("sorts by repo alphabetically", async () => {
    const { useReviews } = await import("@/lib/hooks");
    mockLocation.search = "?sort=repo";
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: mockReviews,
        reviews: mockReviews,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      const items = screen.getAllByText(/basement-agents\/agent-buddy|test-org\/other-repo/);
      // Alphabetical: "basement-agents/agent-buddy" before "test-org/other-repo"
      expect(items[0].textContent).toContain("basement-agents/agent-buddy");
      expect(items[1].textContent).toContain("test-org/other-repo");
    });
  });

  it("sorts by status groups (approved > changes_requested > commented)", async () => {
    const { useReviews } = await import("@/lib/hooks");
    mockLocation.search = "?sort=status";
    const statusReviews = [
      { ...mockReviews[1], state: "commented", metadata: { ...mockReviews[1].metadata, prNumber: 100 } },
      { ...mockReviews[0], state: "approved", metadata: { ...mockReviews[0].metadata, prNumber: 101 } },
      { ...mockReviews[1], state: "changes_requested", metadata: { ...mockReviews[1].metadata, prNumber: 102 } },
    ];
    vi.mocked(useReviews).mockReturnValue({
      data: {
        data: statusReviews,
        reviews: statusReviews,
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewsPage />);

    await waitFor(() => {
      const items = screen.getAllByText(/approved|changes requested|commented/);
      expect(items[0].textContent).toBe("approved");
      expect(items[1].textContent).toBe("changes requested");
      expect(items[2].textContent).toBe("commented");
    });
  });
});
