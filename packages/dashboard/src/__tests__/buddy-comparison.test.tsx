// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BuddyComparison } from "~/pages/buddies/_components/buddy-comparison";
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

describe.skip("BuddyComparison", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders comparison view with two buddy profiles", () => {
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "Focuses on TypeScript and testing", ["owner/repo1", "owner/repo2"]) };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Emphasizes security and performance", ["owner/repo2", "owner/repo3"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("reviewer1")).toBeInTheDocument();
    expect(screen.getByText("reviewer2")).toBeInTheDocument();
    expect(screen.getByText("Comparing Buddies")).toBeInTheDocument();
  });

  it("displays similarity score", () => {
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript and React expert", ["owner/repo1", "owner/repo2"]) };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "TypeScript and React developer", ["owner/repo2", "owner/repo3"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Similarity Score")).toBeInTheDocument();
    const scoreEls = screen.getAllByText(/\d+%/);
    expect(scoreEls.length).toBeGreaterThan(0);
  });

  it("displays shared repos", () => {
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "Code philosophy", ["owner/repo1", "owner/repo2", "owner/repo3"]) };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Code philosophy", ["owner/repo2", "owner/repo3", "owner/repo4"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText("Shared Repos:")).toBeInTheDocument();
    const documentText = document.body.textContent ?? "";
    expect(documentText).toContain("owner/repo2");
    expect(documentText).toContain("owner/repo3");
  });

  it("displays none when no shared repos", () => {
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript expert", ["owner/repo1"]) };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Python expert", ["owner/repo2"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    const noneEls = screen.getAllByText("None");
    expect(noneEls.length).toBeGreaterThan(0);
  });

  it("displays soul profile overlap percentage", () => {
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: createMockProfile("buddy-1", "reviewer1", "TypeScript and React testing", ["owner/repo1"]) };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "TypeScript and React security", ["owner/repo1"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

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
    const mockBuddy = (id: string | undefined) => {
      if (id === "buddy-1") {
        return { data: undefined,  };
      }
      return { data: createMockProfile("buddy-2", "reviewer2", "Philosophy", ["owner/repo1"]) };
    };
    (vi.mocked(hooksModule.useBuddy) as unknown as { mockImplementation: (fn: (id: string | undefined) => ReturnType<typeof mockBuddy>) => void }).mockImplementation(mockBuddy);

    render(<BuddyComparison buddyId1="buddy-1" buddyId2="buddy-2" onClose={vi.fn()} />);

    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
  });

});
