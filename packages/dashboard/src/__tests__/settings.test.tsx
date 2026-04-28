// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../pages/settings";

// Mock API module
vi.mock("~/lib/api", () => ({
  api: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getRepoRules: vi.fn(),
    addRepoRule: vi.fn(),
    deleteRepoRule: vi.fn(),
  },
  ApiError: class extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

// Mock hooks
vi.mock("~/lib/hooks", () => ({
  useRepos: vi.fn(),
  useNavigate: () => vi.fn(),
}));

// Mock toast
vi.mock("~/components/system/toast", () => ({
  useToast: vi.fn(),
}));

// Mock UI components
vi.mock("~/components/system/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("~/components/system/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("~/components/system/card", () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}));

vi.mock("~/components/system/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

import { api } from "~/lib/api";
import { useRepos } from "~/lib/hooks";
import { useToast } from "~/components/system/toast";

describe("SettingsPage", () => {
  const mockShowToast = vi.fn();
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (useToast as any).mockReturnValue({ showToast: mockShowToast });
    (useRepos as any).mockReturnValue({
      data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 },
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    (api.getSettings as any).mockResolvedValue({
      githubToken: "ghp_test",
      server: { port: 3000, host: "0.0.0.0", webhookSecret: "" },
      review: { maxComments: 50, defaultSeverity: "suggestion", autoApproveBelow: false, reviewDelaySeconds: 0 },
    });

    (api.updateSettings as any).mockResolvedValue(undefined);
    (api.getRepoRules as any).mockResolvedValue([]);
    (api.addRepoRule as any).mockResolvedValue({
      id: "rule-1",
      name: "Test",
      pattern: "test",
      severity: "warning",
      enabled: true,
    });
    (api.deleteRepoRule as any).mockResolvedValue(undefined);
  });

  describe("Loading state", () => {
    it("renders loading state initially", () => {
      (api.getSettings as any).mockImplementation(() => new Promise(() => {}));

      render(<SettingsPage />);

      expect(screen.getByText("Loading settings...")).toBeInTheDocument();
    });
  });

  describe("Settings form", () => {
    it("renders settings form after loading", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText("GitHub Connection")).toBeInTheDocument();
      expect(screen.getByText("Server Configuration")).toBeInTheDocument();
      expect(screen.getByText("Review Settings")).toBeInTheDocument();
    });

    it("displays GitHub token input field", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const tokenInput = screen.getByPlaceholderText("ghp_...");
      expect(tokenInput).toBeInTheDocument();
      expect(tokenInput).toHaveAttribute("type", "password");
    });

    it("displays server port input field", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const portInput = screen.getByDisplayValue("3000");
      expect(portInput).toBeInTheDocument();
    });

    it("displays webhook secret input field", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const secretInput = screen.getByPlaceholderText("Leave empty to disable signature verification");
      expect(secretInput).toBeInTheDocument();
      expect(secretInput).toHaveAttribute("type", "password");
    });

    it("displays max comments input field", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const maxCommentsInput = screen.getByDisplayValue("50");
      expect(maxCommentsInput).toBeInTheDocument();
      expect(maxCommentsInput).toHaveAttribute("type", "number");
    });

    it("displays default severity select field", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText("Default Severity")).toBeInTheDocument();
      expect(screen.getByText("Suggestion")).toBeInTheDocument();
      expect(screen.getByText("Info")).toBeInTheDocument();
      expect(screen.getByText("Warning")).toBeInTheDocument();
      expect(screen.getByText("Error")).toBeInTheDocument();
    });
  });

  describe("Repository state", () => {
    it("shows 'No repositories configured' message when repos is empty", async () => {
      (useRepos as any).mockReturnValue({
        data: { data: [], page: 1, limit: 20, total: 0, totalPages: 0 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText(/No repositories configured yet/)).toBeInTheDocument();
      expect(screen.getByText("Go to Repos →")).toBeInTheDocument();
    });

    it("does not show 'No repositories configured' message when repos exist", async () => {
      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.queryByText(/No repositories configured yet/)).not.toBeInTheDocument();
    });
  });

  describe("Webhook URL display", () => {
    it("shows webhook URL with server port", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText("http://localhost:3000/api/webhooks/github")).toBeInTheDocument();
    });

    it("shows webhook secret configured indicator when secret is set", async () => {
      (api.getSettings as any).mockResolvedValue({
        githubToken: "ghp_test",
        server: { port: 3000, host: "0.0.0.0", webhookSecret: "my-secret" },
        review: { maxComments: 50, defaultSeverity: "suggestion", autoApproveBelow: false, reviewDelaySeconds: 0 },
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText("Webhook secret configured")).toBeInTheDocument();
    });

    it("shows webhook secret not configured indicator when secret is empty", async () => {
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText(/No webhook secret set/)).toBeInTheDocument();
    });

    it("generates a new webhook secret when Generate button is clicked", async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const generateButton = screen.getByText("Generate");
      expect(generateButton).toBeInTheDocument();
      await user.click(generateButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          title: "Secret generated and copied",
          variant: "success",
        });
      });
    });
  });

  describe("Save functionality", () => {
    it("triggers api.updateSettings with correct data when save button is clicked", async () => {
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const saveButton = screen.getByText("Save Settings");
      await user.click(saveButton);

      await waitFor(() => {
        expect(api.updateSettings).toHaveBeenCalledWith({
          githubToken: "ghp_test",
          server: {
            port: 3000,
            host: "0.0.0.0",
            webhookSecret: "",
          },
          review: {
            maxComments: 50,
            defaultSeverity: "suggestion",
            autoApproveBelow: false,
            reviewDelaySeconds: 0,
            quietHours: undefined,
          },
          llm: {
            provider: "anthropic",
            apiKey: undefined,
            defaultModel: undefined,
            baseUrl: undefined,
          },
        });
      });
    });

    it("shows success toast when settings are saved successfully", async () => {
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const saveButton = screen.getByText("Save Settings");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          title: "Settings saved",
          variant: "success",
        });
      });
    });

    it("shows error toast when settings save fails", async () => {
      (api.updateSettings as any).mockRejectedValue(new Error("Save failed"));
      const user = userEvent.setup();

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const saveButton = screen.getByText("Save Settings");
      await user.click(saveButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          title: "Failed to save settings. Is the server running?",
          variant: "error",
        });
      });
    });

    it("disables save button while saving", async () => {
      const user = userEvent.setup();
      let resolveSave: (value: unknown) => void;

      (api.updateSettings as any).mockImplementation(() => new Promise((resolve) => {
        resolveSave = resolve;
      }));

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const saveButton = screen.getByText("Save Settings");
      await user.click(saveButton);

      await waitFor(() => {
        expect(saveButton).toBeDisabled();
      });

      resolveSave!(undefined);

      await waitFor(() => {
        expect(saveButton).not.toBeDisabled();
      });
    });
  });

  describe("Custom rules section", () => {
    it("shows custom rules section when repos are available", async () => {
      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      expect(screen.getByText("Custom Rules")).toBeInTheDocument();
      expect(screen.getByText("Select Repository")).toBeInTheDocument();
    });

    it("shows repository selector with repos", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: {
          data: [
            { id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" },
            { id: "other/project", owner: "other", repo: "project", autoReview: false, triggerMode: "manual" },
          ],
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      expect(select).toBeInTheDocument();

      await user.click(select);

      await waitFor(() => {
        expect(screen.getByText("owner/repo")).toBeInTheDocument();
        expect(screen.getByText("other/project")).toBeInTheDocument();
      });
    });

    it("loads rules when a repository is selected", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      (api.getRepoRules as any).mockResolvedValue([
        { id: "rule-1", name: "No console.log", pattern: "console\\.log", severity: "warning", enabled: true },
      ]);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(api.getRepoRules).toHaveBeenCalledWith("owner/repo");
      });
    });

    it("displays custom rules after loading", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      (api.getRepoRules as any).mockResolvedValue([
        { id: "rule-1", name: "No console.log", pattern: "console\\.log", severity: "warning", enabled: true },
      ]);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(screen.getByText("Rules (1)")).toBeInTheDocument();
        expect(screen.getByText("No console.log")).toBeInTheDocument();
      });
    });

    it("shows 'No custom rules configured' message when rules array is empty", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(screen.getByText("No custom rules configured")).toBeInTheDocument();
      });
    });

    it("shows loading state when rules are loading", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      (api.getRepoRules as any).mockImplementation(() => new Promise(() => {}));

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(screen.getByText("Loading rules...")).toBeInTheDocument();
      });
    });
  });

  describe("Add rule functionality", () => {
    it("shows add rule form when add rule button is clicked", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(screen.getByText("Rules (0)")).toBeInTheDocument();
      });

      const addButton = screen.getByText("Add Rule");
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText("Add New Rule")).toBeInTheDocument();
      });
    });

    it("calls api.addRepoRule when rule form is submitted", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      const addButton = screen.getByText("Add Rule");
      await user.click(addButton);

      // Wait for the form to appear
      await waitFor(() => {
        expect(screen.getByText("Add New Rule")).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText("Rule name (e.g., 'No console.log')");
      const patternInput = screen.getByPlaceholderText("Pattern (regex or string)");

      await user.type(nameInput, "Test Rule");
      await user.type(patternInput, "test-pattern");

      // Get all "Add Rule" buttons - the second one is the submit button in the form
      const submitButtons = screen.getAllByText("Add Rule");
      expect(submitButtons).toHaveLength(2);

      const submitButton = submitButtons[1];
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.addRepoRule).toHaveBeenCalledWith("owner/repo", {
          name: "Test Rule",
          pattern: "test-pattern",
          severity: "suggestion",
          enabled: true,
          category: undefined,
        });
      });
    });
  });

  describe("Delete rule functionality", () => {
    it("calls api.deleteRepoRule when delete button is clicked and confirmed", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      (api.getRepoRules as any).mockResolvedValue([
        { id: "rule-1", name: "Test Rule", pattern: "test", severity: "warning", enabled: true },
      ]);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(screen.getByText("Test Rule")).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByText("Delete");
      await user.click(deleteButtons[0]);

      const confirmButton = await screen.findByRole("button", { name: "Delete" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(api.deleteRepoRule).toHaveBeenCalledWith("owner/repo", "rule-1");
      });
    });
  });

  describe("Error handling", () => {
    it("shows error toast when settings fail to load", async () => {
      (api.getSettings as any).mockRejectedValue(new Error("Load failed"));

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          title: "Failed to load settings",
          variant: "error",
        });
      });
    });

    it("shows error toast when rules fail to load", async () => {
      const user = userEvent.setup();

      (useRepos as any).mockReturnValue({
        data: { data: [{ id: "owner/repo", owner: "owner", repo: "repo", autoReview: true, triggerMode: "auto" }], page: 1, limit: 20, total: 1, totalPages: 1 },
        loading: false,
        error: null,
        refetch: mockRefetch,
      });

      (api.getRepoRules as any).mockRejectedValue(new Error("Rules load failed"));

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.queryByText("Loading settings...")).not.toBeInTheDocument();
      });

      const select = screen.getByDisplayValue("Select a repository...");
      await user.selectOptions(select, "owner/repo");

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith({
          title: "Failed to load custom rules",
          variant: "error",
        });
      });
    });
  });
});
