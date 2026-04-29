import type { ReactNode } from "react";
import { Typography } from "./typography";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-[var(--ds-radius-5)] border border-dashed border-[var(--ds-color-border-primary)] bg-[var(--ds-color-surface-primary)] p-8 text-center"
    >
      {icon && (
        <div className="text-[var(--ds-color-text-tertiary)]">{icon}</div>
      )}
      <Typography
        color="var(--ds-color-text-secondary)"
        size={14}
        type="custom"
        weight="medium"
      >
        {title}
      </Typography>
      {description && (
        <Typography
          color="var(--ds-color-text-tertiary)"
          size={12}
          type="custom"
        >
          {description}
        </Typography>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
