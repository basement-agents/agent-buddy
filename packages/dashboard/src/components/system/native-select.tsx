import { forwardRef, type SelectHTMLAttributes } from "react";
import { Select, type SelectProps } from "./select";

/** Backwards-compatible alias — see `./select.tsx` for the canonical component. */
export const NativeSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & Pick<SelectProps, "size" | "error" | "stretch">
>(function NativeSelect({ stretch = true, ...props }, ref) {
  return <Select ref={ref} stretch={stretch} {...props} />;
});
