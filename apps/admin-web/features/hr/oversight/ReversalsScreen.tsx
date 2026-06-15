'use client';

import { useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Empty } from '../../../components/ui/primitives';

/**
 * Reversal requests — late-undo review queue. v6 marks the WHOLE HR reversal
 * surface as NEW (no list/apply/decline endpoints yet), so this is an honest
 * preview (banner + empty state), not fabricated rows.
 * @derives(master-plan §G)
 */
export function ReversalsScreen() {
  const [filter, setFilter] = useState<'open' | 'reviewed'>('open');
  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations · Reversals</div>
          <h1 className="page-title">Reversal requests</h1>
          <p className="page-sub">
            When a supervisor needs to undo something older than 30 minutes, it comes to you.
          </p>
        </div>
      </div>

      <div className="oversight-banner">
        <Icon name="info" size={19} />
        <div>
          <b>Coming soon.</b> The HR reversal flow — list, apply, decline — is a new backend
          surface. Requests appear here once the endpoints ship.
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button
            className={filter === 'open' ? 'on' : ''}
            onClick={() => setFilter('open')}
            type="button"
          >
            Open
          </button>
          <button
            className={filter === 'reviewed' ? 'on' : ''}
            onClick={() => setFilter('reviewed')}
            type="button"
          >
            Reviewed
          </button>
        </div>
      </div>

      {filter === 'open' ? (
        <div className="allcaught">
          <Icon name="checkCircle" size={22} />
          <div>
            <b>All caught up.</b> Supervisors can undo their own recent actions within 30 minutes —
            only the ones past that window land here, once the reversal endpoints ship.
          </div>
        </div>
      ) : (
        <Empty
          icon="undo"
          title="Nothing reviewed yet"
          body="Applied and declined reversals will show here."
        />
      )}
    </div>
  );
}
