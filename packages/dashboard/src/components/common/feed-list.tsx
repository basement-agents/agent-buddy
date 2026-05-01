import { type ReactNode } from "react";
import styles from "./feed-list.module.css";

// ---------------------------------------------------------------------------
// FeedList — hairline-divided <ul>
// ---------------------------------------------------------------------------

interface FeedListProps {
  children: ReactNode;
  className?: string;
}

export function FeedList({ children, className }: FeedListProps) {
  return (
    <ul className={[styles.list, className].filter(Boolean).join(" ")}>
      {children}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// FeedItem — a single row in the feed
//
// Two usage patterns:
//   1. Slot props:  <FeedItem leading={…} title="…" meta="…" trailing={…} />
//   2. Full custom: <FeedItem>{children}</FeedItem>
// ---------------------------------------------------------------------------

interface FeedItemSlotProps {
  /** 40px left column — avatar, icon, etc. Pass null to omit. */
  leading?: ReactNode;
  /** Primary text (15px/600). */
  title?: ReactNode;
  /** Secondary text (13px/muted). */
  meta?: ReactNode;
  /** Right-aligned column — timestamp, actions, etc. */
  trailing?: ReactNode;
  /** For fully custom layout instead of slots. */
  children?: ReactNode;
  /** Pass through click handler for row-level navigation. */
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  role?: string;
  tabIndex?: number;
  className?: string;
  /** aria-label for the item */
  "aria-label"?: string;
}

export function FeedItem({
  leading,
  title,
  meta,
  trailing,
  children,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  className,
  "aria-label": ariaLabel,
}: FeedItemSlotProps) {
  const cls = [styles.item, className].filter(Boolean).join(" ");

  if (children != null && title == null && leading == null && meta == null && trailing == null) {
    // Full custom layout — just render children in the item shell
    return (
      <li
        className={cls}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role={role}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        style={onClick ? { cursor: "pointer" } : undefined}
      >
        {children}
      </li>
    );
  }

  // Slot-based layout
  return (
    <li
      className={cls}
      onClick={onClick}
      onKeyDown={onKeyDown}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {leading != null && <div className={styles.leading}>{leading}</div>}
      <div className={styles.body}>
        {title != null && <div className={styles.title}>{title}</div>}
        {meta != null && <div className={styles.meta}>{meta}</div>}
      </div>
      {trailing != null && <div className={styles.trailing}>{trailing}</div>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// FeedAvatar — circular avatar with initial fallback
// ---------------------------------------------------------------------------

interface FeedAvatarProps {
  /** Display name — first character used as initial fallback. May be undefined. */
  name?: string | null;
  /** Optional image src. */
  src?: string;
  /** "md" = 40px (default), "lg" = 48px */
  size?: "md" | "lg";
}

export function FeedAvatar({ name, src, size = "md" }: FeedAvatarProps) {
  const cls = [styles.avatar, size === "lg" ? styles.avatarLg : ""].filter(Boolean).join(" ");
  const safeName = typeof name === "string" && name.length > 0 ? name : "?";
  if (src) {
    return (
      <div className={cls}>
        <img src={src} alt={safeName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div className={cls} aria-hidden="true">
      {safeName.charAt(0).toUpperCase()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedIconWrapper — square with rounded corners for non-avatar icons
// ---------------------------------------------------------------------------

export function FeedIconWrapper({ children }: { children: ReactNode }) {
  return <div className={styles.iconWrapper}>{children}</div>;
}

// ---------------------------------------------------------------------------
// FeedChipStrip — filter/sort chip row above a feed list
// ---------------------------------------------------------------------------

interface ChipOption {
  label: string;
  value: string;
}

interface FeedChipStripProps {
  options: ChipOption[];
  active: string;
  onChange: (value: string) => void;
}

export function FeedChipStrip({ options, active, onChange }: FeedChipStripProps) {
  return (
    <div className={styles.chipStrip} role="group" aria-label="Filter options">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={[styles.chip, active === opt.value ? styles.chipActive : ""].filter(Boolean).join(" ")}
          onClick={() => onChange(opt.value)}
          aria-pressed={active === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedHeader — page-level profile-style header
// ---------------------------------------------------------------------------

interface FeedHeaderProps {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}

export function FeedHeader({ title, meta, action }: FeedHeaderProps) {
  return (
    <div className={styles.feedHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div className={styles.feedHeaderTitle}>{title}</div>
        {meta != null && <div className={styles.feedHeaderMeta}>{meta}</div>}
      </div>
      {action != null && <div>{action}</div>}
    </div>
  );
}
