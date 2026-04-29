import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./pagination.module.css";

export type PaginationSize = "small" | "medium" | "large";

const SIZE_CLASS: Record<PaginationSize, string> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};

const ICON_SIZE: Record<PaginationSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
};

export interface PaginationProps extends Omit<ComponentProps<"nav">, "onChange"> {
  page: number;
  totalPages: number;
  size?: PaginationSize;
  onPageChange: (page: number) => void;
  /** Number of sibling pages to show around the current page. */
  siblingCount?: number;
}

function getPageNumbers(
  current: number,
  total: number,
  siblingCount: number,
): (number | "...")[] {
  const totalPagesToShow = siblingCount * 2 + 5;
  if (total <= totalPagesToShow) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - siblingCount);
  const end = Math.min(total - 1, current + siblingCount);

  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  function Pagination(
    {
      page,
      totalPages,
      size = "medium",
      onPageChange,
      siblingCount = 1,
      className,
      ...props
    },
    ref,
  ) {
    if (totalPages <= 1) return null;

    const pages = getPageNumbers(page, totalPages, siblingCount);
    const iconSize = ICON_SIZE[size];

    return (
      <nav
        aria-label="Pagination"
        className={cn(styles.pagination, SIZE_CLASS[size], className)}
        ref={ref}
        {...props}
      >
        <button
          aria-label="Previous page"
          className={styles.button}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          type="button"
        >
          <IconChevronLeft size={iconSize} stroke={2} />
          Previous
        </button>
        {pages.map((p, index) =>
          p === "..." ? (
            <span className={styles.ellipsis} key={`ellipsis-${index}`}>
              ...
            </span>
          ) : (
            <button
              aria-current={p === page ? "page" : undefined}
              className={styles.button}
              data-active={p === page ? "" : undefined}
              key={p}
              onClick={() => onPageChange(p)}
              type="button"
            >
              {p}
            </button>
          ),
        )}
        <button
          aria-label="Next page"
          className={styles.button}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          type="button"
        >
          Next
          <IconChevronRight size={iconSize} stroke={2} />
        </button>
      </nav>
    );
  },
);
