import { type ReactNode } from "react";
import styles from "./profile-header.module.css";

interface ProfileHeaderProps {
  /** Large avatar element (88px circular or icon glyph). */
  avatar: ReactNode;
  /** Primary title, 22px/700. */
  title: string;
  /** Secondary line — owner/slug, persona, etc. */
  subtitle?: string;
  /** Optional third line — description or extra meta. */
  description?: string;
  /** Trailing action area — pill Buttons. */
  actions?: ReactNode;
}

/**
 * ProfileHeader — profile-page hero used by repo-detail, buddy-detail, etc.
 *
 * Layout: large avatar on the left, title + subtitle + description stacked,
 * trailing actions on the right. Hairline bottom border.
 */
export function ProfileHeader({
  avatar,
  title,
  subtitle,
  description,
  actions,
}: ProfileHeaderProps) {
  return (
    <div className={styles.root}>
      <div className={styles.avatarSlot}>{avatar}</div>
      <div className={styles.body}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle != null && <p className={styles.subtitle}>{subtitle}</p>}
        {description != null && <p className={styles.description}>{description}</p>}
      </div>
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
