// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Layout } from "../components/layout/layout";

describe("Layout", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { pathname: "/" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders header/navigation", () => {
    render(<Layout>Test Content</Layout>);

    expect(screen.getAllByText("Agent Buddy")).toHaveLength(2);
  });

  it("renders children in main content area", () => {
    render(
      <Layout>
        <div data-testid="test-content">Test Content</div>
      </Layout>
    );

    expect(screen.getByTestId("test-content")).toBeInTheDocument();
    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("renders all navigation items", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Repos")).toBeInTheDocument();
    expect(screen.getByText("Buddies")).toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("navigation links have correct hrefs", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("Repos").closest("a")).toHaveAttribute("href", "/repos");
    expect(screen.getByText("Buddies").closest("a")).toHaveAttribute("href", "/buddies");
    expect(screen.getByText("Reviews").closest("a")).toHaveAttribute("href", "/reviews");
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("highlights active navigation item", () => {
    window.location.pathname = "/repos";

    render(<Layout>Test</Layout>);

    const reposLink = screen.getByText("repos", { exact: false }).closest("a");
    expect(reposLink).toHaveClass("bg-zinc-100");
  });

  it("highlights nested routes under parent item", () => {
    window.location.pathname = "/repos/owner/repo";

    render(<Layout>Test</Layout>);

    const reposLink = screen.getByText("repos", { exact: false }).closest("a");
    expect(reposLink).toHaveClass("bg-zinc-100");
  });

  it("shows mobile menu button on small screens", () => {
    render(<Layout>Test</Layout>);

    // Mobile menu button should be present (hidden on lg, visible on smaller)
    const menuButtons = screen.getAllByLabelText("Open menu");
    expect(menuButtons.length).toBeGreaterThan(0);
  });

  it("toggles sidebar when mobile menu button is clicked", async () => {
    render(<Layout>Test</Layout>);

    const user = userEvent.setup({ delay: null });

    // Find menu button
    const menuButton = screen.getByLabelText("Open menu");
    expect(menuButton).toBeInTheDocument();

    // Click to open sidebar
    await user.click(menuButton);

    // Check if overlay appears
    const overlay = document.querySelector(".fixed.inset-0.z-30.bg-black\\/50.lg\\:hidden");
    expect(overlay).toBeInTheDocument();
  });

  it("closes sidebar when clicking overlay", async () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>
    );

    const user = userEvent.setup({ delay: null });

    // Open sidebar first
    const menuButton = screen.getByLabelText("Open menu");
    await user.click(menuButton);

    // Find and click overlay
    const overlay = document.querySelector(".fixed.inset-0.z-30.bg-black\\/50.lg\\:hidden");
    if (overlay) {
      await user.click(overlay);
    }

    // Sidebar should be closed (translate-x-full)
    const sidebar = document.querySelector("aside");
    expect(sidebar).toHaveClass("-translate-x-full");
  });

  it("renders search shortcut button", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByText("Search...")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
  });

  it("navigates to current route on navigation click", async () => {
    render(<Layout>Test</Layout>);

    const user = userEvent.setup({ delay: null });

    const reposLink = screen.getByText("Repos");
    await user.click(reposLink);

    expect(reposLink.closest("a")).toHaveAttribute("href", "/repos");
  });

  it("closes sidebar when navigation item is clicked on mobile", async () => {
    render(<Layout>Test</Layout>);

    const user = userEvent.setup({ delay: null });

    // Open sidebar
    const menuButton = screen.getByLabelText("Open menu");
    await user.click(menuButton);

    // Click a nav item
    const reposLink = screen.getByText("Repos");
    await user.click(reposLink);

    // Sidebar should close after clicking a link
    const sidebar = document.querySelector("aside");
    expect(sidebar).toHaveClass("-translate-x-full");
  });

  it("has proper semantic structure", () => {
    render(<Layout>Test</Layout>);

    // Check for header
    const header = document.querySelector("header");
    expect(header).toBeInTheDocument();

    // Check for main
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();

    // Check for nav
    const nav = document.querySelector("nav");
    expect(nav).toBeInTheDocument();

    // Check for aside (sidebar)
    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
  });

  it("displays agent buddy branding", () => {
    render(<Layout>Test</Layout>);

    // Desktop branding in sidebar
    const sidebar = within(document.querySelector("aside")!);
    expect(sidebar.getAllByText("Agent Buddy")).toHaveLength(1);

    // Mobile branding in header
    const header = within(document.querySelector("header")!);
    expect(header.getAllByText("Agent Buddy")).toHaveLength(1);
  });

  it("has accessible navigation structure", () => {
    render(<Layout>Test</Layout>);

    const navLinks = screen.getAllByRole("link");
    expect(navLinks.length).toBeGreaterThan(0);

    // Check that nav links have accessible names
    navLinks.forEach((link) => {
      expect(link.textContent).toBeTruthy();
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it("renders without children", () => {
    const { container } = render(<Layout>{null}</Layout>);

    const main = container.querySelector("main");
    expect(main).toBeInTheDocument();
  });

  it("handles multiple children", () => {
    render(
      <Layout>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
        <div data-testid="child-3">Child 3</div>
      </Layout>
    );

    expect(screen.getByTestId("child-1")).toBeInTheDocument();
    expect(screen.getByTestId("child-2")).toBeInTheDocument();
    expect(screen.getByTestId("child-3")).toBeInTheDocument();
  });

  it("renders SearchDialog component", () => {
    render(<Layout>Test</Layout>);

    // SearchDialog is rendered but not visible until triggered
    // We can check for the trigger button
    expect(screen.getByText("Search...")).toBeInTheDocument();
  });
});
