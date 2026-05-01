// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReposPage } from "../pages/repos";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useRepos: vi.fn(),
  useBuddies: vi.fn(),
  useMutation: vi.fn(() => ({ execute: vi.fn(), loading: false, error: null })),
  usePageParam: vi.fn(() => [1, vi.fn()]),
  useQuery: vi.fn(),
  useReviews: vi.fn(),
  useAnalytics: vi.fn(),
  useNavigate: () => vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    addRepo: vi.fn(),
    removeRepo: vi.fn(),
    getRepoSchedule: vi.fn(),
    updateRepoSchedule: vi.fn(),
    triggerReview: vi.fn(),
  },
}));

vi.mock("~/components/system/toast", () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock("~/components/system/confirm-dialog", () => ({
  ConfirmDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <>{open ? children : null}</>
    ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Backdrop: () => <div data-testid="dialog-backdrop" />,
    Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-popup">{children}</div>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    Description: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRepo = (overrides: Record<string, any> = {}) => ({
  id: "owner/repo1",
  owner: "owner",
  repo: "repo1",
  buddyId: "buddy1",
  autoReview: true,
  triggerMode: "auto",
  ...overrides,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockBuddy = (overrides: Record<string, any> = {}) => ({
  id: "buddy1",
  username: "TestBuddy",
  sourceRepos: ["owner/repo1"],
  totalReviews: 5,
  lastUpdated: "2026-01-01T00:00:00Z",
  ...overrides,
});

const repo2 = mockRepo({ id: "owner/repo2", owner: "owner", repo: "repo2", buddyId: undefined, autoReview: false, triggerMode: "mention" });

function withBuddies(data: ReturnType<typeof mockRepo>[]) {
  vi.mocked(hooksModule.useRepos).mockReturnValue({
    data: { data, page: 1, limit: 20, total: data.length, totalPages: 1 },
    loading: false,
    error: null,
    refetch: vi.fn()
  });
  vi.mocked(hooksModule.useBuddies).mockReturnValue({
    data: { data: [mockBuddy()], page: 1, limit: 20, total: 1, totalPages: 1 },
    loading: false,
    error: null,
    refetch: vi.fn()
  });
}

describe("ReposPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: undefined });
    vi.mocked(hooksModule.useBuddies).mockReturnValue({ data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 } });
    vi.mocked(hooksModule.useMutation).mockReturnValue({ execute: vi.fn(), loading: false, error: null });
    vi.mocked(hooksModule.usePageParam).mockReturnValue([1, vi.fn()]);
  });

  it.skip("shows loading skeleton when repos are loading", () => {
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: undefined });
    render(<ReposPage />);
    expect(document.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  it.skip("shows error state with retry button when repos fail to load", () => {
    const refetchMock = vi.fn();
    vi.mocked(hooksModule.useRepos).mockReturnValue({ data: undefined, loading: false, error: "Network error", refetch: refetchMock });
    render(<ReposPage />);
    expect(screen.getByText("Error: Network error")).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeInTheDocument();
    retryButton.click();
    expect(refetchMock).toHaveBeenCalledOnce();
  });

  it("shows empty state when no repos configured", () => {
    vi.mocked(hooksModule.useRepos).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 1 },
      loading: false,
      error: null,
      refetch: vi.fn()
    });
    render(<ReposPage />);
    expect(screen.getByText("No repositories configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add your first repository/i })).toBeInTheDocument();
  });

  it("renders repo list with key data fields", () => {
    // The repos page was redesigned (Stream D) from a table to a feed-list layout.
    // Verify that the key data is rendered: repo links, buddy badges, status badges,
    // and action buttons — without relying on columnheader roles.
    withBuddies([mockRepo(), repo2]);
    render(<ReposPage />);
    // Repo links
    expect(screen.getByRole("link", { name: "owner/repo1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "owner/repo2" })).toBeInTheDocument();
    // Buddy badge for repo1 (has buddy1), "none" for repo2
    expect(screen.getByText("buddy1")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument();
    // Auto-review badges
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    // Action buttons
    expect(screen.getAllByRole("button", { name: /configure/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /trigger review/i }).length).toBeGreaterThan(0);
  });

  it("displays buddy badge for repos with buddy assigned", () => {
    withBuddies([mockRepo()]);
    render(<ReposPage />);
    expect(screen.getByText("buddy1")).toBeInTheDocument();
  });

  it("shows 'none' for repos without buddy", () => {
    withBuddies([repo2]);
    render(<ReposPage />);
    expect(screen.getByText("none")).toBeInTheDocument();
  });

  it("displays repo links in table", () => {
    withBuddies([mockRepo()]);
    render(<ReposPage />);
    const repoLink = screen.getByRole("link", { name: "owner/repo1" });
    expect(repoLink).toBeInTheDocument();
    expect(repoLink).toHaveAttribute("href", "/repos/owner/repo1");
  });

  it("displays auto-review status badges", () => {
    withBuddies([mockRepo(), repo2]);
    render(<ReposPage />);
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("shows configure button for schedule column", () => {
    withBuddies([mockRepo()]);
    render(<ReposPage />);
    expect(screen.getByRole("button", { name: /configure/i })).toBeInTheDocument();
  });

  it("shows trigger review button for manual review column", () => {
    withBuddies([mockRepo()]);
    render(<ReposPage />);
    expect(screen.getByRole("button", { name: /trigger review/i })).toBeInTheDocument();
  });

  it("renders repository list from API data", () => {
    vi.mocked(hooksModule.useRepos).mockReturnValue({
      data: {
        data: [
          mockRepo({ id: "owner/repo1", owner: "owner", repo: "repo1" }),
          mockRepo({ id: "owner/repo2", owner: "owner", repo: "repo2" }),
        ],
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: [mockBuddy()], page: 1, limit: 20, total: 1, totalPages: 1 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReposPage />);

    expect(screen.getByRole("link", { name: "owner/repo1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "owner/repo2" })).toBeInTheDocument();
  });

  it("pagination is rendered", () => {
    vi.mocked(hooksModule.useRepos).mockReturnValue({
      data: { data: [mockRepo()], page: 1, limit: 20, total: 1, totalPages: 5 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReposPage />);

    const pagination = screen.getByRole("navigation");
    expect(pagination).toBeInTheDocument();
  });
});
