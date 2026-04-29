import { Progress as ProgressBase } from "@base-ui/react/progress";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./progress.module.css";

export type ProgressSize = "small" | "medium" | "large";
export type ProgressVariant = "primary" | "success" | "error" | "warning" | "info";

const SIZE_CLASS: Record<ProgressSize, string> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};

const VARIANT_CLASS: Record<ProgressVariant, string> = {
  primary: styles.variantPrimary,
  success: styles.variantSuccess,
  error: styles.variantError,
  warning: styles.variantWarning,
  info: styles.variantInfo,
};

export interface ProgressProps extends ComponentProps<typeof ProgressBase.Root> {
  size?: ProgressSize;
  variant?: ProgressVariant;
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, size = "medium", variant = "primary", value, max, ...props },
  ref,
) {
  return (
    <ProgressBase.Root
      className={cn(
        styles.progress,
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        className,
      )}
      max={max}
      ref={ref}
      value={value}
      {...props}
    >
      <ProgressBase.Track className={styles.track}>
        <ProgressBase.Indicator className={styles.indicator} />
      </ProgressBase.Track>
    </ProgressBase.Root>
  );
});
