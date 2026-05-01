import styles from "./tab-strip.module.css";

interface TabOption {
  id: string;
  label: string;
}

interface TabStripProps {
  tabs: TabOption[];
  active: string;
  onChange: (id: string) => void;
}

/**
 * TabStrip — Threads-style underline tab navigation.
 *
 * Active tab has a 2px solid underline in --ds-color-text-primary.
 * Inactive tabs are --ds-color-text-secondary; hover shifts to primary color only.
 * No pill, no background.
 */
export function TabStrip({ tabs, active, onChange }: TabStripProps) {
  return (
    <nav className={styles.root} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={[styles.tab, active === tab.id ? styles.tabActive : ""].filter(Boolean).join(" ")}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
