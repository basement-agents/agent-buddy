import { type CSSProperties } from "react";
import { cn } from "~/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  height?: string;
  circle?: boolean;
}

export function Skeleton({ className, style, height, circle }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-[var(--ds-color-surface-neutral)]",
        circle ? "rounded-full" : "rounded-md",
        height,
        className,
      )}
      style={style}
    />
  );
}

/** A row of skeleton lines for text content */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height="h-3.5"
          className={i === lines - 1 ? "w-3/4" : "w-full"}
        />
      ))}
    </div>
  );
}
