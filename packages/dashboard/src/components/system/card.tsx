import { forwardRef, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./card.module.css";
import { Typography } from "./typography";

export type CardSize = "default" | "sm";

export interface CardProps extends ComponentProps<"div"> {
  size?: CardSize;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, size = "default", ...props },
  ref,
) {
  return (
    <div
      className={cn(styles.card, size === "sm" && styles.sizeSm, className)}
      data-slot="card"
      ref={ref}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div
        className={cn(styles.header, className)}
        data-slot="card-header"
        ref={ref}
        {...props}
      />
    );
  },
);

export const CardTitle = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardTitle({ className, children, ...props }, ref) {
    return (
      <Typography
        render={
          <div
            className={cn(styles.title, className)}
            data-slot="card-title"
            ref={ref}
            {...props}
          />
        }
        size={16}
        type="custom"
        weight="semibold"
      >
        {children}
      </Typography>
    );
  },
);

export const CardDescription = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardDescription({ className, children, ...props }, ref) {
    return (
      <Typography
        color="var(--ds-color-text-secondary)"
        render={
          <div
            className={cn(styles.description, className)}
            data-slot="card-description"
            ref={ref}
            {...props}
          />
        }
        size={14}
        type="custom"
      >
        {children}
      </Typography>
    );
  },
);

export const CardAction = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardAction({ className, ...props }, ref) {
    return (
      <div
        className={cn(styles.action, className)}
        data-slot="card-action"
        ref={ref}
        {...props}
      />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardContent({ className, ...props }, ref) {
    return (
      <div
        className={cn(styles.content, className)}
        data-slot="card-content"
        ref={ref}
        {...props}
      />
    );
  },
);

export const CardFooter = forwardRef<HTMLDivElement, ComponentProps<"div">>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div
        className={cn(styles.footer, className)}
        data-slot="card-footer"
        ref={ref}
        {...props}
      />
    );
  },
);
