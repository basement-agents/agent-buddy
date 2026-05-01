// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewDetailPage } from "../pages/review-detail-page";
import type { CodeReview } from "../lib/api";

// Mock the hooks module
vi.mock("~/lib/hooks", () => ({
  useReview: vi.fn(),
  useNavigate: () => vi.fn(),
}));

import * as hooksModule from "~/lib/hooks";

// Mock API module
vi.mock("~/lib/api", () => ({
  api: {
    submitFeedback: vi.fn(),
  },
}));

// Mock toast
vi.mock("~/components/system/toast", () => ({
  useToast: vi.fn(),
}));

import { api } from "~/lib/api";
import { useToast } from "~/components/system/toast";

vi.mock("~/components/system/breadcrumb", () => ({
  Breadcrumb: ({ items }: any) => (
    <nav data-testid="breadcrumb">
      {items?.map((item: any, i: number) => (
        <span key={i}>
          {item.href ? <a href={item.href}>{item.label}</a> : item.label}
          {i < items.length - 1 && " / "}
        </span>
      ))}
    </nav>
  ),
}));

// Mock ReviewDetail component
vi.mock("~/pages/review-detail-page/_components/review-detail", () => ({
  ReviewDetail: ({ review }: any) => (
    <div data-testid="review-detail">
      <div data-testid="review-summary">{review.summary}</div>
      <div data-testid="review-state">{review.state}</div>
      <div data-testid="review-comments-count">{review.comments?.length || 0}</div>
      <div data-testid="review-model">{review.metadata.llmModel}</div>
      <div data-testid="review-tokens">{review.metadata.tokenUsage.totalTokens}</div>
      <div data-testid="review-duration">{review.metadata.durationMs}</div>
    </div>
  ),
}));

// Mock window.location
const mockLocation = {
  search: "",
  pathname: "/reviews/testowner-testrepo-42",
  href: "/reviews/testowner-testrepo-42",
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
};

describe("ReviewDetailPage", () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
    });
    (useToast as any).mockReturnValue({ showToast: mockShowToast });
    (api.submitFeedback as any).mockResolvedValue({ recorded: true });
  });

  function withReview(overrides = {}) {
    const review = { ...mockReview, ...overrides };
    vi.mocked(hooksModule.useReview).mockReturnValue({
      data: review,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  }

  const mockReview: CodeReview = {
    summary: "Test review summary",
    state: "approved",
    comments: [
      {
        id: "1",
        path: "file.ts",
        line: 10,
        body: "LGTM",
        severity: "warning",
        category: "general",
      },
      {
        id: "2",
        path: "other.ts",
        line: 20,
        body: "Fix this",
        severity: "error",
        category: "bug",
      },
    ],
    buddyId: "testbuddy",
    reviewedAt: "2026-04-19T00:00:00Z",
    metadata: {
      prNumber: 42,
      repo: "testrepo",
      owner: "testowner",
      reviewType: "standard",
      llmModel: "claude-3.5",
      tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 2500,
    },
  };

  it.skip("shows loading skeleton when review data is loading", async () => {
    vi.mocked(hooksModule.useReview).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    expect(document.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  it.skip("shows error state when review fails to load", async () => {
    vi.mocked(hooksModule.useReview).mockReturnValue({
      data: undefined,
      loading: false,
      error: "Load failed",
      refetch: vi.fn(),
    });

    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Load failed")).toBeInTheDocument();
      expect(screen.getByText("Back to Reviews")).toBeInTheDocument();
    });
  });

  it("shows not found state when review doesn't exist", async () => {
    vi.mocked(hooksModule.useReview).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Review not found")).toBeInTheDocument();
      expect(screen.getByText("Back to Reviews")).toBeInTheDocument();
    });
  });

  it("displays review summary and state badge", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByTestId("review-summary")).toHaveTextContent("Test review summary");
      expect(screen.getByTestId("review-state")).toHaveTextContent("approved");
    });
  });

  it("renders review comments with severity indicators", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByTestId("review-comments-count")).toHaveTextContent("2");
    });
  });

  it("shows review metadata (model, tokens, duration)", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByTestId("review-model")).toHaveTextContent("claude-3.5");
      expect(screen.getByTestId("review-tokens")).toHaveTextContent("150");
      expect(screen.getByTestId("review-duration")).toHaveTextContent("2500");
    });
  });

  it("shows PR link and repo info", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getAllByText("testowner/testrepo #42").length).toBeGreaterThan(0);
      expect(screen.getByText((content) => content.includes("testbuddy"))).toBeInTheDocument();
    });
  });

  it("renders breadcrumb navigation", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      const breadcrumb = screen.getByTestId("breadcrumb");
      expect(breadcrumb).toBeInTheDocument();
      expect(breadcrumb).toHaveTextContent("Home / Reviews / Review #42");
    });
  });

  it("displays reviewed date", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText(/4\/19\/2026/)).toBeInTheDocument();
    });
  });

  it("renders ReviewDetail component when review is found", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByTestId("review-detail")).toBeInTheDocument();
    });
  });

  it("handles reviews without buddyId", async () => {
    withReview({ buddyId: "" });
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("No buddy assigned"))).toBeInTheDocument();
    });
  });

  it("renders helpful and not helpful buttons when buddyId exists", async () => {
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Helpful")).toBeInTheDocument();
      expect(screen.getByText("Not Helpful")).toBeInTheDocument();
    });
  });

  it("does not render feedback buttons when buddyId is empty", async () => {
    withReview({ buddyId: "" });
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.queryByText("Helpful")).not.toBeInTheDocument();
      expect(screen.queryByText("Not Helpful")).not.toBeInTheDocument();
    });
  });

  it("calls submitFeedback when helpful button is clicked", async () => {
    const user = userEvent.setup();
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Helpful")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Helpful"));

    await waitFor(() => {
      expect(api.submitFeedback).toHaveBeenCalledWith("testbuddy", {
        reviewId: "testowner-testrepo-42",
        commentId: "overall",
        wasHelpful: true,
      });
    });
  });

  it("calls submitFeedback when not helpful button is clicked", async () => {
    const user = userEvent.setup();
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Not Helpful")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Not Helpful"));

    await waitFor(() => {
      expect(api.submitFeedback).toHaveBeenCalledWith("testbuddy", {
        reviewId: "testowner-testrepo-42",
        commentId: "overall",
        wasHelpful: false,
      });
    });
  });

  it("disables feedback buttons after selection", async () => {
    const user = userEvent.setup();
    withReview();
    render(<ReviewDetailPage reviewIndex="testowner-testrepo-42" />);

    await waitFor(() => {
      expect(screen.getByText("Helpful")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Helpful"));

    await waitFor(() => {
      expect(screen.getByText("Helpful").closest("button")).toBeDisabled();
      expect(screen.getByText("Not Helpful").closest("button")).toBeDisabled();
    });
  });
});
