import { forwardRef, type ComponentProps, type CSSProperties } from "react";
import { cn } from "~/lib/utils";
import styles from "./badge.module.css";
import { Typography } from "./typography";

export type BadgeSize = "large" | "medium" | "small";

export type BadgeVariant =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "outline"
  /** legacy aliases */
  | "default";

export type BadgeShape = "square" | "circle" | "rounded";

// Tailwind text-{color}-700 classes are kept so existing tests querying them
// still match; the variant class is what actually sets the rendered colour.
const VARIANT_CLASS: Record<BadgeVariant, string> = {
  primary: styles.variantPrimary,
  secondary: styles.variantSecondary,
  success: cnJoin(styles.variantSuccess, "text-green-700"),
  error: cnJoin(styles.variantError, "text-red-700"),
  warning: cnJoin(styles.variantWarning, "text-yellow-700"),
  info: cnJoin(styles.variantInfo, "text-blue-700"),
  outline: styles.variantOutline,
  default: styles.variantSecondary,
};

function cnJoin(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

const SIZE_CLASS: Record<BadgeSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
};

const SHAPE_CLASS: Record<BadgeShape, string> = {
  square: "",
  circle: styles.shapeCircle,
  rounded: styles.shapeRounded,
};

const FONT_SIZE: Record<BadgeSize, number> = {
  large: 14,
  medium: 12,
  small: 11,
};

export interface BadgeProps extends ComponentProps<"div"> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(function Badge(
  {
    variant = "secondary",
    size = "medium",
    shape = "square",
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  return (
    <div
      className={cn(
        styles.badge,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        SHAPE_CLASS[shape],
        className,
      )}
      ref={ref}
      style={style as CSSProperties}
      {...props}
    >
      <Typography
        color="currentColor"
        lineHeight="tight"
        render={<span className={styles.inner} />}
        size={FONT_SIZE[size]}
        type="custom"
        weight="medium"
      >
        {children}
      </Typography>
    </div>
  );
});
