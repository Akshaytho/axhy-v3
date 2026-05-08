/**
 * Section — collapsible card used in all detail panels.
 * Shows a title bar + optional item count + expandable body.
 *
 * @derives(ADR-0014)
 */

'use client';

import { useState } from 'react';

import styles from '../_styles.module.css';

type SectionProps = {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  icon?: string;
  warnStyle?: boolean;
};

/** @derives(ADR-0014) */
export function Section({
  title,
  count,
  defaultOpen = true,
  children,
  icon,
  warnStyle,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (warnStyle) {
    return (
      <div className={styles.breaksSection}>
        <button
          type="button"
          className={styles.breaksSectionHeader}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <span>{icon ?? '⚠'}</span>
          <span>{title}</span>
          {count !== undefined && <span className={styles.sectionHeaderCount}>({count})</span>}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--warn)' }}>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {open && <div className={styles.breaksSectionBody}>{children}</div>}
      </div>
    );
  }

  return (
    <div className={`${styles.section}${open ? '' : ` ${styles.collapsed}`}`}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.sectionHeaderTitle}>
          {icon && <span>{icon}</span>}
          <span>{title}</span>
          {count !== undefined && <span className={styles.sectionHeaderCount}>{count}</span>}
        </span>
        <span className={styles.sectionArrow}>▾</span>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}
