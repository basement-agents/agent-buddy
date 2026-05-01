import { useState, useEffect, useCallback, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/system/button";
import { useTheme } from "~/lib/use-theme";
import {
  Home,
  Folder,
  Users,
  ClipboardList,
  RefreshCw,
  Settings,
  Sun,
  Moon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const ICON_PROPS = { size: 20, strokeWidth: 1.75 } as const;

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <Home {...ICON_PROPS} /> },
  { label: "Repos", href: "/repos", icon: <Folder {...ICON_PROPS} /> },
  { label: "Buddies", href: "/buddies", icon: <Users {...ICON_PROPS} /> },
  { label: "Reviews", href: "/reviews", icon: <ClipboardList {...ICON_PROPS} /> },
  { label: "Jobs", href: "/jobs", icon: <RefreshCw {...ICON_PROPS} /> },
];

const footerNav: NavItem[] = [
  { label: "Settings", href: "/settings", icon: <Settings {...ICON_PROPS} /> },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(href + "/");
}

/* ------------------------------------------------------------------ */
/*  Geometry                                                           */
/* ------------------------------------------------------------------ */

/** Icon-only (collapsed) width — fits a 40×40 hit area centered in a 76px rail. */
const SIDEBAR_ICON_ONLY = 76;
/** Expanded width when labels are visible. */
const SIDEBAR_EXPANDED = 240;
const STORAGE_KEY_ICON_ONLY = "agent-buddy:sidebar:icon-only";

/**
 * Both nav links and the logo share the same icon column geometry so glyphs
 * never shift horizontally when the sidebar collapses or expands:
 *
 *   - Sidebar mx-3 (12px outer gap)
 *   - Row pl-4 (16px inner gap)
 *   - Icon center sits at 12 + 16 + 10 = 38px from sidebar edge — exactly the
 *     center of the 76px collapsed rail. The 240px expanded rail keeps the
 *     same geometry, only adding label space to the right.
 */

function readStoredIconOnly(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY_ICON_ONLY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return true;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/*  NavLink                                                            */
/* ------------------------------------------------------------------ */

interface NavLinkProps {
  item: NavItem;
  currentPath: string;
  /** When true the sidebar shows icons only (no labels). */
  iconOnly: boolean;
  onNavigate: () => void;
}

function NavLink({ item, currentPath, iconOnly, onNavigate }: NavLinkProps) {
  const active = isActive(currentPath, item.href);
  return (
    <a
      href={item.href}
      title={iconOnly ? item.label : undefined}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, "", item.href);
        window.dispatchEvent(new PopStateEvent("app:navigate"));
        onNavigate();
      }}
      className={cn(
        "group relative mx-3 flex h-10 items-center rounded-[var(--ds-radius-3)] pl-4 pr-3 text-[13px] transition-colors duration-150",
        iconOnly ? "gap-0" : "gap-3",
        active
          ? "bg-[var(--ds-color-neutral-100)] dark:bg-[var(--ds-color-neutral-800)] text-[var(--ds-color-text-primary)]"
          : "text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-secondary)] hover:text-[var(--ds-color-text-primary)]"
      )}
    >
      <span
        className={cn(
          "shrink-0 transition-colors duration-150",
          active ? "text-[var(--ds-color-text-primary)]" : "text-[var(--ds-color-text-secondary)]"
        )}
      >
        {item.icon}
      </span>
      <span
        className={cn(
          "truncate transition-opacity duration-150",
          iconOnly ? "pointer-events-none w-0 opacity-0" : "min-w-0 flex-1 opacity-100"
        )}
      >
        {item.label}
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer button — same geometry as NavLink, used by theme + collapse */
/* ------------------------------------------------------------------ */

interface SidebarButtonProps {
  onClick: () => void;
  ariaLabel: string;
  title?: string;
  iconOnly: boolean;
  icon: ReactNode;
  label: string;
}

function SidebarButton({ onClick, ariaLabel, title, iconOnly, icon, label }: SidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "group relative mx-3 flex h-10 items-center rounded-[var(--ds-radius-3)] pl-4 pr-3 text-[13px] text-[var(--ds-color-text-secondary)] transition-colors duration-150 hover:bg-[var(--ds-color-surface-secondary)] hover:text-[var(--ds-color-text-primary)]",
        iconOnly ? "gap-0" : "gap-3"
      )}
    >
      <span className="shrink-0 text-[var(--ds-color-text-secondary)]">{icon}</span>
      <span
        className={cn(
          "truncate transition-opacity duration-150",
          iconOnly ? "pointer-events-none w-0 opacity-0" : "min-w-0 flex-1 opacity-100"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * Default is icon-only (true) — Threads-style thin rail.
   * Persisted to localStorage so the user's preference survives reload.
   */
  const [iconOnly, setIconOnly] = useState<boolean>(() => readStoredIconOnly());
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const handler = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    window.addEventListener("app:navigate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("app:navigate", handler);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY_ICON_ONLY, iconOnly ? "true" : "false");
    } catch {
      // localStorage unavailable (private mode, quota) — ignore
    }
  }, [iconOnly]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const sidebarWidth = iconOnly ? SIDEBAR_ICON_ONLY : SIDEBAR_EXPANDED;

  return (
    <div className="flex h-screen bg-[var(--ds-color-surface-app)] text-[var(--ds-color-text-primary)]">
      {/* ---- Desktop sidebar ---- */}
      <aside
        aria-label="Primary"
        style={{ width: sidebarWidth }}
        className="hidden lg:flex shrink-0 flex-col overflow-hidden bg-[var(--ds-color-surface-app)] py-4 transition-[width] duration-200 ease-out"
      >
        {/* Logo area — bot center aligns with the nav icon column at 38px */}
        <div className="mx-3 mb-6 flex h-8 items-center gap-2 pl-3 pr-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-3)] bg-[var(--ds-color-brand-primary)] text-white">
            <Bot size={16} strokeWidth={2} />
          </span>
          <span
            className={cn(
              "truncate text-[13px] font-semibold leading-none tracking-tight text-[var(--ds-color-text-primary)] transition-opacity duration-150",
              iconOnly ? "pointer-events-none w-0 opacity-0" : "min-w-0 flex-1 opacity-100"
            )}
          >
            Agent Buddy
          </span>
        </div>

        {/* Primary nav */}
        <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              currentPath={currentPath}
              iconOnly={iconOnly}
              onNavigate={closeMobile}
            />
          ))}
        </nav>

        {/* Footer nav */}
        <nav
          aria-label="Footer navigation"
          className="mt-auto flex flex-col gap-0.5 border-t border-[var(--ds-color-border-secondary)] pt-4"
        >
          <SidebarButton
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            ariaLabel="Toggle theme"
            title={iconOnly ? "Toggle theme" : undefined}
            iconOnly={iconOnly}
            icon={resolvedTheme === "dark" ? <Sun {...ICON_PROPS} /> : <Moon {...ICON_PROPS} />}
            label="Theme"
          />
          {footerNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              currentPath={currentPath}
              iconOnly={iconOnly}
              onNavigate={closeMobile}
            />
          ))}
          <SidebarButton
            onClick={() => setIconOnly((v) => !v)}
            ariaLabel={iconOnly ? "Expand sidebar" : "Collapse sidebar"}
            title={iconOnly ? "Expand sidebar" : undefined}
            iconOnly={iconOnly}
            icon={iconOnly ? <PanelLeftOpen {...ICON_PROPS} /> : <PanelLeftClose {...ICON_PROPS} />}
            label="Collapse"
          />
        </nav>
      </aside>

      {/* ---- Mobile overlay ---- */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* ---- Mobile sidebar drawer ---- */}
      <aside
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col bg-[var(--ds-color-surface-app)] px-3 py-4 transition-transform duration-300 ease-out lg:hidden",
          "rounded-r-[var(--ds-radius-5)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo area (mobile) */}
        <div className="mb-6 flex h-8 items-center gap-2 px-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-3)] bg-[var(--ds-color-brand-primary)] text-white">
            <Bot size={16} strokeWidth={2} />
          </span>
          <span className="text-[13px] font-semibold leading-none tracking-tight text-[var(--ds-color-text-primary)]">
            Agent Buddy
          </span>
        </div>

        <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              currentPath={currentPath}
              iconOnly={false}
              onNavigate={closeMobile}
            />
          ))}
        </nav>

        <nav
          aria-label="Footer navigation"
          className="mt-auto flex flex-col gap-0.5 border-t border-[var(--ds-color-border-secondary)] pt-4"
        >
          <SidebarButton
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            ariaLabel="Toggle theme"
            iconOnly={false}
            icon={resolvedTheme === "dark" ? <Sun {...ICON_PROPS} /> : <Moon {...ICON_PROPS} />}
            label="Theme"
          />
          {footerNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              currentPath={currentPath}
              iconOnly={false}
              onNavigate={closeMobile}
            />
          ))}
        </nav>
      </aside>

      {/* Mobile hamburger */}
      <div className="fixed left-3 top-3 z-20 lg:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* ---- Content area ---- */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[var(--ds-color-surface-app)]">
        {children}
      </main>
    </div>
  );
}
