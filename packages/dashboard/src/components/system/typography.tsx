import type { ComponentProps, CSSProperties, ReactElement } from "react";
import { cloneElement, isValidElement } from "react";
import { cn } from "~/lib/utils";

export type TypographyType =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "caption"
  | "custom";

export type TypographySize =
  | "x-large"
  | "large"
  | "medium"
  | "small"
  | "x-small"
  | number;

export type TypographyWeight =
  | "thin"
  | "extralight"
  | "light"
  | "regular"
  | "normal"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold"
  | "black";

export type TypographyLineHeight =
  | "none"
  | "tight"
  | "snug"
  | "normal"
  | "relaxed"
  | "loose";

const FONT_WEIGHT: Record<TypographyWeight, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

const LINE_HEIGHT: Record<TypographyLineHeight, number> = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

const TYPE_SIZE: Record<
  Exclude<TypographyType, "custom">,
  Record<Exclude<TypographySize, number>, number>
> = {
  display: { "x-small": 32, small: 36, medium: 44, large: 60, "x-large": 60 },
  title: { "x-small": 18, small: 20, medium: 24, large: 28, "x-large": 32 },
  heading: { "x-small": 14, small: 15, medium: 16, large: 18, "x-large": 20 },
  body: { "x-small": 12, small: 13, medium: 14, large: 15, "x-large": 16 },
  caption: { "x-small": 10, small: 11, medium: 12, large: 13, "x-large": 14 },
};

export interface TypographyProps extends Omit<ComponentProps<"span">, "color"> {
  type?: TypographyType;
  size?: TypographySize;
  weight?: TypographyWeight;
  lineHeight?: TypographyLineHeight | number;
  color?: string;
  truncate?: boolean;
  render?: ReactElement;
}

function resolveSize(
  type: TypographyType,
  size: TypographySize | undefined,
): number | undefined {
  if (typeof size === "number") return size;
  if (type === "custom") return undefined;
  const map = TYPE_SIZE[type];
  return map[size ?? "medium"];
}

export function Typography({
  type = "body",
  size,
  weight = "regular",
  lineHeight = "normal",
  color,
  truncate,
  render,
  className,
  style,
  children,
  ...props
}: TypographyProps) {
  const resolvedSize = resolveSize(type, size);
  const resolvedLineHeight =
    typeof lineHeight === "number" ? lineHeight : LINE_HEIGHT[lineHeight];

  const mergedStyle: CSSProperties = {
    ...(resolvedSize !== undefined ? { fontSize: `${resolvedSize}px` } : {}),
    fontWeight: FONT_WEIGHT[weight],
    lineHeight: resolvedLineHeight,
    ...(color ? { color } : {}),
    ...style,
  };

  const baseClass = cn(
    truncate && "overflow-hidden text-ellipsis whitespace-nowrap",
    className,
  );

  if (render && isValidElement(render)) {
    const renderProps = (render.props ?? {}) as {
      className?: string;
      style?: CSSProperties;
      children?: React.ReactNode;
    };
    return cloneElement(render, {
      ...renderProps,
      className: cn(baseClass, renderProps.className),
      style: { ...mergedStyle, ...(renderProps.style ?? {}) },
      children: renderProps.children ?? children,
    } as Record<string, unknown>);
  }

  return (
    <span className={baseClass} style={mergedStyle} {...props}>
      {children}
    </span>
  );
}

export interface HeadingProps extends Omit<TypographyProps, "type"> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export function Heading({
  level = 2,
  size = "medium",
  weight = "bold",
  render,
  ...props
}: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Typography
      render={render ?? <Tag />}
      size={size}
      type="heading"
      weight={weight}
      {...props}
    />
  );
}

export function Text(props: Omit<TypographyProps, "type">) {
  return <Typography type="body" {...props} />;
}
