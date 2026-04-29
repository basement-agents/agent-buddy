import { Radio } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupBase } from "@base-ui/react/radio-group";
import {
  forwardRef,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./radio-group.module.css";
import { Typography } from "./typography";

export type RadioSize = "large" | "medium" | "small";

const SIZE_CLASS: Record<RadioSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
};

interface RadioGroupContext {
  size: RadioSize;
}

export interface RadioGroupProps extends ComponentProps<typeof RadioGroupBase> {
  size?: RadioSize;
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  function RadioGroup({ size = "medium", className, ...props }, ref) {
    return (
      <RadioGroupBase
        className={cn(styles.group, className)}
        data-radio-size={size}
        ref={ref}
        {...props}
      />
    );
  },
);

export interface RadioItemProps extends ComponentProps<typeof Radio.Root> {
  label?: ReactNode;
  size?: RadioSize;
}

export const RadioItem = forwardRef<HTMLButtonElement, RadioItemProps>(
  function RadioItem({ id: idProp, className, size = "medium", label, value, ...props }, ref) {
    const reactId = useId();
    const id = idProp ?? reactId;

    return (
      <div className={cn(styles.itemWrapper, SIZE_CLASS[size], className)}>
        <Radio.Root
          className={styles.radio}
          id={id}
          ref={ref}
          value={value}
          {...props}
        />
        {label && (
          <Typography
            render={
              <label className={styles.label} htmlFor={id}>
                {label}
              </label>
            }
            size={size}
            type="body"
          />
        )}
      </div>
    );
  },
);
