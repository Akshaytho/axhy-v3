/**
 * EdgeList — reusable list of "X via Y" edge rows used across all detail panels.
 * Renders a list of relationships (reads, triggers, mounts, etc.) with
 * optional badge, metadata, and click-to-navigate behaviour.
 *
 * @derives(ADR-0014)
 */

'use client';

import styles from '../_styles.module.css';

export type EdgeRow = {
  id: string;
  name: string;
  meta?: string;
  badge?: string;
  badgeVariant?: 'method' | 'pii' | 'dynamic' | 'unresolvable';
};

type EdgeListProps = {
  rows: EdgeRow[];
  onNavigate?: (id: string) => void;
  emptyMessage?: string;
};

const BADGE_CLASS: Record<string, string | undefined> = {
  method: styles.badgeMethod,
  pii: styles.badgePii,
  dynamic: styles.badgeDynamic,
  unresolvable: styles.badgeUnresolvable,
};

/** @derives(ADR-0014) */
export function EdgeList({ rows, onNavigate, emptyMessage }: EdgeListProps) {
  if (rows.length === 0) {
    return <p className={styles.noData}>{emptyMessage ?? 'None'}</p>;
  }

  return (
    <ul className={styles.edgeList}>
      {rows.map((row) => (
        <li
          key={row.id}
          className={`${styles.edgeRow}${onNavigate ? ` ${styles.edgeRowClickable}` : ''}`}
          onClick={() => onNavigate?.(row.id)}
          role={onNavigate ? 'button' : undefined}
          tabIndex={onNavigate ? 0 : undefined}
          onKeyDown={(e) => {
            if (onNavigate && (e.key === 'Enter' || e.key === ' ')) {
              onNavigate(row.id);
            }
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.edgeRowName}>{row.name}</div>
            {row.meta && <div className={styles.edgeRowMeta}>{row.meta}</div>}
          </div>
          {row.badge && (
            <span
              className={`${styles.edgeRowBadge ?? ''} ${BADGE_CLASS[row.badgeVariant ?? ''] ?? ''}`}
            >
              {row.badge}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
