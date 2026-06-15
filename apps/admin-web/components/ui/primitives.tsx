import type { ReactNode } from 'react';

import { initials } from '../../lib/format';

import { Icon } from './Icon';
import { Chip } from './Chip';

/**
 * Initials avatar. `neutral` greys it out (e.g. resigned/anonymised).
 * @derives(master-plan §G)
 */
export function Avatar({
  name,
  size = '',
  neutral,
}: {
  name: string;
  size?: 'sm' | 'lg' | '';
  neutral?: boolean;
}) {
  return <div className={`avatar ${size} ${neutral ? 'neutral' : ''}`}>{initials(name)}</div>;
}

const STATUS_CHIP: Record<string, [string, Parameters<typeof Chip>[0]['tone']]> = {
  ACTIVE: ['Active', 'ok'],
  INACTIVE: ['Inactive', 'neutral'],
  INVITED: ['Invited', 'neutral'],
  PENDING: ['Pending', 'accent'],
};

/**
 * Membership status chip (distinct from the worker StateChip).
 * @derives(master-plan §G)
 */
export function StatusChip({ status, sm }: { status: string; sm?: boolean }) {
  const [label, tone] = STATUS_CHIP[status] ?? [status, 'neutral'];
  return (
    <Chip tone={tone} sm={sm} dot={false}>
      {label}
    </Chip>
  );
}

/**
 * Shared empty state.
 * @derives(master-plan §G)
 */
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="ico">
        <Icon name={icon} size={30} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

/**
 * "No owned sites" empty — distinct from "no items" (site-anchored HR).
 * @derives(master-plan §G)
 */
export function NoSitesEmpty() {
  return (
    <Empty
      icon="building"
      title="No sites assigned to you yet"
      body="Once an owner assigns you a site, the workers, queues and activity for it appear here."
    />
  );
}

/**
 * Marks a field whose backing endpoint isn't live yet.
 * @derives(master-plan §G)
 */
export function SoonData({ children, inline }: { children?: ReactNode; inline?: boolean }) {
  return (
    <span
      className={`soon-data ${inline ? 'inline' : ''}`}
      title="Needs a backend endpoint that isn't live yet"
    >
      {children ?? 'Soon'}
    </span>
  );
}

/**
 * Small "Soon" tag for disabled NEW-endpoint actions.
 * @derives(master-plan §G)
 */
export function NewTag() {
  return <span className="coming-soon-tag">Soon</span>;
}

/**
 * 7-day mask (Mon..Sun) — `_` = off.
 * @derives(master-plan §G)
 */
export function DayMask({ mask }: { mask: string }) {
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <span className="daymask">
      {mask.split('').map((c, i) => (
        <span key={i} className={c !== '_' ? 'on' : ''}>
          {labels[i]}
        </span>
      ))}
    </span>
  );
}
