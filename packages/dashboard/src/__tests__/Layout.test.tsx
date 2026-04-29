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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "healthy" }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders sidebar branding", () => {
    render(<Layout>Test Content</Layout>);

    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(within(aside!).getByText("Agent Buddy")).toBeInTheDocument();
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

  it("renders primary navigation items", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Repos")).toBeInTheDocument();
    expect(screen.getByText("Buddies")).toBeInTheDocument();
    expect(screen.getByText("Reviews")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("renders Settings in footer navigation, not primary", () => {
    render(<Layout>Test</Layout>);

    const primaryNav = screen.getByRole("navigation", { name: "Main navigation" });
    const footerNav = screen.getByRole("navigation", { name: "Footer navigation" });

    expect(within(primaryNav).queryByText("Settings")).not.toBeInTheDocument();
    expect(within(footerNav).getByText("Settings")).toBeInTheDocument();
  });

  it("renders Theme toggle in footer navigation", () => {
    render(<Layout>Test</Layout>);

    const footerNav = screen.getByRole("navigation", { name: "Footer navigation" });
    expect(within(footerNav).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
    expect(within(footerNav).getByText("Theme")).toBeInTheDocument();
  });

  it("navigation links have correct hrefs", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByText("Dashboard").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("Repos").closest("a")).toHaveAttribute("href", "/repos");
    expect(screen.getByText("Buddies").closest("a")).toHaveAttribute("href", "/buddies");
    expect(screen.getByText("Reviews").closest("a")).toHaveAttribute("href", "/reviews");
    expect(screen.getByText("Jobs").closest("a")).toHaveAttribute("href", "/jobs");
    expect(screen.getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("highlights active navigation item", () => {
    window.location.pathname = "/repos";

    render(<Layout>Test</Layout>);

    const reposLink = screen.getByText("Repos").closest("a");
    expect(reposLink?.className).toMatch(/bg-\[var\(--ds-color-surface-card\)\]/);
    expect(reposLink?.className).toMatch(/shadow-/);
  });

  it("highlights nested routes under parent item", () => {
    window.location.pathname = "/repos/owner/repo";

    render(<Layout>Test</Layout>);

    const reposLink = screen.getByText("Repos").closest("a");
    expect(reposLink?.className).toMatch(/bg-\[var\(--ds-color-surface-card\)\]/);
    expect(reposLink?.className).toMatch(/shadow-/);
  });

  it("renders mobile menu trigger button", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  it("opens sidebar drawer when mobile menu button clicked", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));

    const overlay = document.querySelector(".fixed.inset-0.z-30.bg-black\\/50.lg\\:hidden");
    expect(overlay).toBeInTheDocument();
  });

  it("closes sidebar when overlay is clicked", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));
    const overlay = document.querySelector(".fixed.inset-0.z-30.bg-black\\/50.lg\\:hidden");
    if (overlay) await user.click(overlay);

    const sidebar = document.querySelector("aside");
    expect(sidebar?.className).toMatch(/-translate-x-full/);
  });

  it("closes sidebar after navigating on mobile", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));
    await user.click(screen.getByText("Repos"));

    const sidebar = document.querySelector("aside");
    expect(sidebar?.className).toMatch(/-translate-x-full/);
  });

  it("has no <header> element", () => {
    render(<Layout>Test</Layout>);
    expect(document.querySelector("header")).not.toBeInTheDocument();
  });

  it("wraps content in elevated card section", () => {
    render(<Layout>Test</Layout>);

    const section = document.querySelector("section");
    expect(section).toBeInTheDocument();
    expect(section?.className).toMatch(/rounded-xl/);
    expect(section?.className).toMatch(/border/);
  });

  it("renders status footer with connection role", () => {
    render(<Layout>Test</Layout>);

    const status = screen.getByRole("status", { name: "Connection status" });
    expect(status).toBeInTheDocument();
    expect(status.tagName.toLowerCase()).toBe("footer");
  });

  it("has accessible navigation structure", () => {
    render(<Layout>Test</Layout>);

    const navLinks = screen.getAllByRole("link");
    expect(navLinks.length).toBeGreaterThan(0);
    navLinks.forEach((link) => {
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
    });
  });

  it("renders without children", () => {
    const { container } = render(<Layout>{null}</Layout>);
    expect(container.querySelector("main")).toBeInTheDocument();
  });

  it("handles multiple children", () => {
    render(
      <Layout>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </Layout>
    );

    expect(screen.getByTestId("child-1")).toBeInTheDocument();
    expect(screen.getByTestId("child-2")).toBeInTheDocument();
  });

  it("has semantic landmarks (main, nav, aside, footer)", () => {
    render(<Layout>Test</Layout>);

    expect(document.querySelector("main")).toBeInTheDocument();
    expect(document.querySelector("aside")).toBeInTheDocument();
    expect(document.querySelectorAll("nav").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector("footer")).toBeInTheDocument();
  });
});
