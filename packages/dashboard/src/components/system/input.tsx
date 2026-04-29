import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Field, useField } from "./field";
import styles from "./input.module.css";

export type InputSize = "large" | "medium" | "small" | "x-small";

const SIZE_CLASS: Record<InputSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
  "x-small": styles.sizeXSmall,
};

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
  error?: boolean | string;
  stretch?: boolean;
  label?: ReactNode;
  description?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = "medium",
    error = false,
    stretch = false,
    label,
    description,
    className,
    id: idProp,
    required,
    ...props
  },
  ref,
) {
  const reactId = useId();
  const id = idProp ?? reactId;
  const hasError = !!error;
  const errorMessage = typeof error === "string" ? error : undefined;

  const inputEl = (
    <FieldAwareInput
      aria-invalid={hasError || undefined}
      className={cn(
        styles.input,
        SIZE_CLASS[size],
        stretch && styles.stretch,
        hasError && styles.error,
        className,
      )}
      id={id}
      ref={ref}
      required={required}
      {...props}
    />
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
        {inputEl}
      </Field>
    );
  }

  return inputEl;
});

const FieldAwareInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function FieldAwareInput({ "aria-describedby": callerDescribedBy, ...props }, ref) {
    const field = useField();
    const fieldDescribedBy = field.errorId ?? field.descriptionId;
    const describedBy =
      [fieldDescribedBy, callerDescribedBy].filter(Boolean).join(" ") || undefined;
    return <input aria-describedby={describedBy} ref={ref} {...props} />;
  },
);
