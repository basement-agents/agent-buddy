import { forwardRef, type LabelHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        className={cn(
          "mb-1 inline-block text-[14px] font-medium text-[var(--ds-color-text-primary)]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
