import { Dialog as DialogBase } from "@base-ui/react/dialog";
import { IconX } from "@tabler/icons-react";
import { forwardRef, type ComponentProps, type ReactElement } from "react";
import { cn } from "~/lib/utils";
import { Button } from "./button";
import styles from "./dialog.module.css";
import { Typography } from "./typography";

export type DialogSize = "small" | "medium" | "large";

const SIZE_CLASS: Record<DialogSize, string> = {
  small: styles.sizeSmall,
  medium: styles.sizeMedium,
  large: styles.sizeLarge,
};

const DialogRoot = DialogBase.Root;
const DialogTrigger = DialogBase.Trigger;

export interface DialogContentProps extends ComponentProps<typeof DialogBase.Popup> {
  size?: DialogSize;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent({ className, size = "medium", children, ...props }, ref) {
    return (
      <DialogBase.Portal>
        <DialogBase.Backdrop className={styles.overlay} />
        <DialogBase.Popup
          className={cn(styles.panel, SIZE_CLASS[size], className)}
          ref={ref}
          {...props}
        >
          {children}
        </DialogBase.Popup>
      </DialogBase.Portal>
    );
  },
);

export interface DialogCloseProps extends ComponentProps<typeof DialogBase.Close> {
  render?: ReactElement;
}

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(
  function DialogClose({ className, render, children, ...props }, ref) {
    if (render) {
      return (
        <DialogBase.Close
          className={className}
          ref={ref}
          render={render}
          {...props}
        />
      );
    }
    return (
      <DialogBase.Close
        aria-label="Close"
        className={cn(styles.close, className)}
        ref={ref}
        render={
          <Button shape="square" size="x-small" svgOnly variant="outline">
            <IconX size={14} stroke={2} />
          </Button>
        }
        {...props}
      >
        {children}
      </DialogBase.Close>
    );
  },
);

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  ComponentProps<typeof DialogBase.Title>
>(function DialogTitle({ className, children, ...props }, ref) {
  return (
    <DialogBase.Title className={cn(styles.title, className)} ref={ref} {...props}>
      <Typography size={20} type="custom" weight="bold">
        {children}
      </Typography>
    </DialogBase.Title>
  );
});

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  ComponentProps<typeof DialogBase.Description>
>(function DialogDescription({ className, children, ...props }, ref) {
  return (
    <DialogBase.Description
      className={cn(styles.description, className)}
      ref={ref}
      {...props}
    >
      <Typography
        color="var(--ds-color-text-secondary)"
        size={14}
        type="custom"
      >
        {children}
      </Typography>
    </DialogBase.Description>
  );
});

export const Dialog = Object.assign(DialogRoot, {
  Trigger: DialogTrigger,
  Content: DialogContent,
  Close: DialogClose,
  Title: DialogTitle,
  Description: DialogDescription,
});
