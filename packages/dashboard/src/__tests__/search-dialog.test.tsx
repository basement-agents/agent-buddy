// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchDialog } from "../components/layout/search-dialog";
import * as apiModule from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    search: vi.fn(),
  },
}));

describe("SearchDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.search).mockResolvedValue({ repos: [], buddies: [], reviews: [] });
  });

  it("renders search input when triggered by keyboard shortcut", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();
  });

  it("filters static results based on search query", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "xyznonexistent");

    await waitFor(() => {
      expect(screen.getByText("No results found")).toBeInTheDocument();
    });
  });

  it("calls onSelect (navigates) when a result is clicked", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    await screen.findByText("Dashboard");

    const dashboardLink = screen.getByText("Dashboard").closest("a");
    expect(dashboardLink).toHaveAttribute("href", "/");
  });

  it("closes on Escape key", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search repos, buddies, reviews...")).not.toBeInTheDocument();
    });
  });

  it("shows static pages when query is empty", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Repositories")).toBeInTheDocument();
    expect(screen.getByText("Buddies")).toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("toggles dialog open/close with Cmd+K", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    await userEvent.keyboard("{Meta>}k{/Meta}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search repos, buddies, reviews...")).not.toBeInTheDocument();
    });
  });

  it("navigates results with arrow keys", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    await screen.findByText("Dashboard");

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");

    await userEvent.click(searchInput);
    await userEvent.keyboard("{ArrowDown}");

    await userEvent.keyboard("{ArrowDown}");

    await waitFor(() => {
      const reposLink = screen.getByText("Repositories").closest("a");
      expect(reposLink?.className).toContain("bg-zinc-100");
    });
  });

  it("resets state when dialog is closed and reopened", async () => {
    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.type(searchInput, "test");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search repos, buddies, reviews...")).not.toBeInTheDocument();
    });

    await userEvent.keyboard("{Meta>}k{/Meta}");

    const reopenedInput = await screen.findByPlaceholderText("Search repos, buddies, reviews...");
    expect(reopenedInput).toHaveValue("");
  });

  it("shows search results from API", async () => {
    vi.mocked(apiModule.api.search).mockResolvedValue({
      repos: [{ id: "1", owner: "testowner", repo: "testrepo" }],
      buddies: [{ id: "b1", username: "testbuddy" }],
      reviews: [{ owner: "testowner", repo: "testrepo", prNumber: 42, summary: "Test review" }],
    });

    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.type(searchInput, "test");

    await waitFor(() => {
      expect(screen.getByText("testowner/testrepo")).toBeInTheDocument();
      expect(screen.getByText("testbuddy")).toBeInTheDocument();
      expect(screen.getByText("testowner/testrepo #42")).toBeInTheDocument();
    });
  });

  it("includes owner in review href", async () => {
    vi.mocked(apiModule.api.search).mockResolvedValue({
      repos: [],
      buddies: [],
      reviews: [{ owner: "myowner", repo: "myrepo", prNumber: 10, summary: "A review" }],
    });

    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");
    const searchInput = await screen.findByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.type(searchInput, "my");

    await waitFor(() => {
      const reviewLink = screen.getByText("myowner/myrepo #10").closest("a");
      expect(reviewLink).toHaveAttribute("href", "/reviews/myowner-myrepo-10");
    });
  });

  it("shows error message when API call fails", async () => {
    vi.mocked(apiModule.api.search).mockRejectedValue(new Error("Network error"));

    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.type(searchInput, "test");

    await waitFor(() => {
      expect(screen.getByText("Search failed. Retrying on next keystroke...")).toBeInTheDocument();
    });
  });

  it("clears error when user types new query", async () => {
    vi.mocked(apiModule.api.search).mockRejectedValueOnce(new Error("Network error"));

    render(<SearchDialog />);

    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(await screen.findByPlaceholderText("Search repos, buddies, reviews...")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search repos, buddies, reviews...");
    await userEvent.type(searchInput, "fail");

    await waitFor(() => {
      expect(screen.getByText("Search failed. Retrying on next keystroke...")).toBeInTheDocument();
    });

    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "ok");

    await waitFor(() => {
      expect(screen.queryByText("Search failed. Retrying on next keystroke...")).not.toBeInTheDocument();
    });
  });
});
