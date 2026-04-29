import { Menu } from "@base-ui/react/menu";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./dropdown.module.css";

export const DropdownRoot = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export const DropdownContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Menu.Popup>
>(function DropdownContent({ className, children, ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={4}>
        <Menu.Popup
          className={cn(styles.popup, className)}
          ref={ref}
          {...props}
        >
          {children}
        </Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
});

export const DropdownItem = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Menu.Item>
>(function DropdownItem({ className, ...props }, ref) {
  return (
    <Menu.Item className={cn(styles.item, className)} ref={ref} {...props} />
  );
});

export const DropdownSeparator = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Menu.Separator>
>(function DropdownSeparator({ className, ...props }, ref) {
  return (
    <Menu.Separator
      className={cn(styles.separator, className)}
      ref={ref}
      {...props}
    />
  );
});

export const DropdownLabel = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Menu.GroupLabel>
>(function DropdownLabel({ className, ...props }, ref) {
  return (
    <Menu.GroupLabel
      className={cn(styles.label, className)}
      ref={ref}
      {...props}
    />
  );
});

export const Dropdown = Object.assign(DropdownRoot, {
  Trigger: DropdownTrigger,
  Content: DropdownContent,
  Item: DropdownItem,
  Separator: DropdownSeparator,
  Label: DropdownLabel,
});
