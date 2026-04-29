import { Tabs as TabsBase } from "@base-ui/react/tabs";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./tab.module.css";

export const Tabs = forwardRef<HTMLDivElement, ComponentProps<typeof TabsBase.Root>>(
  function Tabs({ className, ...props }, ref) {
    return (
      <TabsBase.Root
        className={cn(styles.tabs, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

export const TabList = forwardRef<HTMLDivElement, ComponentProps<typeof TabsBase.List>>(
  function TabList({ className, children, ...props }, ref) {
    return (
      <TabsBase.List
        className={cn(styles.list, className)}
        ref={ref}
        {...props}
      >
        {children}
        <TabsBase.Indicator className={styles.indicator} />
      </TabsBase.List>
    );
  },
);

export const Tab = forwardRef<HTMLButtonElement, ComponentProps<typeof TabsBase.Tab>>(
  function Tab({ className, ...props }, ref) {
    return (
      <TabsBase.Tab
        className={cn(styles.tab, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

export const TabPanel = forwardRef<HTMLDivElement, ComponentProps<typeof TabsBase.Panel>>(
  function TabPanel({ className, ...props }, ref) {
    return <TabsBase.Panel className={className} ref={ref} {...props} />;
  },
);
