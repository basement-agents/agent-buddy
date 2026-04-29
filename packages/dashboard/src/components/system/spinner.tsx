import type { ComponentProps, CSSProperties } from "react";
import { cn } from "~/lib/utils";
import styles from "./spinner.module.css";

export type SpinnerSize = "large" | "medium" | "small";
export type SpinnerVariant =
  | "primary"
  | "secondary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "white";

interface SpinnerGeometry {
  blades: number;
  bladeWidth: number;
  bladeHeight: number;
  bladeRadius: number;
  output: number;
}

const SIZE_GEOMETRY: Record<SpinnerSize, SpinnerGeometry> = {
  small: { blades: 8, bladeWidth: 1.5, bladeHeight: 4, bladeRadius: 1, output: 14 },
  medium: { blades: 8, bladeWidth: 2, bladeHeight: 5, bladeRadius: 1, output: 18 },
  large: { blades: 8, bladeWidth: 2.5, bladeHeight: 7, bladeRadius: 1.5, output: 24 },
};

const VARIANT_COLOR: Record<SpinnerVariant, string> = {
  primary: "var(--ds-color-interactive-primary)",
  secondary: "var(--ds-color-text-secondary)",
  success: "var(--ds-color-interactive-success)",
  error: "var(--ds-color-interactive-danger)",
  warning: "var(--ds-color-interactive-warning-active)",
  info: "var(--ds-color-interactive-info)",
  white: "var(--ds-color-white)",
};

export interface SpinnerProps extends Omit<ComponentProps<"output">, "size"> {
  label?: string;
  size?: SpinnerSize;
  variant?: SpinnerVariant;
}

export function Spinner({
  ref,
  className,
  style,
  size = "medium",
  variant = "primary",
  label = "Loading",
  ...props
}: SpinnerProps) {
  const geom = SIZE_GEOMETRY[size];
  const left = (geom.output - geom.bladeWidth) / 2;
  const originY = geom.bladeHeight - geom.output / 2;

  const step = 360 / geom.blades;
  const blades = Array.from({ length: geom.blades }, (_, i) => ({
    angle: i * step,
    delay: -((geom.blades - 1 - i) * (0.75 / geom.blades)),
  }));

  return (
    <output
      aria-label={label}
      aria-live="polite"
      className={cn(styles.spinner, className)}
      ref={ref}
      style={{
        width: `${geom.output}px`,
        height: `${geom.output}px`,
        color: VARIANT_COLOR[variant],
        ...style,
      }}
      {...props}
    >
      {blades.map(({ angle, delay }) => (
        <div
          className={styles.blade}
          key={`blade-${angle}`}
          style={
            {
              left: `${left}px`,
              width: `${geom.bladeWidth}px`,
              height: `${geom.bladeHeight}px`,
              borderRadius: `${geom.bladeRadius}px`,
              transformOrigin: `center ${originY}px`,
              animationDelay: `${delay}s`,
              transform: `rotate(${angle}deg)`,
            } as CSSProperties
          }
        />
      ))}
    </output>
  );
}
