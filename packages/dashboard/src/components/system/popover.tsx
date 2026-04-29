import { Popover as PopoverBase } from "@base-ui/react/popover";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./popover.module.css";

const PopoverRoot = PopoverBase.Root;
const PopoverTrigger = PopoverBase.Trigger;

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof PopoverBase.Popup>
>(function PopoverContent({ className, children, ...props }, ref) {
  return (
    <PopoverBase.Portal>
      <PopoverBase.Positioner>
        <PopoverBase.Popup
          className={cn(styles.popup, className)}
          ref={ref}
          {...props}
        >
          {children}
        </PopoverBase.Popup>
      </PopoverBase.Positioner>
    </PopoverBase.Portal>
  );
});

export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverTrigger,
  Content: PopoverContent,
});
