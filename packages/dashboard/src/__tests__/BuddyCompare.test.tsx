// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuddyComparePage } from "../pages/BuddyCompare";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useBuddyComparison: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
}));

describe("BuddyComparePage", () => {
  const mockComparisonData = {
    score: 0.75,
    sharedKeywords: ["typescript", "testing", "react"],
    sharedRepos: ["owner/repo1", "owner/repo2"],
    soulOverlap: 0.8,
    analysis: {
      philosophySimilarity: 0.85,
      expertiseOverlap: 0.7,
      commonPatterns: ["Prefers functional components", "Uses custom hooks extensively"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location.href
    const mockHref = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: mockHref,
      get: () => mockHref.mock.calls[mockHref.mock.calls.length - 1]?.[0] || "",
    });

    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renders compare form with two input fields and Compare button", () => {
    render(<BuddyComparePage />);

    expect(screen.getByPlaceholderText("Buddy ID 1...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buddy ID 2...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toBeInTheDocument();
  });

  it("Compare button is disabled when IDs are empty", () => {
    render(<BuddyComparePage />);

    const compareButton = screen.getByRole("button", { name: "Compare" });
    expect(compareButton).toBeDisabled();
  });

  it("Compare button is disabled when IDs are the same", async () => {
    const user = userEvent.setup();
    render(<BuddyComparePage />);

    const input1 = screen.getByPlaceholderText("Buddy ID 1...");
    const input2 = screen.getByPlaceholderText("Buddy ID 2...");

    await user.type(input1, "buddy-1");
    await user.type(input2, "buddy-1");

    const compareButton = screen.getByRole("button", { name: "Compare" });
    expect(compareButton).toBeDisabled();
  });

  it("shows error message when IDs are the same", async () => {
    const user = userEvent.setup();
    render(<BuddyComparePage />);

    const input1 = screen.getByPlaceholderText("Buddy ID 1...");
    const input2 = screen.getByPlaceholderText("Buddy ID 2...");

    await user.type(input1, "buddy-1");
    await user.type(input2, "buddy-1");

    expect(screen.getByText("Cannot compare a buddy with itself")).toBeInTheDocument();
  });

  it("shows loading state when comparison is in progress", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Loading comparison...")).toBeInTheDocument();
  });

  it("shows error state when comparison fails", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: undefined,
      loading: false,
      error: "Failed to fetch comparison",
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Failed to fetch comparison")).toBeInTheDocument();
  });

  it("renders comparison results when data is available", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: mockComparisonData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Overall Similarity")).toBeInTheDocument();
    expect(screen.getAllByText("75%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Soul Overlap")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Philosophy")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("Expertise Overlap")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("renders shared keywords", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: mockComparisonData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Shared Keywords")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("renders shared repos", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: mockComparisonData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Shared Repos")).toBeInTheDocument();
    expect(screen.getByText("owner/repo1")).toBeInTheDocument();
    expect(screen.getByText("owner/repo2")).toBeInTheDocument();
  });

  it("renders common patterns", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: mockComparisonData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    expect(screen.getByText("Common Patterns")).toBeInTheDocument();
    expect(screen.getByText("• Prefers functional components")).toBeInTheDocument();
    expect(screen.getByText("• Uses custom hooks extensively")).toBeInTheDocument();
  });

  it("navigates to compare URL when Compare is clicked", async () => {
    const mockNavigate = vi.fn();
    vi.mocked(hooksModule.useNavigate).mockReturnValue(mockNavigate);
    const user = userEvent.setup();

    render(<BuddyComparePage />);

    const input1 = screen.getByPlaceholderText("Buddy ID 1...");
    const input2 = screen.getByPlaceholderText("Buddy ID 2...");
    const compareButton = screen.getByRole("button", { name: "Compare" });

    await user.type(input1, "buddy-1");
    await user.type(input2, "buddy-2");
    await user.click(compareButton);

    expect(mockNavigate).toHaveBeenCalledWith("/buddies/compare?id1=buddy-1&id2=buddy-2");
  });

  it("uses success variant for high similarity scores", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: { ...mockComparisonData, score: 0.85 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    // Find the badge within the "Overall Similarity" section
    const similaritySection = screen.getByText("Overall Similarity").parentElement;
    const badge = similaritySection?.querySelector(".text-green-700");
    expect(badge).toBeInTheDocument();
  });

  it("uses warning variant for medium similarity scores", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: { ...mockComparisonData, score: 0.5 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    // Find the badge within the "Overall Similarity" section
    const similaritySection = screen.getByText("Overall Similarity").parentElement;
    const badge = similaritySection?.querySelector(".text-yellow-700");
    expect(badge).toBeInTheDocument();
  });

  it("uses error variant for low similarity scores", () => {
    vi.mocked(hooksModule.useBuddyComparison).mockReturnValue({
      data: { ...mockComparisonData, score: 0.3 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparePage />);

    // Find the badge within the "Overall Similarity" section
    const similaritySection = screen.getByText("Overall Similarity").parentElement;
    const badge = similaritySection?.querySelector(".text-red-700");
    expect(badge).toBeInTheDocument();
  });
});
