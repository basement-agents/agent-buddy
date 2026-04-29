import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { forwardRef, useState, type ComponentProps } from "react";
import { cn } from "~/lib/utils";
import styles from "./day-picker.module.css";

export interface DayPickerProps
  extends Omit<ComponentProps<"div">, "onChange" | "defaultValue"> {
  value?: Date;
  defaultValue?: Date;
  onChange?: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  weekdayLabels?: [string, string, string, string, string, string, string];
  monthLabel?: (year: number, month: number) => string;
}

const DEFAULT_WEEKDAYS: [string, string, string, string, string, string, string] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; outside: boolean }[] = [];
  const prevMonthDays = new Date(year, month, 0).getDate();

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, prevMonthDays - i),
      outside: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), outside: false });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      outside: true,
    });
  }
  return cells;
}

export const DayPicker = forwardRef<HTMLDivElement, DayPickerProps>(
  function DayPicker(
    {
      value,
      defaultValue,
      onChange,
      minDate,
      maxDate,
      weekdayLabels = DEFAULT_WEEKDAYS,
      monthLabel,
      className,
      ...props
    },
    ref,
  ) {
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = useState<Date | undefined>(
      defaultValue,
    );
    const selected = isControlled ? value : internalValue;

    const [view, setView] = useState<Date>(
      startOfMonth(selected ?? new Date()),
    );

    const today = new Date();
    const cells = buildMonthGrid(view.getFullYear(), view.getMonth());

    const navigate = (delta: number) => {
      setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    };

    const handleSelect = (date: Date) => {
      if (!isControlled) setInternalValue(date);
      onChange?.(date);
    };

    const isDisabled = (date: Date) =>
      (minDate && date < startOfDay(minDate)) ||
      (maxDate && date > startOfDay(maxDate));

    const headerLabel = monthLabel
      ? monthLabel(view.getFullYear(), view.getMonth())
      : `${MONTH_NAMES[view.getMonth()]} ${view.getFullYear()}`;

    return (
      <div className={cn(styles.picker, className)} ref={ref} {...props}>
        <div className={styles.header}>
          <button
            aria-label="Previous month"
            className={styles.navButton}
            onClick={() => navigate(-1)}
            type="button"
          >
            <IconChevronLeft size={16} stroke={2} />
          </button>
          <span className={styles.title}>{headerLabel}</span>
          <button
            aria-label="Next month"
            className={styles.navButton}
            onClick={() => navigate(1)}
            type="button"
          >
            <IconChevronRight size={16} stroke={2} />
          </button>
        </div>
        <div className={styles.grid}>
          {weekdayLabels.map((wd) => (
            <span className={styles.weekday} key={wd}>
              {wd}
            </span>
          ))}
          {cells.map(({ date, outside }) => {
            const isSelected = selected ? isSameDay(date, selected) : false;
            const isToday = isSameDay(date, today);
            return (
              <button
                aria-pressed={isSelected}
                className={styles.day}
                data-outside={outside ? "" : undefined}
                data-selected={isSelected ? "" : undefined}
                data-today={isToday ? "" : undefined}
                disabled={isDisabled(date) || undefined}
                key={date.toISOString()}
                onClick={() => handleSelect(date)}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
