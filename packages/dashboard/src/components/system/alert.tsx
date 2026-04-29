import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExclamationCircle,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  forwardRef,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./alert.module.css";
import { Typography } from "./typography";

export type AlertVariant = "info" | "success" | "warning" | "danger";

const VARIANT_CLASS: Record<AlertVariant, string> = {
  info: styles.variantInfo,
  success: styles.variantSuccess,
  warning: styles.variantWarning,
  danger: styles.variantDanger,
};

const VARIANT_ICON: Record<AlertVariant, ComponentType<{ size?: number }>> = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  danger: IconExclamationCircle,
};

export interface AlertProps extends Omit<ComponentProps<"div">, "title"> {
  variant?: AlertVariant;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  {
    variant = "info",
    title,
    description,
    icon,
    className,
    children,
    ...props
  },
  ref,
) {
  const Icon = VARIANT_ICON[variant];
  return (
    <div
      className={cn(styles.alert, VARIANT_CLASS[variant], className)}
      ref={ref}
      role="alert"
      {...props}
    >
      <span className={styles.icon}>{icon ?? <Icon size={20} />}</span>
      <div className={styles.content}>
        {title && (
          <Typography
            className={styles.title}
            size={14}
            type="custom"
            weight="semibold"
          >
            {title}
          </Typography>
        )}
        {description && (
          <Typography className={styles.description} size={14} type="custom">
            {description}
          </Typography>
        )}
        {children}
      </div>
    </div>
  );
});
