'use client';

import { Icon } from './Icon';

/**
 * Copy-to-clipboard id chip (worker/user/membership ids).
 * @derives(master-plan §G)
 */
export function IdPill({ label, value }: { label: string; value: string }) {
  const short = value.length > 12 ? value.slice(0, 6) + '…' : value;
  return (
    <button
      className="id-pill"
      type="button"
      onClick={() => navigator.clipboard?.writeText(value)}
      title={`Copy ${label} id`}
    >
      <span className="k">{label}</span>
      <span>{short}</span>
      <Icon name="copy" size={12} />
    </button>
  );
}

/**
 * Full-panel "coming soon" placeholder for tabs whose read endpoint is NEW.
 * @derives(master-plan §G)
 */
export function SoonPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="soon-panel">
      <div className="ico">
        <Icon name="clock" size={24} />
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
    </div>
  );
}
