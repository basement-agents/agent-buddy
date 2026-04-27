// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuddyDetailPage } from "../pages/buddy-detail";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useBuddy: vi.fn(),
  useBuddyFeedback: vi.fn(),
  useReviews: vi.fn(),
  useRepos: vi.fn(),
  useMutation: vi.fn(() => ({ execute: vi.fn(), loading: false })),
  useNavigate: () => vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    getBuddyFeedback: vi.fn(),
    deleteBuddy: vi.fn(),
    updateRepo: vi.fn(),
    triggerReview: vi.fn(),
    updateBuddy: vi.fn(),
    getBuddyStatus: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

vi.mock("~/components/system/toast", () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div className="markdown-content">{children}</div>,
}));

describe("BuddyDetailPage", () => {
  const mockBuddyProfile = {
    id: "testuser",
    username: "testuser",
    soul: "# Soul\nThis is the soul content",
    user: "# User\nThis is the user content",
    memory: "# Memory\nThis is the memory content",
    sourceRepos: ["owner/repo"],
    createdAt: new Date("2026-04-19"),
    updatedAt: new Date("2026-04-19"),
  };

  const mockReviews = {
    data: [
      {
        summary: "Test review summary",
        state: "approved",
        comments: [{ id: "1", path: "file.ts", line: 10, body: "LGTM", severity: "info", category: "general" }],
        buddyId: "testuser",
        reviewedAt: "2026-04-19T00:00:00Z",
        metadata: {
          prNumber: 1,
          repo: "repo",
          owner: "owner",
          reviewType: "standard",
          llmModel: "claude-3.5",
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          durationMs: 1000,
        },
      },
    ],
    reviews: [
      {
        summary: "Test review summary",
        state: "approved",
        comments: [{ id: "1", path: "file.ts", line: 10, body: "LGTM", severity: "info", category: "general" }],
        buddyId: "testuser",
        reviewedAt: "2026-04-19T00:00:00Z",
        metadata: {
          prNumber: 1,
          repo: "repo",
          owner: "owner",
          reviewType: "standard",
          llmModel: "claude-3.5",
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          durationMs: 1000,
        },
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const mockRepos = {
    data: [
      { id: "owner/repo", owner: "owner", repo: "repo", buddyId: "testuser", autoReview: true, triggerMode: "auto" },
      { id: "other/repo", owner: "other", repo: "repo", buddyId: undefined, autoReview: false, triggerMode: "manual" },
    ],
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockReview = (overrides: Record<string, any> = {}) => ({
    summary: "Test review",
    state: "approved" as const,
    comments: [{ id: "1", path: "file.ts", line: 10, body: "LGTM", severity: "info" as const, category: "general" as const }],
    buddyId: "testuser",
    reviewedAt: "2026-04-19T00:00:00Z",
    metadata: {
      prNumber: 1,
      repo: "repo",
      owner: "owner",
      reviewType: "standard" as const,
      llmModel: "claude-3.5",
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 1000,
    },
    ...overrides,
  });

  function withBuddy() {
    vi.mocked(hooksModule.useBuddy).mockReturnValue({
      data: mockBuddyProfile,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hooksModule.useBuddy).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useReviews).mockReturnValue({
      data: { data: [], reviews: [], total: 0, page: 1, limit: 10, totalPages: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useRepos).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useMutation).mockReturnValue({
      execute: vi.fn().mockResolvedValue({}),
      loading: false,
      error: null,
    });
    vi.mocked(hooksModule.useBuddyFeedback).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows loading skeleton when buddy data is loading", () => {
    vi.mocked(hooksModule.useBuddy).mockReturnValue({ data: undefined, loading: true, error: null, refetch: vi.fn() });
    render(<BuddyDetailPage buddyId="testuser" />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error state when buddy fails to load", () => {
    vi.mocked(hooksModule.useBuddy).mockReturnValue({ data: undefined, loading: false, error: "Not found", refetch: vi.fn() });
    render(<BuddyDetailPage buddyId="testuser" />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Buddies" })).toBeInTheDocument();
  });

  it("displays buddy username and source repos on load", async () => {
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "testuser" })).toBeInTheDocument();
      expect(screen.getByText("Source repos: owner/repo")).toBeInTheDocument();
    });
  });

  it("renders breadcrumb navigation with Home link", async () => {
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Buddies")).toBeInTheDocument();
      expect(screen.getAllByText("testuser").length).toBeGreaterThanOrEqual(2);
      const homeLink = screen.getByText("Home").closest("a");
      expect(homeLink).toHaveAttribute("href", "/");
      const buddiesLink = screen.getByText("Buddies").closest("a");
      expect(buddiesLink).toHaveAttribute("href", "/buddies");
    });
  });

  it("renders tab navigation for Overview, Soul, User, Memory, Feedback", async () => {
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("Soul")).toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Memory")).toBeInTheDocument();
      expect(screen.getByText("Feedback")).toBeInTheDocument();
    });
  });

  it("shows review statistics with total reviews, success rate, avg comments", async () => {
    withBuddy();
    vi.mocked(hooksModule.useReviews).mockReturnValue({ data: mockReviews, loading: false, error: null, refetch: vi.fn() });
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("Total Reviews")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("Success Rate")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Avg Comments")).toBeInTheDocument();
      expect(screen.getByText("1.0")).toBeInTheDocument();
    });
  });

  it("shows assigned repos list", async () => {
    withBuddy();
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: mockRepos, loading: false, error: null, refetch: vi.fn() });
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("Assigned Repos")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("owner/repo")).toBeInTheDocument();
    });
  });

  it("renders Soul tab with ReactMarkdown content", async () => {
    const user = userEvent.setup();
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByText("Overview")).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "Soul" }));
    await waitFor(() => { expect(screen.getByText(/soul content/i)).toBeInTheDocument(); });
  });

  it("shows delete confirmation dialog when delete button clicked", async () => {
    const user = userEvent.setup();
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByRole("heading", { level: 1, name: "testuser" })).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.getByText("Delete Buddy")).toBeInTheDocument();
      expect(screen.getByText("Are you sure you want to delete this buddy? This cannot be undone.")).toBeInTheDocument();
    });
  });

  it("switches between tabs correctly", async () => {
    const user = userEvent.setup();
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByText("Overview")).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "User" }));
    await waitFor(() => { expect(screen.getByText(/user content/i)).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "Memory" }));
    await waitFor(() => { expect(screen.getByText(/memory content/i)).toBeInTheDocument(); });
  });

  it("displays quick action buttons", async () => {
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Assign to Repo" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Trigger Review" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Update Profile" })).toBeInTheDocument();
    });
  });

  it("shows empty state when no assigned repos", async () => {
    withBuddy();
    vi.mocked(hooksModule.useRepos).mockReturnValue({
      data: { data: [{ id: "other/repo", owner: "other", repo: "repo", buddyId: undefined, autoReview: false, triggerMode: "manual" }], page: 1, limit: 20, total: 1, totalPages: 1 },
      loading: false, error: null, refetch: vi.fn(),
    });
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("This buddy is not assigned to any repositories.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no reviews", async () => {
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("No reviews performed by this buddy yet.")).toBeInTheDocument();
    });
  });

  it("displays review history with review details", async () => {
    withBuddy();
    const review1 = mockReview({ metadata: { ...mockReview().metadata, prNumber: 42 }, comments: [
      { id: "1", path: "file.ts", line: 10, body: "LGTM", severity: "info", category: "general" },
      { id: "2", path: "file.ts", line: 20, body: "Great work", severity: "info", category: "general" },
    ] });
    const review2 = mockReview({ summary: "Test review 2", state: "changes_requested", metadata: { ...mockReview().metadata, prNumber: 7, repo: "project", owner: "org" }, comments: [
      { id: "3", path: "file.ts", line: 15, body: "Please fix this", severity: "error", category: "bug" },
    ], reviewedAt: "2026-04-18T00:00:00Z" });
    vi.mocked(hooksModule.useReviews).mockReturnValue({
      data: {
        data: [review1, review2],
        reviews: [review1, review2],
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
      loading: false, error: null, refetch: vi.fn(),
    });
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => {
      expect(screen.getByText("owner/repo #42")).toBeInTheDocument();
      expect(screen.getByText("org/project #7")).toBeInTheDocument();
      expect(screen.getByText("2 comments")).toBeInTheDocument();
      expect(screen.getByText("1 comments")).toBeInTheDocument();
    });
  });

  it("opens assign dialog when Assign to Repo clicked", async () => {
    const user = userEvent.setup();
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByRole("heading", { level: 1, name: "testuser" })).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "Assign to Repo" }));
    await waitFor(() => {
      expect(screen.getByText("Assign Buddy to Repository")).toBeInTheDocument();
      expect(screen.getByText("Select a repository...")).toBeInTheDocument();
    });
  });

  it("opens update dialog when Update Profile clicked", async () => {
    const user = userEvent.setup();
    withBuddy();
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByRole("heading", { level: 1, name: "testuser" })).toBeInTheDocument(); });
    await user.click(screen.getByRole("button", { name: "Update Profile" }));
    await waitFor(() => {
      expect(screen.getByText("Update Buddy Profile")).toBeInTheDocument();
      expect(screen.getByText("Analyze additional review history to update this buddy's persona")).toBeInTheDocument();
    });
  });

  it("opens trigger dialog when Trigger Review clicked", async () => {
    const user = userEvent.setup();
    withBuddy();
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: mockRepos, loading: false, error: null, refetch: vi.fn() });
    render(<BuddyDetailPage buddyId="testuser" />);
    await waitFor(() => { expect(screen.getByRole("heading", { level: 1, name: "testuser" })).toBeInTheDocument(); });
    const triggerButtons = screen.getAllByRole("button", { name: /^trigger review/i });
    const outlineTriggerButton = triggerButtons.find(btn =>
      btn.classList.contains("border-border") || btn.textContent!.includes("Trigger Review")
    );
    if (outlineTriggerButton) await user.click(outlineTriggerButton);
    await waitFor(() => {
      expect(screen.getByText("Trigger a review for a specific pull request")).toBeInTheDocument();
    });
  });
});
