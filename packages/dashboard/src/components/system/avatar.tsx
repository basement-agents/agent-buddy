import { Avatar as AvatarBase } from "@base-ui/react/avatar";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./avatar.module.css";

export type AvatarSize = "x-small" | "small" | "medium" | "large" | "x-large";
export type AvatarShape = "circle" | "square";

const SIZE_CLASS: Record<AvatarSize, string> = {
  "x-small": styles.sizeXSmall,
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
  "x-large": styles.sizeXLarge,
};

const SHAPE_CLASS: Record<AvatarShape, string> = {
  circle: styles.shapeCircle,
  square: styles.shapeSquare,
};

export interface AvatarProps extends ComponentProps<typeof AvatarBase.Root> {
  size?: AvatarSize;
  shape?: AvatarShape;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { className, size = "medium", shape = "circle", ...props },
  ref,
) {
  return (
    <AvatarBase.Root
      className={cn(styles.avatar, SIZE_CLASS[size], SHAPE_CLASS[shape], className)}
      ref={ref}
      {...props}
    />
  );
});

export const AvatarImage = forwardRef<
  HTMLImageElement,
  ComponentProps<typeof AvatarBase.Image>
>(function AvatarImage({ className, ...props }, ref) {
  return (
    <AvatarBase.Image
      className={cn(styles.image, className)}
      ref={ref}
      {...props}
    />
  );
});

export const AvatarFallback = forwardRef<
  HTMLSpanElement,
  ComponentProps<typeof AvatarBase.Fallback>
>(function AvatarFallback({ className, ...props }, ref) {
  return (
    <AvatarBase.Fallback
      className={cn(styles.fallback, className)}
      ref={ref}
      {...props}
    />
  );
});
