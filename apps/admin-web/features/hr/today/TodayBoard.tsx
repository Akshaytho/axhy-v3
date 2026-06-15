'use client';

import { useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Avatar, NoSitesEmpty } from '../../../components/ui/primitives';
import { fmtTime12 } from '../../../lib/format';
import type { TodayBoard as TodayBoardData } from '../data';

/** ISO → `2:15 pm` (Asia/Kolkata). */
function timeOf(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    .toLowerCase();
}

/**
 * Today board — live coverage across owned sites, fully backed by GET /hr/today
 * (attendance + flagged visits + assignments + bindings). No preview banner:
 * every figure is real. Tap "No-show" or "Flagged" to focus.
 * @derives(master-plan §G)
 */
export function TodayBoard({ data }: { data: TodayBoardData }) {
  const { pulse, sites, noShows } = data;
  const [focus, setFocus] = useState<null | 'noShow' | 'flagged'>(null);
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  const tiles: Array<{
    key: 'onSite' | 'late' | 'noShow' | 'onLeave' | 'flagged';
    label: string;
    n: number;
    tone: string;
    tap?: boolean;
  }> = [
    { key: 'onSite', label: 'On site', n: pulse.onSite, tone: 'ok' },
    { key: 'late', label: 'Running late', n: pulse.late, tone: 'warn' },
    { key: 'noShow', label: 'No-show', n: pulse.noShow, tone: 'bad', tap: true },
    { key: 'onLeave', label: 'On leave', n: pulse.onLeave, tone: 'neutral' },
    { key: 'flagged', label: 'Flagged', n: pulse.flagged, tone: 'warn', tap: true },
  ];
  const sitesShown = focus === 'flagged' ? sites.filter((s) => s.flagged > 0) : sites;
  const hasSites = sites.length > 0;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations · Today</div>
          <h1 className="page-title">Today</h1>
          <p className="page-sub">
            {today} · Live coverage across your sites. Who&apos;s in, who&apos;s out, where
            there&apos;s a gap.
          </p>
        </div>
        <div className="head-actions">
          <span className="last-updated">
            <Icon name="clock" size={13} /> As of {timeOf(pulse.asOf)}
          </span>
        </div>
      </div>

      {!hasSites ? (
        <NoSitesEmpty />
      ) : (
        <>
          <div className="pulse-band">
            {tiles.map((t) => (
              <button
                key={t.key}
                className={`pulse-tile ${t.tone} ${t.tap ? 'tap' : ''} ${focus === t.key ? 'on' : ''}`}
                onClick={
                  t.tap
                    ? () => setFocus((f) => (f === t.key ? null : (t.key as 'noShow' | 'flagged')))
                    : undefined
                }
                type="button"
              >
                <div className="pt-n">{t.n}</div>
                <div className="pt-l">{t.label}</div>
                {t.tap && (
                  <span className="pt-hint">{focus === t.key ? 'Showing' : 'Tap to focus'}</span>
                )}
              </button>
            ))}
          </div>

          {focus === 'noShow' ? (
            <NoShowList noShows={noShows} onClear={() => setFocus(null)} />
          ) : (
            <>
              {focus === 'flagged' && (
                <div className="focus-note">
                  <Icon name="alert" size={15} /> Showing sites with flagged visits.{' '}
                  <button className="text-link" onClick={() => setFocus(null)} type="button">
                    Clear
                  </button>
                </div>
              )}
              <div className="tbl-wrap responsive">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th className="tnum">Assigned</th>
                      <th className="tnum">In</th>
                      <th className="tnum">Absent</th>
                      <th className="tnum">On leave</th>
                      <th className="tnum">Uncovered</th>
                      <th className="tnum">Flagged</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sitesShown.map((s) => (
                      <tr
                        key={s.siteId}
                        onClick={() => (window.location.href = `/hr/sites/${s.siteId}`)}
                      >
                        <td className="cell-primary">{s.site}</td>
                        <td className="tnum cell-mono">{s.assigned}</td>
                        <td
                          className="tnum cell-mono"
                          style={{ color: 'var(--ok)', fontWeight: 600 }}
                        >
                          {s.present}
                        </td>
                        <td
                          className="tnum cell-mono"
                          style={
                            s.absentNoCall > 0
                              ? { color: 'var(--warn)', fontWeight: 600 }
                              : { color: 'var(--ink-4)' }
                          }
                        >
                          {s.absentNoCall || '—'}
                        </td>
                        <td className="tnum cell-mono dim">{s.onLeave || '—'}</td>
                        <td className="tnum">
                          {s.uncovered > 0 ? (
                            <Chip tone="warn" sm>
                              {s.uncovered} gap
                            </Chip>
                          ) : (
                            <span className="cell-mono dim">—</span>
                          )}
                        </td>
                        <td className="tnum">
                          {s.flagged > 0 ? (
                            <Chip tone="warn" sm dot={false}>
                              {s.flagged}
                            </Chip>
                          ) : (
                            <span className="cell-mono dim">—</span>
                          )}
                        </td>
                        <td className="chev-cell">
                          <Icon name="chevR" size={16} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mcard-list">
                {sitesShown.map((s) => (
                  <div
                    key={s.siteId}
                    className="mcard"
                    onClick={() => (window.location.href = `/hr/sites/${s.siteId}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="act-icon">
                      <Icon name="building" size={16} />
                    </span>
                    <div className="mc-main">
                      <div className="mc-title">{s.site}</div>
                      <div className="mc-sub">
                        <span className="mono">
                          {s.present}/{s.assigned} in
                        </span>
                        {s.uncovered > 0 && (
                          <Chip tone="warn" sm>
                            {s.uncovered} gap
                          </Chip>
                        )}
                        {s.flagged > 0 && (
                          <Chip tone="warn" sm dot={false}>
                            {s.flagged} flagged
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function NoShowList({
  noShows,
  onClear,
}: {
  noShows: TodayBoardData['noShows'];
  onClear: () => void;
}) {
  if (noShows.length === 0)
    return (
      <div className="allcaught">
        <Icon name="checkCircle" size={22} />
        <div>
          <b>No no-shows.</b> Everyone on roster has checked in or is on approved leave.{' '}
          <button className="text-link" onClick={onClear} type="button">
            Back to all sites
          </button>
        </div>
      </div>
    );
  return (
    <>
      <div className="focus-note">
        <Icon name="alert" size={15} /> {noShows.length} worker{noShows.length !== 1 ? 's' : ''}{' '}
        {noShows.length !== 1 ? 'haven’t' : 'hasn’t'} checked in.{' '}
        <button className="text-link" onClick={onClear} type="button">
          Back to all sites
        </button>
      </div>
      <div className="leave-layout">
        {noShows.map((n, i) => (
          <div
            key={i}
            className="lv-card"
            style={{ cursor: 'default', borderLeftColor: 'var(--bad)' }}
          >
            <Avatar name={n.worker} />
            <div className="lv-main">
              <div className="lv-name">
                {n.worker}{' '}
                <Chip tone="warn" sm>
                  No-show
                </Chip>
              </div>
              <div className="lv-dates">
                <Icon name="mapPin" size={14} /> {n.site}{' '}
                <span className="days">· no-show since {fmtTime12(n.since)}</span>
              </div>
              <div className="lv-reason">Supervisor: {n.supervisor}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="helper" style={{ marginTop: 12 }}>
        HR doesn&apos;t mark attendance — the supervisor does. Follow up with them on no-shows.
      </p>
    </>
  );
}
