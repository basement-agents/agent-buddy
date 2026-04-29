import { Tooltip as TooltipBase } from "@base-ui/react/tooltip";
import {
  forwardRef,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./tooltip.module.css";

export const TooltipProvider = TooltipBase.Provider;
export const TooltipRoot = TooltipBase.Root;
export const TooltipTrigger = TooltipBase.Trigger;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof TooltipBase.Popup>
>(function TooltipContent({ className, children, ...props }, ref) {
  return (
    <TooltipBase.Portal>
      <TooltipBase.Positioner sideOffset={6}>
        <TooltipBase.Popup
          className={cn(styles.popup, className)}
          ref={ref}
          {...props}
        >
          {children}
        </TooltipBase.Popup>
      </TooltipBase.Positioner>
    </TooltipBase.Portal>
  );
});

export interface TooltipProps {
  /** Trigger element. Must be a single React element so the tooltip can attach refs/handlers. */
  children: ReactElement;
  content: ReactNode;
  delay?: number;
}

/** Convenience wrapper that wires Provider/Root/Trigger/Content. */
export function Tooltip({ children, content, delay = 200 }: TooltipProps) {
  return (
    <TooltipProvider delay={delay}>
      <TooltipRoot>
        <TooltipTrigger render={children} />
        <TooltipContent>{content}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
