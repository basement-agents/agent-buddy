// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RepoDetailPage } from "../pages/repo-detail";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useQuery: vi.fn(() => ({ data: undefined, loading: false, error: null, refetch: vi.fn() })),
  useMutation: vi.fn(() => ({ execute: vi.fn(), loading: false })),
  useNavigate: () => vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    listRepos: vi.fn(),
    listBuddies: vi.fn(),
    getRepoRules: vi.fn(),
    getRepoSchedule: vi.fn(),
    listReviews: vi.fn(),
    listOpenPRs: vi.fn(),
    updateRepo: vi.fn(),
    addRepoRule: vi.fn(),
    deleteRepoRule: vi.fn(),
    updateRepoRule: vi.fn(),
    removeRepo: vi.fn(),
    updateRepoSchedule: vi.fn(),
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

vi.mock("~/components/system/confirm-dialog", () => ({
  ConfirmDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("RepoDetailPage", () => {
  const mockRepoConfig = (overrides = {}) => ({
    id: "owner/repo",
    owner: "owner",
    repo: "repo",
    buddyId: "buddy1",
    autoReview: true,
    triggerMode: "auto",
    ...overrides,
  });

  const mockBuddySummary = {
    id: "buddy1",
    username: "testbuddy",
    sourceRepos: ["owner/repo"],
    totalReviews: 10,
    lastUpdated: new Date("2026-04-19"),
  };

  const mockCustomRule = {
    id: "rule1",
    name: "No console.log",
    pattern: "console\\.(log|debug)",
    severity: "warning" as const,
    enabled: true,
    category: "code-quality",
  };

  const mockScheduleConfig = {
    enabled: true,
    interval: 60,
    lastRun: new Date("2026-04-19T10:00:00Z"),
    nextRun: new Date("2026-04-19T11:00:00Z"),
  };

  const mockOpenPR = {
    number: 42,
    title: "Add new feature",
    url: "https://github.com/owner/repo/pull/42",
    author: "contributor",
    createdAt: new Date("2026-04-19T09:00:00Z"),
  };

  const mockReview = {
    summary: "Great work on this PR",
    state: "completed" as const,
    comments: [],
    buddyId: "buddy1",
    reviewedAt: "2026-04-19T10:30:00Z",
    metadata: {
      prNumber: 42,
      repo: "repo",
      owner: "owner",
      reviewType: "standard" as const,
      llmModel: "claude-3.5",
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 1000,
    },
  };

  const mockReviewsData = {
    reviews: [mockReview],
    total: 1,
    page: 1,
    limit: 10,
  };

  // Helper function to setup all useQuery mocks
  function setupQueryMocks(repoConfigOverride = {}) {
    let callCount = 0;
    vi.mocked(hooksModule.useQuery).mockImplementation(() => {
      callCount++;
      // Use modulo to handle React's multiple re-renders
      // Hooks are called in order: 1,2,3,4,5,6, then 1,2,3,4,5,6 again for re-renders
      const callIndex = ((callCount - 1) % 6) + 1;
      switch (callIndex) {
        case 1: // repoConfig
          return {
            data: mockRepoConfig(repoConfigOverride),
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        case 2: // buddies
          return {
            data: [mockBuddySummary],
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        case 3: // rules
          return {
            data: [mockCustomRule],
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        case 4: // schedule
          return {
            data: mockScheduleConfig,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        case 5: // reviewsData
          return {
            data: mockReviewsData,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        case 6: // openPRs
          return {
            data: [mockOpenPR],
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
        default:
          return {
            data: undefined,
            loading: false,
            error: null,
            refetch: vi.fn(),
          };
      }
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton when repo data is loading", () => {
    vi.mocked(hooksModule.useQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("shows error state when repo fails to load", () => {
    vi.mocked(hooksModule.useQuery).mockReturnValue({
      data: undefined,
      loading: false,
      error: "Repository not found",
      refetch: vi.fn(),
    });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    expect(screen.getByText("Repository not found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Repositories" })).toBeInTheDocument();
  });

  it("displays repo name and owner on load", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "owner/repo" })).toBeInTheDocument();
      expect(screen.getByText("Repository configuration and management")).toBeInTheDocument();
    });
  });

  it("renders breadcrumb navigation with Home link", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getByText("Repos")).toBeInTheDocument();
      expect(screen.getAllByText("owner/repo").length).toBeGreaterThanOrEqual(2);
      const homeLink = screen.getByText("Home").closest("a");
      expect(homeLink).toHaveAttribute("href", "/");
      const reposLink = screen.getByText("Repos").closest("a");
      expect(reposLink).toHaveAttribute("href", "/repos");
    });
  });

  it("displays auto-review toggle and trigger mode selector", async () => {
    setupQueryMocks({ autoReview: true, triggerMode: "auto" });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Auto-Review")).toBeInTheDocument();
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByText("Trigger Mode")).toBeInTheDocument();
      expect(screen.getByText("auto")).toBeInTheDocument();
    });
  });

  it("displays quick action buttons", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Edit Config" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });
  });

  it("shows schedule configuration card", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Schedule")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Configure" })).toBeInTheDocument();
    });
  });

  it("shows custom rules section", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText(/Custom Rules/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add Rule" })).toBeInTheDocument();
    });
  });

  it("shows recent reviews section", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Recent Reviews")).toBeInTheDocument();
    });
  });

  it("shows open pull requests section", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Open Pull Requests")).toBeInTheDocument();
    });
  });

  it("displays disabled auto-review state", async () => {
    setupQueryMocks({ autoReview: false });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Auto-Review")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("displays manual trigger mode", async () => {
    setupQueryMocks({ triggerMode: "manual" });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Trigger Mode")).toBeInTheDocument();
      expect(screen.getByText("manual")).toBeInTheDocument();
    });
  });

  it("displays schedule trigger mode", async () => {
    setupQueryMocks({ triggerMode: "schedule" });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Trigger Mode")).toBeInTheDocument();
      expect(screen.getByText("schedule")).toBeInTheDocument();
    });
  });

  it("shows buddy assignment section with current buddy info", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Buddies")).toBeInTheDocument();
      expect(screen.getByText("buddy1")).toBeInTheDocument();
    });
  });

  it("shows empty buddy state when no buddy assigned", async () => {
    setupQueryMocks({ buddyId: undefined });
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      expect(screen.getByText("Buddies")).toBeInTheDocument();
      expect(screen.getByText("None assigned")).toBeInTheDocument();
    });
  });

  it("shows Edit button alongside Delete on each rule card", async () => {
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);
    await waitFor(() => {
      const editButtons = screen.getAllByRole("button", { name: "Edit" });
      expect(editButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("opens edit dialog pre-filled with current rule values when Edit is clicked", async () => {
    setupQueryMocks();
    const user = await import("@testing-library/user-event").then((m) => m.default.setup());
    render(<RepoDetailPage owner="owner" repo="repo" />);

    await waitFor(() => {
      expect(screen.getByText("No console.log")).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Edit Custom Rule")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("No console.log");
    expect(nameInput).toBeInTheDocument();
    const patternInput = screen.getByDisplayValue("console\\.(log|debug)");
    expect(patternInput).toBeInTheDocument();
  });

  it("calls updateRepoRule and refreshes rules on save", async () => {
    const { api } = await import("../lib/api");
    vi.mocked(api.updateRepoRule).mockResolvedValue({ rule: { ...mockCustomRule, name: "Updated Rule" } });
    vi.mocked(hooksModule.useMutation).mockImplementation((mutator: (...args: unknown[]) => Promise<unknown>) => ({
      execute: (...args: unknown[]) => mutator(...args),
      loading: false,
      error: null,
    }));
    const user = await import("@testing-library/user-event").then((m) => m.default.setup());
    setupQueryMocks();
    render(<RepoDetailPage owner="owner" repo="repo" />);

    await waitFor(() => {
      expect(screen.getByText("No console.log")).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);

    await waitFor(() => {
      expect(screen.getByText("Edit Custom Rule")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("No console.log");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Rule");

    const saveButtons = screen.getAllByRole("button", { name: "Save" });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(api.updateRepoRule).toHaveBeenCalledWith(
        "owner/repo",
        "rule1",
        expect.objectContaining({ name: "Updated Rule" })
      );
    });
  });
});
