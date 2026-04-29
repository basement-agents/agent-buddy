import { IconChevronRight } from "@tabler/icons-react";
import {
  forwardRef,
  Fragment,
  type AnchorHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./breadcrumb.module.css";

export interface BreadcrumbItemData {
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbProps
  extends Omit<ComponentProps<"nav">, "children"> {
  /** Convenience prop — when provided, renders a flat list of items. */
  items?: BreadcrumbItemData[];
  separator?: ReactNode;
  children?: ReactNode;
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(
  function Breadcrumb({ className, items, separator, children, ...props }, ref) {
    const sep = separator ?? <IconChevronRight size={14} stroke={2} />;

    if (items) {
      return (
        <nav
          aria-label="Breadcrumb"
          className={cn(styles.breadcrumb, className)}
          ref={ref}
          {...props}
        >
          <ol className={styles.list}>
            {items.map((item, index) => {
              const isLast = index === items.length - 1;
              return (
                <Fragment key={`${index}-${typeof item.label === "string" ? item.label : ""}`}>
                  <li className={styles.item}>
                    {item.href && !isLast ? (
                      <a className={styles.link} href={item.href}>
                        {item.label}
                      </a>
                    ) : (
                      <span
                        aria-current={isLast ? "page" : undefined}
                        className={isLast ? styles.current : styles.link}
                      >
                        {item.label}
                      </span>
                    )}
                  </li>
                  {!isLast && (
                    <li aria-hidden="true" className={styles.separator}>
                      {sep}
                    </li>
                  )}
                </Fragment>
              );
            })}
          </ol>
        </nav>
      );
    }

    return (
      <nav
        aria-label="Breadcrumb"
        className={cn(styles.breadcrumb, className)}
        ref={ref}
        {...props}
      >
        {children}
      </nav>
    );
  },
);

export const BreadcrumbList = forwardRef<HTMLOListElement, ComponentProps<"ol">>(
  function BreadcrumbList({ className, ...props }, ref) {
    return <ol className={cn(styles.list, className)} ref={ref} {...props} />;
  },
);

export const BreadcrumbItem = forwardRef<HTMLLIElement, ComponentProps<"li">>(
  function BreadcrumbItem({ className, ...props }, ref) {
    return <li className={cn(styles.item, className)} ref={ref} {...props} />;
  },
);

export const BreadcrumbLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function BreadcrumbLink({ className, ...props }, ref) {
  return <a className={cn(styles.link, className)} ref={ref} {...props} />;
});

export const BreadcrumbCurrent = forwardRef<HTMLSpanElement, ComponentProps<"span">>(
  function BreadcrumbCurrent({ className, ...props }, ref) {
    return (
      <span
        aria-current="page"
        className={cn(styles.current, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

export function BreadcrumbSeparator({
  children,
  className,
  ...props
}: ComponentProps<"li">) {
  return (
    <li
      aria-hidden="true"
      className={cn(styles.separator, className)}
      {...props}
    >
      {children ?? <IconChevronRight size={14} stroke={2} />}
    </li>
  );
}
