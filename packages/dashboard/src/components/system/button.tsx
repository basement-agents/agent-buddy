import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./button.module.css";
import { Spinner, type SpinnerVariant } from "./spinner";

export type ButtonSize = "large" | "medium" | "small" | "x-small";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "success"
  | "error"
  | "warning"
  | "info"
  /** legacy aliases (existing callers) */
  | "default"
  | "destructive"
  | "link";

export type ButtonShape = "square" | "circle" | "rounded";

export type ButtonWeight =
  | "thin"
  | "extralight"
  | "light"
  | "regular"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold"
  | "black";

const FONT_WEIGHT_MAP: Record<ButtonWeight, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: styles.variantPrimary,
  secondary: styles.variantSecondary,
  outline: styles.variantOutline,
  ghost: styles.variantGhost,
  success: styles.variantSuccess,
  error: styles.variantError,
  warning: styles.variantWarning,
  info: styles.variantInfo,
  default: styles.variantPrimary,
  destructive: styles.variantError,
  link: styles.variantGhost,
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
  "x-small": styles.sizeXSmall,
};

const SHAPE_CLASS: Record<ButtonShape, string> = {
  square: styles.shapeSquare,
  circle: styles.shapeCircle,
  rounded: styles.shapeRounded,
};

/** Legacy size aliases used by existing callers (`sm`, `lg`, etc.). */
const LEGACY_SIZE: Record<string, ButtonSize> = {
  sm: "small",
  md: "medium",
  lg: "large",
  xs: "x-small",
  default: "medium",
  icon: "medium",
  "icon-sm": "small",
  "icon-xs": "x-small",
  "icon-lg": "large",
};

function normaliseSize(input: string | undefined): ButtonSize {
  if (!input) return "medium";
  if (input in LEGACY_SIZE) return LEGACY_SIZE[input];
  return input as ButtonSize;
}

function getSpinnerVariant(variant: ButtonVariant): SpinnerVariant {
  if (
    variant === "primary" ||
    variant === "default" ||
    variant === "success" ||
    variant === "error" ||
    variant === "destructive" ||
    variant === "info"
  ) {
    return "white";
  }
  return "secondary";
}

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "prefix"> {
  variant?: ButtonVariant;
  size?: ButtonSize | "sm" | "md" | "lg" | "xs" | "default" | "icon" | "icon-sm" | "icon-xs" | "icon-lg";
  shape?: ButtonShape;
  weight?: ButtonWeight;
  prefix?: ReactNode;
  suffix?: ReactNode;
  loading?: boolean;
  svgOnly?: boolean;
  spinnerVariant?: SpinnerVariant;
  /** Polymorphic render — when provided, the button is rendered as that element. */
  render?: ReactElement;
  /** shadcn-compat alias for `render` (renders children as a different element). */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size,
    shape = "square",
    weight = "medium",
    prefix,
    suffix,
    loading = false,
    svgOnly = false,
    spinnerVariant,
    render,
    asChild,
    disabled,
    className,
    style,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  const resolvedSize = normaliseSize(size as string | undefined);
  const isDisabled = disabled || loading;

  const mergedClassName = cn(
    styles.button,
    VARIANT_CLASS[variant],
    SIZE_CLASS[resolvedSize],
    SHAPE_CLASS[shape],
    svgOnly && styles.svgOnly,
    className,
  );

  const mergedStyle: CSSProperties = {
    "--ds-button-font-weight": FONT_WEIGHT_MAP[weight],
    ...style,
  } as CSSProperties;

  const content = (
    <>
      {loading && (
        <span className={styles.spinnerOverlay}>
          <Spinner
            size="medium"
            variant={spinnerVariant ?? getSpinnerVariant(variant)}
          />
        </span>
      )}
      <span className={cn(styles.buttonInner, loading && styles.invisible)}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <span className={styles.content}>{children}</span>
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
    </>
  );

  if (asChild && isValidElement(children)) {
    const childProps = (children.props ?? {}) as {
      className?: string;
      style?: CSSProperties;
    };
    return cloneElement(children, {
      ...childProps,
      ...props,
      className: cn(mergedClassName, childProps.className),
      style: { ...mergedStyle, ...(childProps.style ?? {}) },
      "aria-busy": loading || undefined,
      "aria-disabled": isDisabled || undefined,
    } as Record<string, unknown>);
  }

  if (render && isValidElement(render)) {
    const renderProps = (render.props ?? {}) as {
      className?: string;
      style?: CSSProperties;
    };
    return cloneElement(render, {
      ...renderProps,
      ...props,
      className: cn(mergedClassName, renderProps.className),
      style: { ...mergedStyle, ...(renderProps.style ?? {}) },
      "aria-busy": loading || undefined,
      "aria-disabled": isDisabled || undefined,
      children: content,
    } as Record<string, unknown>);
  }

  return (
    <button
      aria-busy={loading || undefined}
      className={mergedClassName}
      disabled={isDisabled}
      ref={ref}
      style={mergedStyle}
      type={type}
      {...props}
    >
      {content}
    </button>
  );
});
