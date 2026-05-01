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
    try {
      window.localStorage?.clear?.();
    } catch {
      // localStorage may not be available in some jsdom configs
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders sidebar branding", () => {
    render(<Layout>Test Content</Layout>);

    // Desktop sidebar is icon-only by default (Threads-style thin rail).
    // The logo icon is always visible; the "Agent Buddy" text label is only
    // shown in the mobile drawer (which always renders labels) or after the
    // user expands the sidebar. Assert the Bot icon container is present.
    const asides = document.querySelectorAll("aside");
    expect(asides.length).toBeGreaterThanOrEqual(1);
    // The mobile sidebar always renders the full text label
    const mobileSidebar = asides[1];
    expect(within(mobileSidebar!).getByText("Agent Buddy")).toBeInTheDocument();
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

    // Desktop sidebar is icon-only: labels are in title attributes, not visible text.
    // The mobile sidebar (always rendered, hidden via CSS) always shows full labels.
    const primaryNavs = screen.getAllByRole("navigation", { name: "Main navigation" });
    expect(primaryNavs.length).toBeGreaterThanOrEqual(1);
    // Use the mobile sidebar nav which always has visible text labels
    const mobilePrimaryNav = primaryNavs[primaryNavs.length - 1];

    expect(within(mobilePrimaryNav).getByText("Dashboard")).toBeInTheDocument();
    expect(within(mobilePrimaryNav).getByText("Repos")).toBeInTheDocument();
    expect(within(mobilePrimaryNav).getByText("Buddies")).toBeInTheDocument();
    expect(within(mobilePrimaryNav).getByText("Reviews")).toBeInTheDocument();
    expect(within(mobilePrimaryNav).getByText("Jobs")).toBeInTheDocument();
  });

  it("renders Settings in footer navigation, not primary", () => {
    render(<Layout>Test</Layout>);

    // Desktop sidebar is icon-only: "Settings" label is only visible in the
    // mobile footer nav. Check that all primary navs don't have "Settings" text,
    // and the mobile footer nav does.
    const primaryNavs = screen.getAllByRole("navigation", { name: "Main navigation" });
    primaryNavs.forEach((nav) => {
      expect(within(nav).queryByText("Settings")).not.toBeInTheDocument();
    });
    const footerNavs = screen.getAllByRole("navigation", { name: "Footer navigation" });
    // The mobile footer nav always renders full labels
    const mobileFooterNav = footerNavs[footerNavs.length - 1];
    expect(within(mobileFooterNav).getByText("Settings")).toBeInTheDocument();
  });

  it("renders Theme toggle in footer navigation", () => {
    render(<Layout>Test</Layout>);

    // The "Toggle theme" button is present in both desktop and mobile footer navs.
    // In icon-only desktop mode the "Theme" label is hidden; it's always visible in mobile.
    const footerNavs = screen.getAllByRole("navigation", { name: "Footer navigation" });
    const mobileFooterNav = footerNavs[footerNavs.length - 1];
    expect(within(mobileFooterNav).getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
    expect(within(mobileFooterNav).getByText("Theme")).toBeInTheDocument();
  });

  it("navigation links have correct hrefs", () => {
    render(<Layout>Test</Layout>);

    // Use mobile primary nav (always shows text labels) for text-based queries.
    const primaryNavs = screen.getAllByRole("navigation", { name: "Main navigation" });
    const mobilePrimaryNav = primaryNavs[primaryNavs.length - 1];
    expect(within(mobilePrimaryNav).getByText("Dashboard").closest("a")).toHaveAttribute("href", "/");
    expect(within(mobilePrimaryNav).getByText("Repos").closest("a")).toHaveAttribute("href", "/repos");
    expect(within(mobilePrimaryNav).getByText("Buddies").closest("a")).toHaveAttribute("href", "/buddies");
    expect(within(mobilePrimaryNav).getByText("Reviews").closest("a")).toHaveAttribute("href", "/reviews");
    expect(within(mobilePrimaryNav).getByText("Jobs").closest("a")).toHaveAttribute("href", "/jobs");

    const footerNavs = screen.getAllByRole("navigation", { name: "Footer navigation" });
    const mobileFooterNav = footerNavs[footerNavs.length - 1];
    expect(within(mobileFooterNav).getByText("Settings").closest("a")).toHaveAttribute("href", "/settings");
  });

  it("highlights active navigation item", () => {
    window.location.pathname = "/repos";

    render(<Layout>Test</Layout>);

    // Desktop nav uses title attribute in icon-only mode; links still have the active class.
    // Find the /repos link in the desktop primary nav by its title attribute.
    const primaryNavs = screen.getAllByRole("navigation", { name: "Main navigation" });
    const desktopPrimaryNav = primaryNavs[0];
    const reposLink = within(desktopPrimaryNav).getByTitle("Repos");
    expect(reposLink?.className).toMatch(/bg-\[var\(--ds-color-neutral-100\)\]/);
  });

  it("highlights nested routes under parent item", () => {
    window.location.pathname = "/repos/owner/repo";

    render(<Layout>Test</Layout>);

    const primaryNavs = screen.getAllByRole("navigation", { name: "Main navigation" });
    const desktopPrimaryNav = primaryNavs[0];
    const reposLink = within(desktopPrimaryNav).getByTitle("Repos");
    expect(reposLink?.className).toMatch(/bg-\[var\(--ds-color-neutral-100\)\]/);
  });

  it("renders mobile menu trigger button", () => {
    render(<Layout>Test</Layout>);

    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });

  it("opens sidebar drawer when mobile menu button clicked", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));

    const overlay = document.querySelector(".fixed.inset-0.z-30");
    expect(overlay).toBeInTheDocument();
  });

  it("closes sidebar when overlay is clicked", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));
    const overlay = document.querySelector(".fixed.inset-0.z-30");
    if (overlay) await user.click(overlay);

    const mobileSidebar = document.querySelectorAll("aside")[1];
    expect(mobileSidebar?.className).toMatch(/-translate-x-full/);
  });

  it("closes sidebar after navigating on mobile", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    await user.click(screen.getByLabelText("Open menu"));
    const mobileSidebar = document.querySelectorAll("aside")[1];
    await user.click(within(mobileSidebar).getByText("Repos"));

    expect(mobileSidebar?.className).toMatch(/-translate-x-full/);
  });

  /**
   * StatusBar is no longer rendered by Layout. It was removed in the
   * Threads-style redesign (Stream B) — status is an inline per-page
   * concern rather than a global fixed footer. Verify it is absent.
   */
  it("does not render a global status footer", () => {
    render(<Layout>Test</Layout>);

    expect(screen.queryByRole("status", { name: "Connection status" })).not.toBeInTheDocument();
    // Layout itself still produces a <main> semantic element
    expect(document.querySelector("main")).toBeInTheDocument();
  });

  it("has semantic landmarks (main, nav, aside)", () => {
    render(<Layout>Test</Layout>);

    expect(document.querySelector("main")).toBeInTheDocument();
    expect(document.querySelector("aside")).toBeInTheDocument();
    expect(document.querySelectorAll("nav").length).toBeGreaterThanOrEqual(2);
  });

  it("default sidebar is icon-only (76px wide)", () => {
    render(<Layout>Test</Layout>);

    const desktopAside = document.querySelector("aside");
    // Default iconOnly=true → width=76px
    expect(desktopAside).toHaveStyle({ width: "76px" });
  });

  it("expand toggle switches sidebar from icon-only to expanded", async () => {
    render(<Layout>Test</Layout>);
    const user = userEvent.setup({ delay: null });

    const desktopAside = document.querySelector("aside")!;
    expect(desktopAside).toHaveStyle({ width: "76px" });

    const toggleBtn = screen.getByLabelText("Expand sidebar");
    await user.click(toggleBtn);

    expect(desktopAside).toHaveStyle({ width: "240px" });
  });
});
