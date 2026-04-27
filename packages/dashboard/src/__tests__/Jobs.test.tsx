import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockListJobs = vi.fn();
const mockCancelJob = vi.fn();

vi.mock("~/lib/api", () => ({
  api: {
    listJobs: (...args: unknown[]) => mockListJobs(...args),
    cancelJob: (...args: unknown[]) => mockCancelJob(...args),
  },
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = "ApiError";
    }
  },
}));

vi.mock("~/lib/hooks", () => ({
  useJobProgress: () => ({
    progress: null,
    isConnected: false,
    reconnecting: false,
  }),
  usePageParam: () => [1, vi.fn()],
  useNavigate: () => vi.fn(),
}));

vi.stubGlobal("EventSource", class MockEventSource {
  onopen: any = null;
  onmessage: any = null;
  onerror: any = null;
  close = vi.fn();
});

describe("JobsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListJobs.mockResolvedValue({
      data: [
        {
          id: "review-1",
          type: "review" as const,
          repoId: "owner/repo",
          prNumber: 42,
          buddyId: "buddy-1",
          status: "completed" as const,
          createdAt: "2026-04-19T10:00:00Z",
          completedAt: "2026-04-19T10:05:00Z",
        },
        {
          id: "review-2",
          type: "review" as const,
          repoId: "owner/repo",
          prNumber: 43,
          buddyId: "buddy-1",
          status: "running" as const,
          progressPercentage: 60,
          progressStage: "Analyzing diff",
          createdAt: "2026-04-19T11:00:00Z",
        },
        {
          id: "analysis-1",
          type: "analysis" as const,
          buddyId: "buddy-2",
          repoId: "owner/repo",
          status: "queued" as const,
          createdAt: "2026-04-19T12:00:00Z",
        },
      ],
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Jobs page with heading", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("Jobs")).toBeInTheDocument();
    });
  });

  it("displays job count badges", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("3 total")).toBeInTheDocument();
      expect(screen.getByText("1 queued")).toBeInTheDocument();
      expect(screen.getByText("1 running")).toBeInTheDocument();
    });
  });

  it("renders job rows with correct data", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("owner/repo").length).toBeGreaterThan(0);
      expect(screen.getByText("#42")).toBeInTheDocument();
      expect(screen.getByText("#43")).toBeInTheDocument();
    });
  });

  it("shows progress bar for running jobs", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("60%")).toBeInTheDocument();
      expect(screen.getByText("Analyzing diff")).toBeInTheDocument();
    });
  });

  it("calls listJobs on mount", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(mockListJobs).toHaveBeenCalled();
    });
  });

  it("shows error state when API fails", async () => {
    mockListJobs.mockRejectedValue(new Error("Network error"));
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("renders status filter dropdown", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("All statuses")).toBeInTheDocument();
    });
  });

  it("renders repo filter dropdown", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getByText("All repos")).toBeInTheDocument();
    });
  });

  it("renders Cancel button for running jobs", async () => {
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Cancel").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does not render Cancel button for completed jobs", async () => {
    mockListJobs.mockResolvedValue({
      data: [
        {
          id: "review-done",
          type: "review" as const,
          repoId: "owner/repo",
          prNumber: 42,
          buddyId: "buddy-1",
          status: "completed" as const,
          createdAt: "2026-04-19T10:00:00Z",
          completedAt: "2026-04-19T10:05:00Z",
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
    });
  });

  it("calls cancelJob when Cancel button is clicked", async () => {
    mockCancelJob.mockResolvedValue({ success: true, jobId: "review-2", status: "cancelled" });
    const { JobsPage } = await import("~/pages/jobs");
    render(<JobsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Cancel").length).toBeGreaterThanOrEqual(1);
    });

    const cancelButtons = screen.getAllByText("Cancel");
    cancelButtons[0].click();

    await waitFor(() => {
      expect(mockCancelJob).toHaveBeenCalled();
    });
  });
});
