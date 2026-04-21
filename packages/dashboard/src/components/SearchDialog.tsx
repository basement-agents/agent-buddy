import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Search, Folder, User, FileText, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useNavigate } from "@/lib/hooks";

interface SearchResult {
  id: string;
  label: string;
  href: string;
  category: string;
  icon: typeof Folder;
}

const staticItems: SearchResult[] = [
  { id: "page-dashboard", label: "Dashboard", href: "/", category: "Pages", icon: Folder },
  { id: "page-repos", label: "Repositories", href: "/repos", category: "Pages", icon: Folder },
  { id: "page-buddies", label: "Buddies", href: "/buddies", category: "Pages", icon: User },
  { id: "page-reviews", label: "Reviews", href: "/reviews", category: "Pages", icon: FileText },
  { id: "page-settings", label: "Settings", href: "/settings", category: "Pages", icon: FileText },
];

export function SearchDialog() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>(staticItems);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen((prev) => !prev);
      setQuery("");
      setResults(staticItems);
      setSelectedIndex(0);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    // Reset to static items when query is empty
    if (!query.trim()) {
      setResults(staticItems);
      setSelectedIndex(0);
      setError(null);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const searchItems = async () => {
      setLoading(true);
      const dynamicResults: SearchResult[] = [];

      try {
        const data = await api.search(query, abortController.signal);

        for (const repo of data.repos) {
          dynamicResults.push({
            id: `repo-${repo.id}`,
            label: `${repo.owner}/${repo.repo}`,
            href: `/repos/${repo.owner}/${repo.repo}`,
            category: "Repositories",
            icon: Folder,
          });
        }

        for (const buddy of data.buddies) {
          dynamicResults.push({
            id: `buddy-${buddy.id}`,
            label: buddy.username,
            href: `/buddies/${buddy.id}`,
            category: "Buddies",
            icon: User,
          });
        }

        for (const review of data.reviews) {
          dynamicResults.push({
            id: `review-${review.owner}-${review.repo}-${review.prNumber}`,
            label: `${review.owner}/${review.repo} #${review.prNumber}`,
            href: `/reviews/${review.owner}-${review.repo}-${review.prNumber}`,
            category: "Reviews",
            icon: FileText,
          });
        }

        setResults(dynamicResults);
        setSelectedIndex(0);
        setError(null);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setError("Search failed. Retrying on next keystroke...");
        }
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchItems, 300);
    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [query]);

  const handleKeyDownInInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      navigate(results[selectedIndex].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }, [results, selectedIndex, navigate]);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setQuery("");
        setResults(staticItems);
        setSelectedIndex(0);
      }
      // Focus input when opening
      if (isOpen) {
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              ref={inputRef}
              autoFocus
              className="flex-1 border-0 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              placeholder="Search repos, buddies, reviews..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDownInInput}
            />
            {loading && <Loader className="h-4 w-4 animate-spin text-zinc-400" />}
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800">
              ESC
            </kbd>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 && !loading ? (
              <p className="px-3 py-6 text-center text-sm text-zinc-500">No results found</p>
            ) : error ? (
              <p className="px-3 py-6 text-center text-sm text-red-500 dark:text-red-400">{error}</p>
            ) : (
              results.map((item, index) => {
                const ItemIcon = item.icon;
                const isSelected = index === selectedIndex;
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(item.href);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                      isSelected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ItemIcon className="h-4 w-4 text-zinc-400" />
                      <span className="text-zinc-900 dark:text-white">{item.label}</span>
                    </div>
                    <span className="text-xs text-zinc-400">{item.category}</span>
                  </a>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
            <div className="flex gap-4">
              <span><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800">↵</kbd> select</span>
            </div>
            <span><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-800">esc</kbd> close</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
