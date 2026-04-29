import { forwardRef, type AnchorHTMLAttributes } from "react";
import { cn } from "~/lib/utils";
import styles from "./link.module.css";

export type LinkVariant = "inline" | "standalone";

const VARIANT_CLASS: Record<LinkVariant, string> = {
  inline: styles.variantInline,
  standalone: styles.variantStandalone,
};

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: LinkVariant;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { className, variant = "inline", ...props },
  ref,
) {
  return (
    <a
      className={cn(styles.link, VARIANT_CLASS[variant], className)}
      ref={ref}
      {...props}
    />
  );
});
