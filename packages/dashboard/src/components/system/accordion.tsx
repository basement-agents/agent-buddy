import { Accordion as AccordionBase } from "@base-ui/react/accordion";
import { IconChevronDown } from "@tabler/icons-react";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./accordion.module.css";

export const Accordion = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof AccordionBase.Root>
>(function Accordion({ className, ...props }, ref) {
  return (
    <AccordionBase.Root
      className={cn(styles.root, className)}
      ref={ref}
      {...props}
    />
  );
});

export const AccordionItem = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof AccordionBase.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionBase.Item
      className={cn(styles.item, className)}
      ref={ref}
      {...props}
    />
  );
});

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof AccordionBase.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionBase.Header className={styles.header}>
      <AccordionBase.Trigger
        className={cn(styles.trigger, className)}
        ref={ref}
        {...props}
      >
        <span>{children}</span>
        <span className={styles.icon}>
          <IconChevronDown size={16} stroke={2} />
        </span>
      </AccordionBase.Trigger>
    </AccordionBase.Header>
  );
});

export const AccordionPanel = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof AccordionBase.Panel>
>(function AccordionPanel({ className, children, ...props }, ref) {
  return (
    <AccordionBase.Panel
      className={cn(styles.panel, className)}
      ref={ref}
      {...props}
    >
      <div className={styles.content}>{children}</div>
    </AccordionBase.Panel>
  );
});
