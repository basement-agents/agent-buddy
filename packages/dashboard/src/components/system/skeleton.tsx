import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./skeleton.module.css";

export type SkeletonVariant = "text" | "circular" | "rectangular";
export type SkeletonAnimation = "pulse" | "wave" | "none";

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  text: styles.variantText,
  circular: styles.variantCircular,
  rectangular: styles.variantRectangular,
};

export interface SkeletonProps extends ComponentProps<"div"> {
  variant?: SkeletonVariant;
  animation?: SkeletonAnimation;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { className, variant = "rectangular", animation = "pulse", ...props },
  ref,
) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        styles.skeleton,
        VARIANT_CLASS[variant],
        animation === "pulse" && [styles.pulse, "animate-pulse"],
        animation === "wave" && styles.wave,
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

export function CardSkeleton() {
  return (
    <div className="rounded-[var(--ds-radius-5)] border border-[var(--ds-color-border-secondary)] bg-[var(--ds-color-surface-primary)] p-6">
      <Skeleton className="mb-4 h-5 w-1/3" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-2 h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-[var(--ds-radius-5)] border border-[var(--ds-color-border-secondary)]">
      <div className="border-b border-[var(--ds-color-border-secondary)] p-4">
        <Skeleton className="h-4 w-1/4" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          className="flex items-center gap-4 border-b border-[var(--ds-color-border-secondary)] p-4 last:border-0"
          key={i}
        >
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}
