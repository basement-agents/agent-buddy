import { Checkbox as CheckboxBase } from "@base-ui/react/checkbox";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import {
  forwardRef,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import styles from "./checkbox.module.css";
import { Typography } from "./typography";

export type CheckboxSize = "large" | "medium" | "small";
export type CheckboxStatus = "on" | "off" | "intermediate";

const SIZE_CLASS: Record<CheckboxSize, string> = {
  large: styles.sizeLarge,
  medium: styles.sizeMedium,
  small: styles.sizeSmall,
};

const ICON_SIZE: Record<CheckboxSize, number> = {
  large: 16,
  medium: 14,
  small: 12,
};

type BaseCheckboxRootProps = Omit<
  ComponentProps<typeof CheckboxBase.Root>,
  "checked" | "onCheckedChange" | "onChange" | "indeterminate" | "defaultChecked"
>;

export interface CheckboxProps extends BaseCheckboxRootProps {
  size?: CheckboxSize;
  status?: CheckboxStatus;
  defaultStatus?: CheckboxStatus;
  /** Convenience boolean control. If `status` is provided, it takes precedence. */
  checked?: boolean;
  defaultChecked?: boolean;
  label?: ReactNode;
  onChange?: (status: "on" | "off") => void;
  /** Native onChange compat (existing callers). */
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

function statusToBaseProps(status: CheckboxStatus): {
  checked: boolean;
  indeterminate: boolean;
} {
  if (status === "on") return { checked: true, indeterminate: false };
  if (status === "intermediate") return { checked: false, indeterminate: true };
  return { checked: false, indeterminate: false };
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  function Checkbox(
    {
      id: idProp,
      className,
      size = "medium",
      status: statusProp,
      defaultStatus,
      checked: checkedProp,
      defaultChecked,
      onChange,
      onCheckedChange,
      label,
      disabled,
      ...props
    },
    ref,
  ) {
    const reactId = useId();
    const id = idProp ?? reactId;

    const initialStatus: CheckboxStatus =
      defaultStatus ?? (defaultChecked ? "on" : "off");
    const isControlledRef = useRef(
      statusProp !== undefined || checkedProp !== undefined,
    );
    const isControlled = isControlledRef.current;

    const [internalStatus, setInternalStatus] = useState<CheckboxStatus>(initialStatus);

    const externalStatus: CheckboxStatus | undefined =
      statusProp ?? (checkedProp === undefined ? undefined : checkedProp ? "on" : "off");
    const status: CheckboxStatus = isControlled
      ? (externalStatus as CheckboxStatus)
      : internalStatus;

    const checkedState = statusToBaseProps(status);

    const handleCheckedChange = (next: boolean) => {
      if (disabled) return;
      const nextStatus: CheckboxStatus = next ? "on" : "off";
      if (!isControlled) setInternalStatus(nextStatus);
      onChange?.(nextStatus);
      onCheckedChange?.(next);
    };

    return (
      <div className={cn(styles.wrapper, SIZE_CLASS[size], className)}>
        <CheckboxBase.Root
          checked={checkedState.checked}
          className={styles.checkbox}
          disabled={disabled}
          id={id}
          indeterminate={checkedState.indeterminate}
          onCheckedChange={handleCheckedChange}
          ref={ref}
          {...props}
        >
          <CheckboxBase.Indicator
            className={styles.indicator}
            style={{ opacity: status === "on" ? 1 : 0 }}
          >
            <IconCheck size={ICON_SIZE[size]} stroke={3} />
          </CheckboxBase.Indicator>
          <span
            aria-hidden="true"
            className={styles.indicator}
            style={{
              opacity: status === "intermediate" ? 1 : 0,
              position: "absolute",
              inset: 0,
            }}
          >
            <IconMinus size={ICON_SIZE[size]} stroke={3} />
          </span>
        </CheckboxBase.Root>
        {label && (
          <Typography
            aria-disabled={disabled}
            render={
              <label className={styles.label} htmlFor={id}>
                {label}
              </label>
            }
            size={size}
            type="body"
          />
        )}
      </div>
    );
  },
);
