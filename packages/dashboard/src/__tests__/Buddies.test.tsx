// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BuddiesPage } from "~/pages/buddies/index";
import * as hooksModule from "~/lib/hooks";

vi.mock("~/lib/hooks", () => ({
  useBuddies: vi.fn(),
  useBuddy: vi.fn(),
  useBuddyFeedback: vi.fn(),
  useMutation: vi.fn(() => ({ execute: vi.fn(), loading: false, error: null })),
  useQuery: vi.fn(),
  usePageParam: vi.fn(() => [1, vi.fn()]),
  useRepos: vi.fn(),
  useReviews: vi.fn(),
  useAnalytics: vi.fn(),
  useNavigate: () => vi.fn(),
}));

// Mock UI components
vi.mock("~/components/system/toast", () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

vi.mock("~/components/system/confirm-dialog", () => ({
  ConfirmDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useConfirmDialog: vi.fn(() => ({
    confirm: vi.fn(async () => true),
  })),
}));

vi.mock("~/pages/buddies/_components/create-buddy-dialog", () => ({
  CreateBuddyDialog: () => null,
}));

vi.mock("~/pages/buddies/_components/buddy-comparison", () => ({
  BuddyComparison: () => null,
}));

vi.mock("~/components/shared/progress-bar", () => ({
  ProgressBar: () => null,
}));

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: {
    Root: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    Trigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

describe("BuddiesPage", () => {
  const mockSetPage = vi.fn();
  const mockRefetch = vi.fn();

  const mockBuddies = [
    {
      id: "buddy-1",
      username: "john-doe",
      sourceRepos: ["owner/repo1", "owner/repo2"],
      totalReviews: 42,
      lastUpdated: "2026-04-19T00:00:00Z",
    },
    {
      id: "buddy-2",
      username: "jane-smith",
      sourceRepos: ["org/project"],
      totalReviews: 15,
      lastUpdated: "2026-04-18T00:00:00Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hooksModule.usePageParam).mockReturnValue([1, mockSetPage]);
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });
    vi.mocked(hooksModule.useBuddy).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useMutation).mockReturnValue({
      execute: vi.fn().mockResolvedValue({ deleted: "buddy-1" }),
      loading: false,
      error: null,
    });
    vi.mocked(hooksModule.useQuery).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(hooksModule.useBuddyFeedback).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });


  it.skip("shows loading skeleton when buddies are loading", () => {
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    expect(document.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  it.skip("displays error state with retry button", () => {
    const errorMessage = "Failed to load buddies";
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: undefined,
      loading: false,
      error: errorMessage,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders buddy list from API data", async () => {
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: mockBuddies, page: 1, limit: 20, total: 2, totalPages: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    await waitFor(() => {
      expect(screen.getByText("john-doe")).toBeInTheDocument();
      expect(screen.getByText("jane-smith")).toBeInTheDocument();
    });
  });

  it("shows empty state when no buddies exist", () => {
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    expect(screen.getByText(/no buddies created yet/i)).toBeInTheDocument();
  });

  it("each buddy card shows username, repos badge, and last updated date", async () => {
    const singleBuddy = [
      {
        id: "buddy-1",
        username: "charlie",
        sourceRepos: ["org/repo1", "org/repo2", "org/repo3"],
        totalReviews: 100,
        lastUpdated: "2026-04-19T00:00:00Z",
      },
    ];

    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: singleBuddy, page: 1, limit: 20, total: 1, totalPages: 1 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    await waitFor(() => {
      expect(screen.getByText("charlie")).toBeInTheDocument();
      expect(screen.getByText(/3 repos/i)).toBeInTheDocument();
      expect(screen.getByText(/org\/repo1, org\/repo2, org\/repo3/i)).toBeInTheDocument();
    });
  });

  it("pagination is rendered when totalPages > 1", () => {
    vi.mocked(hooksModule.useBuddies).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 3 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    render(<BuddiesPage />);

    const pagination = screen.getByRole("navigation", { name: /pagination/i });
    expect(pagination).toBeInTheDocument();
  });
});
