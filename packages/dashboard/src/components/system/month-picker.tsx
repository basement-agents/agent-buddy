import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { forwardRef, useState, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./month-picker.module.css";

export interface MonthPickerValue {
  year: number;
  month: number;
}

export interface MonthPickerProps
  extends Omit<ComponentProps<"div">, "onChange" | "defaultValue"> {
  value?: MonthPickerValue;
  defaultValue?: MonthPickerValue;
  onChange?: (value: MonthPickerValue) => void;
  monthLabels?: string[];
}

const DEFAULT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MonthPicker = forwardRef<HTMLDivElement, MonthPickerProps>(
  function MonthPicker(
    {
      value,
      defaultValue,
      onChange,
      monthLabels = DEFAULT_MONTHS,
      className,
      ...props
    },
    ref,
  ) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<MonthPickerValue | undefined>(
      defaultValue,
    );
    const selected = isControlled ? value : internalValue;

    const [year, setYear] = useState(selected?.year ?? new Date().getFullYear());

    const handleSelect = (month: number) => {
      const next = { year, month };
      if (!isControlled) setInternalValue(next);
      onChange?.(next);
    };

    return (
      <div className={cn(styles.picker, className)} ref={ref} {...props}>
        <div className={styles.header}>
          <button
            aria-label="Previous year"
            className={styles.navButton}
            onClick={() => setYear((y) => y - 1)}
            type="button"
          >
            <IconChevronLeft size={16} stroke={2} />
          </button>
          <span className={styles.title}>{year}</span>
          <button
            aria-label="Next year"
            className={styles.navButton}
            onClick={() => setYear((y) => y + 1)}
            type="button"
          >
            <IconChevronRight size={16} stroke={2} />
          </button>
        </div>
        <div className={styles.grid}>
          {monthLabels.map((label, index) => {
            const isSelected =
              selected?.year === year && selected?.month === index;
            return (
              <button
                className={styles.month}
                data-selected={isSelected ? "" : undefined}
                key={label}
                onClick={() => handleSelect(index)}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
