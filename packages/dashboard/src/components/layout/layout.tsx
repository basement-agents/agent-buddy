import { useState, useEffect, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/system/button";
import { useTheme } from "~/lib/use-theme";
import { StatusBar } from "./status-bar";
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
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const ICON_PROPS = { size: 16, strokeWidth: 1.75 } as const;

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

interface NavLinkProps {
  item: NavItem;
  currentPath: string;
  onNavigate: () => void;
}

function NavLink({ item, currentPath, onNavigate }: NavLinkProps) {
  const active = isActive(currentPath, item.href);
  return (
    <a
      href={item.href}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, "", item.href);
        window.dispatchEvent(new PopStateEvent("app:navigate"));
        onNavigate();
      }}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] text-[var(--ds-color-text-primary)] transition-colors",
        active
          ? "bg-[var(--ds-color-surface-card)] shadow-[var(--ds-shadow-active)]"
          : "hover:bg-[var(--ds-color-surface-card)]/60"
      )}
    >
      <span className="text-[var(--ds-color-text-secondary)]">{item.icon}</span>
      <span>{item.label}</span>
    </a>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  return (
    <div className="flex h-screen flex-col bg-[var(--ds-color-surface-app)] text-[var(--ds-color-text-primary)]">
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Primary"
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-[208px] shrink-0 flex-col bg-[var(--ds-color-surface-app)] px-3 py-4 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="mb-6 flex h-4 items-center px-2">
            <span className="text-[13px] font-semibold leading-none tracking-tight text-[var(--ds-color-text-primary)]">
              Agent Buddy
            </span>
          </div>

          <nav aria-label="Main navigation" className="flex flex-col gap-1">
            {primaryNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                currentPath={currentPath}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          <nav
            aria-label="Footer navigation"
            className="mt-auto flex flex-col gap-1 pt-6"
          >
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[13px] text-[var(--ds-color-text-primary)] transition-colors hover:bg-[var(--ds-color-surface-card)]/60"
            >
              <span className="text-[var(--ds-color-text-secondary)]">
                {resolvedTheme === "dark" ? (
                  <Sun {...ICON_PROPS} />
                ) : (
                  <Moon {...ICON_PROPS} />
                )}
              </span>
              <span>Theme</span>
            </button>
            {footerNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                currentPath={currentPath}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <div className="fixed left-3 top-3 z-20 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <section className="mt-4 mr-3 mb-4 ml-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--ds-color-border-secondary)] bg-[var(--ds-color-surface-card)] shadow-[var(--ds-shadow-card)] lg:ml-0">
          <main className="p-4 sm:p-6">{children}</main>
        </section>
      </div>
      <StatusBar />
    </div>
  );
}
