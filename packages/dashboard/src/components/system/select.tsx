import { IconSelector } from "@tabler/icons-react";
import {
  forwardRef,
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "~/lib/utils";
import { Field, useField } from "./field";
import styles from "./select.module.css";

export type SelectSize = "large" | "medium" | "small" | "x-small";

const SIZE_CLASS: Record<SelectSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
  "x-small": styles.sizeXSmall,
};

const ICON_SIZE: Record<SelectSize, number> = {
  "x-small": 10,
  small: 12,
  medium: 14,
  large: 14,
};

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: SelectSize;
  error?: boolean | string;
  stretch?: boolean;
  label?: ReactNode;
  description?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    size = "medium",
    error = false,
    stretch = false,
    label,
    description,
    className,
    id: idProp,
    required,
    children,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const hasError = !!error;
  const errorMessage = typeof error === "string" ? error : undefined;

  const selectEl = (
    <div
      className={cn(
        styles.wrapper,
        SIZE_CLASS[size],
        stretch && styles.stretch,
        hasError && styles.error,
        className,
      )}
    >
      <FieldAwareSelect
        aria-invalid={hasError || undefined}
        className={styles.select}
        id={id}
        ref={ref}
        required={required}
        {...props}
      >
        {children}
      </FieldAwareSelect>
      <span className={styles.icon}>
        <IconSelector size={ICON_SIZE[size]} stroke={2} />
      </span>
    </div>
  );

  if (label || description || errorMessage) {
    return (
      <Field
        description={description}
        error={errorMessage}
        htmlFor={id}
        label={label}
        required={required}
      >
        {selectEl}
      </Field>
    );
  }

  return selectEl;
});

const FieldAwareSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function FieldAwareSelect({ "aria-describedby": callerDescribedBy, ...props }, ref) {
  const field = useField();
  const fieldDescribedBy = field.errorId ?? field.descriptionId;
  const describedBy =
    [fieldDescribedBy, callerDescribedBy].filter(Boolean).join(" ") || undefined;
  return <select aria-describedby={describedBy} ref={ref} {...props} />;
});
