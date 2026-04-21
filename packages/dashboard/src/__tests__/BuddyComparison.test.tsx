// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuddyComparison } from "../components/BuddyComparison.js";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useBuddy: vi.fn(),
  useNavigate: () => vi.fn(),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

const createMockProfile = (id: string, username: string, soul: string, sourceRepos: string[]) => ({
  id,
  username,
  soul,
  user: `# Expertise\nTypeScript`,
  memory: "# Memory\nSome review notes",
  sourceRepos,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe("BuddyComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders comparison view with two buddy profiles", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "Focuses on TypeScript and testing", ["owner/repo1", "owner/repo2"]), loading: false, error: null, refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Emphasizes security and performance", ["owner/repo2", "owner/repo3"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("reviewer1")).toBeInTheDocument();
    expect(screen.getByText("reviewer2")).toBeInTheDocument();
    expect(screen.getByText("Comparing Buddies")).toBeInTheDocument();
  });

  it("displays similarity score", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript and React expert", ["owner/repo1", "owner/repo2"]), loading: false, error: null, refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "TypeScript and React developer", ["owner/repo2", "owner/repo3"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Similarity Score")).toBeInTheDocument();
    const scoreEls = screen.getAllByText(/\d+%/);
    expect(scoreEls.length).toBeGreaterThan(0);
  });

  it("displays shared repos", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "Code philosophy", ["owner/repo1", "owner/repo2", "owner/repo3"]), loading: false, error: null, refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Code philosophy", ["owner/repo2", "owner/repo3", "owner/repo4"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Shared Repos:")).toBeInTheDocument();
    const documentText = document.body.textContent ?? "";
    expect(documentText).toContain("owner/repo2");
    expect(documentText).toContain("owner/repo3");
  });

  it("displays none when no shared repos", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript expert", ["owner/repo1"]), loading: false, error: null, refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Python expert", ["owner/repo2"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    const noneEls = screen.getAllByText("None");
    expect(noneEls.length).toBeGreaterThan(0);
  });

  it("displays soul profile overlap percentage", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript and React testing", ["owner/repo1"]), loading: false, error: null, refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "TypeScript and React security", ["owner/repo1"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Soul Profile Overlap:")).toBeInTheDocument();
  });

  it("handles loading state", () => {
    vi.mocked(hooksModule.useBuddy).mockReturnValue({
      data: undefined,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Comparing Buddies")).toBeInTheDocument();
    expect(screen.queryByText("Similarity Score")).not.toBeInTheDocument();
  });

  it("handles error state when one profile fails to load", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      if (id === "buddy-1") {
        return { data: undefined, loading: false, error: "Failed to load", refetch: vi.fn() };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Philosophy", ["owner/repo1"]), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
  });

  it("renders close button", () => {
    vi.mocked(hooksModule.useBuddy).mockImplementation((id: string) => {
      return { data: createMockProfile(id, `user-${id}`, "Philosophy", []), loading: false, error: null, refetch: vi.fn() };
    });

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    const closeButtons = screen.getAllByText("Close");
    expect(closeButtons.length).toBeGreaterThan(0);
  });
});
