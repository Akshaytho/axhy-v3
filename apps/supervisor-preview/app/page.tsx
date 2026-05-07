/**
 * Supervisor preview — main orchestrator (rebuilt 2026-05-06 round 3).
 *
 * Action-first home: single-screen, stacked big-action buttons, giant voice
 * mic, settings gear. No tabs. Field-tool not dashboard.
 *
 * Query param `?frame=off` drops desktop chrome for full-bleed mobile preview.
 *
 * @derives(master-plan §G)
 */

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { ActionHome } from './_components/ActionHome';
import type { TimeOfDay } from './_lib/mock';

const TIMES: Array<{ key: TimeOfDay; label: string }> = [
  { key: '7am', label: '7 AM' },
  { key: '11am', label: '11 AM' },
  { key: '3pm', label: '3 PM' },
  { key: '11pm', label: '11 PM' },
];

/** @derives(master-plan §G) */
export default function SupervisorPreviewPage() {
  return (
    <Suspense fallback={null}>
      <PageInner />
    </Suspense>
  );
}

/** @derives(master-plan §G) */
function PageInner() {
  const searchParams = useSearchParams();
  const frameless = searchParams.get('frame') === 'off';

  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('11am');
  const [showReach, setShowReach] = useState(false);

  return (
    <div className={frameless ? 'sup-stage is-frameless' : 'sup-stage'}>
      <div className="sup-debug-strip">
        <strong>Supervisor preview · v0.3 action-first</strong>
        <span>· Suresh @ Reddy Cleaning</span>
        <span className="sup-debug-time">
          <span style={{ marginRight: 4, color: 'var(--text-mute)' }}>Time</span>
          {TIMES.map((t) => (
            <button
              key={t.key}
              className={timeOfDay === t.key ? 'is-on' : undefined}
              onClick={() => setTimeOfDay(t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </span>
        <label className="sup-debug-toggle">
          <input
            type="checkbox"
            checked={showReach}
            onChange={(e) => setShowReach(e.target.checked)}
          />
          Reach overlay
        </label>
        <a
          href={frameless ? '?frame=on' : '?frame=off'}
          style={{ color: 'var(--gold)', fontFamily: 'var(--mono)', fontSize: 11 }}
        >
          {frameless ? 'Show frame' : 'Full bleed'}
        </a>
      </div>

      <div className="sup-phone-wrap">
        <div className="sup-phone">
          <div className="sup-phone-notch" aria-hidden="true" />
          <div className="sup-phone-status">
            <span>{phoneClock(timeOfDay)}</span>
            <span>5G · 84%</span>
          </div>

          <div className="sup-screen" style={{ paddingBottom: 0 }}>
            <ActionHome timeOfDay={timeOfDay} />
          </div>

          {showReach && (
            <div className="sup-reach-overlay">
              <div className="sup-reach-zone-easy">
                <span className="sup-reach-label" style={{ top: 8 }}>
                  Easy reach (thumb)
                </span>
              </div>
              <div className="sup-reach-zone-stretch">
                <span className="sup-reach-label">Stretch zone</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function phoneClock(t: TimeOfDay): string {
  switch (t) {
    case '7am':
      return '7:02 AM';
    case '11am':
      return '11:14 AM';
    case '3pm':
      return '3:08 PM';
    case '11pm':
      return '11:42 PM';
  }
}
