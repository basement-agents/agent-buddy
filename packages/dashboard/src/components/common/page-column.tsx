import { type ReactNode } from "react";
import { cn } from "~/lib/utils";

interface PageColumnProps {
  /** "feed" = max-width 640px (default). "wide" = max-width 960px. */
  variant?: "feed" | "wide";
  children: ReactNode;
  className?: string;
}

/**
 * PageColumn — centered content column used by every route.
 *
 * feed (default): 640px max-width, 24px mobile / 40px desktop side padding.
 * wide: 960px max-width, same paddings.
 * Vertical padding: 32px top and bottom.
 */
export function PageColumn({
  variant = "feed",
  children,
  className,
}: PageColumnProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full py-8",
        "px-[var(--ds-spacing-10)] sm:px-[var(--ds-spacing-12)]",
        variant === "feed" ? "max-w-[640px]" : "max-w-[960px]",
        className
      )}
    >
      {children}
    </div>
  );
}
