'use client';

import { useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Empty } from '../../../components/ui/primitives';

const FILTERS: [string, string][] = [
  ['all', 'All'],
  ['SENT', 'Awaiting'],
  ['ACCEPTED', 'Approved'],
  ['DECLINED', 'Declined'],
];

/**
 * Shift swaps — read-only HR oversight. v6 marks this NOT-LIVE: supervisors
 * decide swaps and the HR swap read endpoint doesn't exist yet, so this is an
 * honest preview (banner + empty state), not fabricated rows.
 * @derives(master-plan §G)
 */
export function SwapsScreen() {
  const [filter, setFilter] = useState('all');
  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations · Swaps</div>
          <h1 className="page-title">Shift swaps</h1>
          <p className="page-sub">
            When two workers agree to trade a shift. Supervisors approve them — you see them here
            for oversight.
          </p>
        </div>
      </div>

      <div className="oversight-banner">
        <Icon name="eye" size={19} />
        <div>
          <b>Read-only for HR.</b> Supervisors decide swaps. The HR swap oversight read endpoint
          isn&apos;t live yet — swaps appear here once it ships.
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              className={filter === k ? 'on' : ''}
              onClick={() => setFilter(k)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Empty
        icon="swap"
        title="No swaps to show yet"
        body="You'll see swaps only for sites you own, for oversight. This lights up when the HR swap read endpoint ships."
      />
    </div>
  );
}
