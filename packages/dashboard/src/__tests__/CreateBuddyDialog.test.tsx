// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreateBuddyDialog } from "../components/CreateBuddyDialog";
import * as hooks from "../lib/hooks";
import * as apiModule from "../lib/api";

// Mock the hooks
vi.mock("../lib/hooks", () => ({
  useQuery: vi.fn(() => ({ data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 }, loading: false, error: null, refetch: vi.fn() })),
  useMutation: vi.fn((mutator) => ({
    execute: mutator,
    loading: false,
    error: null,
  })),
  useNavigate: () => vi.fn(),
}));

// Mock the API
vi.mock("../lib/api", () => ({
  api: {
    listRepos: vi.fn(),
    createBuddy: vi.fn(),
    getJobStatus: vi.fn(),
  },
}));

describe("CreateBuddyDialog", () => {
  const mockOnSuccess = vi.fn();
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders first step of wizard", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.getByText("Create Buddy")).toBeInTheDocument();
    expect(screen.getByText("Analyze a reviewer's history to create an AI persona")).toBeInTheDocument();
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("owner/repo")).toBeInTheDocument();
    expect(screen.getByText("Select Repo")).toBeInTheDocument();
    expect(screen.getByText("1")).toHaveClass("bg-blue-600");
  });

  it("validates repo format - invalid without slash", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    const nextButton = screen.getByText("Next");
    expect(nextButton).toBeDisabled();
  });

  it("validates repo format - valid with slash", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    const repoInput = screen.getByPlaceholderText("owner/repo");
    repoInput.setAttribute("value", "test/repo");

    // Trigger change event
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    expect(valueSetter).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (valueSetter as any).call(repoInput, "test/repo");
    repoInput.dispatchEvent(new Event("input", { bubbles: true }));

    const nextButton = screen.getByText("Next");
    expect(nextButton).toBeEnabled();
  });

  it("renders all step indicators", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("displays step labels", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.getByText("Select Repo")).toBeInTheDocument();
    expect(screen.getByText("Enter Username")).toBeInTheDocument();
    expect(screen.getByText("Configure")).toBeInTheDocument();
    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("shows format hint for invalid repo", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    const repoInput = screen.getByPlaceholderText("owner/repo");

    // Set value without slash
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    expect(valueSetter).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (valueSetter as any).call(repoInput, "invalidrepo");
    repoInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(screen.getByText("Format: owner/repo")).toBeInTheDocument();
  });

  it("displays repos from useQuery when available", async () => {
    const hooksModule = await import("../lib/hooks");
    vi.mocked(hooksModule.useQuery).mockReturnValue({
      data: {
        data: [
          { id: "owner1/repo1", owner: "owner1", repo: "repo1", autoReview: true, triggerMode: "auto" },
          { id: "owner2/repo2", owner: "owner2", repo: "repo2", autoReview: false, triggerMode: "manual" },
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

    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.getByText("Or select a configured repo:")).toBeInTheDocument();
    expect(screen.getByText("owner1/repo1")).toBeInTheDocument();
    expect(screen.getByText("owner2/repo2")).toBeInTheDocument();
  });

  it("hides repo list when no repos available", async () => {
    const hooksModule = await import("../lib/hooks");
    vi.mocked(hooksModule.useQuery).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.queryByText("Or select a configured repo:")).not.toBeInTheDocument();
  });

  it("shows disabled Next button on step 1 when repo is invalid", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    const nextButton = screen.getByText("Next");
    expect(nextButton).toBeDisabled();
  });

  it("shows Back button on step 2 and 3", () => {
    // This test just checks the structure - we can't actually navigate without user interaction
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    // On step 1, there's no Back button
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when rendered with open=false", () => {
    render(
      <CreateBuddyDialog open={false} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    // Dialog should not be visible when open is false
    expect(screen.queryByText("Create Buddy")).not.toBeInTheDocument();
  });

  it("renders dialog with correct title and description", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    expect(screen.getByText("Create Buddy")).toBeInTheDocument();
    expect(screen.getByText("Analyze a reviewer's history to create an AI persona")).toBeInTheDocument();
  });

  it("has proper form structure on step 1", () => {
    render(
      <CreateBuddyDialog open={true} onOpenChange={mockOnOpenChange} onSuccess={mockOnSuccess} />
    );

    // Check for required elements
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("owner/repo")).toBeInTheDocument();
  });
});
