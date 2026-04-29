import { Switch as SwitchBase } from "@base-ui/react/switch";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./switch.module.css";

export type SwitchSize = "large" | "medium" | "small";

const SIZE_CLASS: Record<SwitchSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
};

export interface SwitchProps extends ComponentProps<typeof SwitchBase.Root> {
  size?: SwitchSize;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, size = "medium", ...props },
  ref,
) {
  return (
    <SwitchBase.Root
      className={cn(styles.switch, SIZE_CLASS[size], className)}
      ref={ref}
      {...props}
    >
      <SwitchBase.Thumb className={styles.thumb} />
    </SwitchBase.Root>
  );
});
