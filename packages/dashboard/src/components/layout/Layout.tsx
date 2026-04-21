import { useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchDialog } from "@/components/SearchDialog";
import { useTheme } from "@/lib/useTheme";
import {
  Home,
  Folder,
  Users,
  ClipboardList,
  RefreshCw,
  Settings,
  Search,
  Sun,
  Moon,
  Menu,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <Home className="h-5 w-5" /> },
  { label: "Repos", href: "/repos", icon: <Folder className="h-5 w-5" /> },
  { label: "Buddies", href: "/buddies", icon: <Users className="h-5 w-5" /> },
  { label: "Reviews", href: "/reviews", icon: <ClipboardList className="h-5 w-5" /> },
  { label: "Jobs", href: "/jobs", icon: <RefreshCw className="h-5 w-5" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="h-5 w-5" /> },
];

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
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white transition-transform duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
          <span className="text-lg font-bold text-zinc-900 dark:text-white">Agent Buddy</span>
        </div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", item.href);
                window.dispatchEvent(new PopStateEvent("app:navigate"));
                setSidebarOpen(false);
              }}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                currentPath === item.href || currentPath.startsWith(item.href + "/")
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
              )}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-3 sm:px-4 lg:px-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="lg:hidden p-2" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white lg:hidden">Agent Buddy</span>
          </div>
          <button
            className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 lg:flex dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            onClick={() => {
              const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
              document.dispatchEvent(event);
            }}
          >
            <Search className="h-3.5 w-3.5" />
            Search...
            <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-900">Ctrl+K</kbd>
          </button>
          <button
            className="ml-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <SearchDialog />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
