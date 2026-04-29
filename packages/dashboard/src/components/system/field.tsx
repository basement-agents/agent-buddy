import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import { Typography } from "./typography";

interface FieldContextValue {
  errorId?: string;
  descriptionId?: string;
  htmlFor?: string;
  hasError: boolean;
}

const FieldContext = createContext<FieldContextValue>({ hasError: false });

export function useField(): FieldContextValue {
  return useContext(FieldContext);
}

export interface FieldProps extends ComponentProps<"div"> {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
}

export function Field({
  label,
  description,
  error,
  htmlFor,
  required,
  className,
  children,
  ...props
}: FieldProps) {
  const reactId = useId();
  const errorId = error ? `${reactId}-error` : undefined;
  const descriptionId = description ? `${reactId}-description` : undefined;
  const hasError = !!error;

  return (
    <FieldContext.Provider
      value={{ errorId, descriptionId, htmlFor, hasError }}
    >
      <div className={cn("flex flex-col gap-1.5", className)} {...props}>
        {label && (
          <Typography
            render={
              <label
                className="text-[var(--ds-color-text-primary)]"
                htmlFor={htmlFor}
              />
            }
            size="medium"
            type="body"
            weight="medium"
          >
            {label}
            {required && (
              <span
                aria-hidden="true"
                className="ml-1 text-[var(--ds-color-feedback-danger)]"
              >
                *
              </span>
            )}
          </Typography>
        )}
        {children}
        {description && !error && (
          <Typography
            color="var(--ds-color-text-tertiary)"
            id={descriptionId}
            size="small"
            type="body"
          >
            {description}
          </Typography>
        )}
        {error && (
          <Typography
            color="var(--ds-color-feedback-danger-text)"
            id={errorId}
            role="alert"
            size="small"
            type="body"
          >
            {error}
          </Typography>
        )}
      </div>
    </FieldContext.Provider>
  );
}
