import { OTPFieldPreview as OTPField } from "@base-ui/react/otp-field";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./one-time-password-field.module.css";

type RootProps = ComponentProps<typeof OTPField.Root>;

export interface OneTimePasswordFieldProps
  extends Omit<RootProps, "className" | "length"> {
  length?: number;
  className?: string;
  inputClassName?: string;
}

export const OneTimePasswordField = forwardRef<
  HTMLDivElement,
  OneTimePasswordFieldProps
>(function OneTimePasswordField(
  { className, inputClassName, length = 6, ...props },
  ref,
) {
  return (
    <OTPField.Root
      className={cn(styles.field, className)}
      length={length}
      ref={ref}
      {...props}
    >
      {Array.from({ length }, (_, index) => (
        <OTPField.Input
          className={cn(styles.input, inputClassName)}
          key={index}
        />
      ))}
    </OTPField.Root>
  );
});
