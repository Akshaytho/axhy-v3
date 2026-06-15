import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { StateChip } from '../../../components/ui/Chip';
import { RefreshButton } from '../../../components/ui/RefreshButton';
import type { Overview, OverviewActivity } from '../data';

/** "5 hours ago" / "2 days ago" since an ISO timestamp (server now). */
function relativeAgo(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/** "2 days" / "7 hours" since an ISO timestamp — for "Oldest waiting" lines. */
function ago(iso: string | null): string {
  if (!iso) return '—';
  const hrs = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hrs < 1) return 'under an hour';
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''}`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

function greetingFor(now: Date): string {
  const h = Number(
    now.toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type ActivityView = { icon: string; tone: '' | 'ok' | 'bad' | 'accent'; text: ReactNode };

/** Turn a stored AuditEvent into the dashboard's icon + tone + sentence,
 * matching v6's activity styling. The key entity is bolded. */
function activityLine(e: OverviewActivity): ActivityView {
  const p = e.payload ?? {};
  const worker = typeof p.workerName === 'string' ? p.workerName : null;
  const site = typeof p.siteName === 'string' ? p.siteName : null;
  const sup = typeof p.supervisorName === 'string' ? p.supervisorName : null;
  const range = typeof p.dateRange === 'string' ? p.dateRange : null;
  const reason = typeof p.reason === 'string' ? p.reason : null;
  const b = (name: string | null): ReactNode => (name ? <b>{name}</b> : 'someone');

  switch (e.kind) {
    case 'LEAVE_APPROVED':
      return {
        icon: 'calCheck',
        tone: 'ok',
        text: (
          <>
            You approved {b(worker)}&apos;s leave{range ? `, ${range}` : ''}.
          </>
        ),
      };
    case 'LEAVE_REJECTED':
      return {
        icon: 'calX',
        tone: 'bad',
        text: (
          <>
            You rejected {b(worker)}&apos;s leave{range ? `, ${range}` : ''}.
          </>
        ),
      };
    case 'LEAVE_REQUESTED':
      return {
        icon: 'calendarOff',
        tone: 'accent',
        text: (
          <>
            {b(worker)} requested leave{range ? `, ${range}` : ''}.
          </>
        ),
      };
    case 'WORKER_CREATED':
      return {
        icon: 'userPlus',
        tone: 'accent',
        text: (
          <>
            You added {b(worker)}
            {site ? ` to ${site}` : ''}.
          </>
        ),
      };
    case 'WORKER_MARKED_ABSENT':
      return {
        icon: 'userX',
        tone: 'bad',
        text: (
          <>
            {b(worker)} was marked absent{site ? ` at ${site}` : ''}.
          </>
        ),
      };
    case 'WORKER_RESIGNED':
      return { icon: 'userX', tone: '', text: <>{b(worker)} was marked resigned.</> };
    case 'BINDING_ADDED':
      return {
        icon: 'shield',
        tone: '',
        text: (
          <>
            You bound {b(sup)} as supervisor{site ? ` at ${site}` : ''}.
          </>
        ),
      };
    case 'SITE_CREATED':
      return { icon: 'building', tone: '', text: <>You created site {b(site)}.</> };
    case 'SITE_COMPLAINT_LOGGED':
      return {
        icon: 'complaint',
        tone: 'bad',
        text: (
          <>
            Complaint logged{site ? ` at ${site}` : ''}
            {reason ? `: ${reason}` : ''}.
          </>
        ),
      };
    case 'VISIT_REJECTED':
      return {
        icon: 'calX',
        tone: 'bad',
        text: <>A check-in was flagged{site ? ` at ${site}` : ''}.</>,
      };
    case 'VISIT_RESOLVED':
      return {
        icon: 'checkCircle',
        tone: 'ok',
        text: <>A flagged check-in was cleared{site ? ` at ${site}` : ''}.</>,
      };
    case 'ASSIGNMENT_CREATED':
      return {
        icon: 'briefcase',
        tone: '',
        text: <>A new assignment was created{site ? ` at ${site}` : ''}.</>,
      };
    default: {
      const human = e.kind.toLowerCase().replace(/_/g, ' ');
      return {
        icon: 'check',
        tone: '',
        text: <>{human.charAt(0).toUpperCase() + human.slice(1)}.</>,
      };
    }
  }
}

/**
 * HR Dashboard — an exact port of the v6 home screen, fully backed by the real
 * `GET /hr/overview` aggregate: the today band, today's-visits, recent-activity
 * feed, your-sites panel and the leave/complaints cards all render live data.
 * Only the swap & reversal cards stay "Soon" — exactly the two spots v6 itself
 * marks "not live yet" (HR has no swap/reversal list endpoint yet).
 * @derives(master-plan §G)
 */
export function HrDashboard({ firstName, data }: { firstName: string; data: Overview }) {
  const now = new Date();
  const today = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  const stamp = now
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    .toLowerCase();

  const { counts, today: t, visits, sites, activity } = data;

  const todayFigs: Array<[string, number, string]> = [
    ['On site', t.onSite, 'var(--ok)'],
    ['No-show', t.noShow, 'var(--bad)'],
    ['On leave', t.onLeave, 'var(--ink-2)'],
    ['Flagged', t.flagged, 'var(--warn)'],
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">HR Workspace</div>
          <h1 className="page-title">
            {greetingFor(now)}, {firstName}
          </h1>
          <p className="page-sub">{today} · Here&apos;s what needs you across your sites today.</p>
        </div>
        <div className="head-actions">
          <span className="last-updated">
            <Icon name="clock" size={13} /> Updated {stamp}
          </span>
          <RefreshButton />
        </div>
      </div>

      {/* Today across your sites — real attendance + flagged visits */}
      <Link href="/hr/today" className="today-strip" style={{ width: '100%', textAlign: 'left' }}>
        <div className="ts-label">
          <Icon name="shield" size={17} /> Today across your sites
        </div>
        <div className="ts-figs">
          {todayFigs.map(([l, n, col], i) => (
            <span key={l} style={{ display: 'contents' }}>
              {i > 0 && <div className="ts-divider" />}
              <div className="ts-fig">
                <span className="n" style={{ color: col }}>
                  {n}
                </span>
                <span className="l">{l}</span>
              </div>
            </span>
          ))}
        </div>
        <span
          className="sc-chev"
          style={{ position: 'static', opacity: 1, transform: 'none', marginLeft: 14 }}
        >
          <Icon name="chevR" size={18} />
        </span>
      </Link>

      <div className="needs-grid">
        <Link href="/hr/leave-requests" className={`stat-card ${counts.leave > 0 ? 'attn' : ''}`}>
          <div className="sc-top">
            <span className="sc-icon">
              <Icon name="calendarOff" size={19} />
            </span>
            {counts.leave > 0 ? <span className="sc-attn-dot" /> : null}
          </div>
          <div className={`sc-count ${counts.leave === 0 ? 'zero' : ''}`}>{counts.leave}</div>
          <div className="sc-title">Pending leave</div>
          <div className="sc-oldest">
            {counts.leave > 0 ? (
              <>
                <Icon name="clock" size={13} />{' '}
                <span className="o-amber">Oldest waiting {ago(counts.oldestLeaveAt)}</span>
              </>
            ) : (
              <span className="muted">All clear</span>
            )}
          </div>
          <span className="sc-chev">
            <Icon name="chevR" size={18} />
          </span>
        </Link>

        <Link href="/hr/complaints" className={`stat-card ${counts.complaints > 0 ? 'attn' : ''}`}>
          <div className="sc-top">
            <span className="sc-icon">
              <Icon name="complaint" size={19} />
            </span>
            {counts.hasHighComplaint ? (
              <span className="chip chip-warn chip-sm">
                <span className="dot" />1 HIGH
              </span>
            ) : counts.complaints > 0 ? (
              <span className="sc-attn-dot" />
            ) : null}
          </div>
          <div className={`sc-count ${counts.complaints === 0 ? 'zero' : ''}`}>
            {counts.complaints}
          </div>
          <div className="sc-title">Open complaints</div>
          <div className="sc-oldest">
            {counts.complaints > 0 ? (
              <>
                <Icon name="clock" size={13} />{' '}
                <span className="o-amber">Oldest waiting {ago(counts.oldestComplaintAt)}</span>
              </>
            ) : (
              <span className="muted">All clear</span>
            )}
          </div>
          <span className="sc-chev">
            <Icon name="chevR" size={18} />
          </span>
        </Link>

        {[
          { key: 'swaps', title: 'Swap requests', icon: 'swap' },
          { key: 'reversals', title: 'Reversal requests', icon: 'undo' },
        ].map((c) => (
          <div key={c.key} className="stat-card soon">
            <div className="sc-top">
              <span className="sc-icon">
                <Icon name={c.icon} size={19} />
              </span>
              <span className="coming-soon-tag">Soon</span>
            </div>
            <div className="sc-count soon-count">—</div>
            <div className="sc-title">{c.title}</div>
            <div className="sc-oldest">
              <span className="muted">HR list endpoint not live yet</span>
            </div>
          </div>
        ))}
      </div>

      {/* Today's visits — real verified / flagged / total scheduled */}
      <Link href="/hr/record" className="today-strip" style={{ marginBottom: 4 }}>
        <div className="ts-label">
          <Icon name="checkCircle" size={17} /> Today&apos;s visits
        </div>
        <div className="ts-figs">
          <div className="ts-fig">
            <span className="n" style={{ color: 'var(--ok)' }}>
              {visits.verified}
            </span>
            <span className="l">
              <span className="dot" style={{ background: 'var(--ok)' }} /> Verified
            </span>
          </div>
          <div className="ts-divider" />
          <div className="ts-fig">
            <span className="n" style={{ color: 'var(--warn)' }}>
              {visits.flagged}
            </span>
            <span className="l">
              <span className="dot" style={{ background: 'var(--warn)' }} /> Flagged
            </span>
          </div>
          <div className="ts-divider" />
          <div className="ts-fig">
            <span className="n">{visits.total}</span>
            <span className="l">Total scheduled</span>
          </div>
        </div>
        <span
          className="sc-chev"
          style={{ position: 'static', opacity: 1, transform: 'none', marginLeft: 4 }}
        >
          <Icon name="chevR" size={18} />
        </span>
      </Link>

      <div className="dash-cols">
        <div className="panel">
          <div className="panel-head">
            <h3>Recent activity</h3>
            <Link href="/hr/record" className="text-link" style={{ fontSize: 13 }}>
              View record
            </Link>
          </div>
          <div className="panel-body">
            {activity.length === 0 ? (
              <div className="oversight-banner" style={{ margin: 12 }}>
                <Icon name="clock" size={17} />
                <div>No recent activity across your sites yet.</div>
              </div>
            ) : (
              activity.map((e) => {
                const v = activityLine(e);
                return (
                  <div key={e.id} className="activity-row">
                    <span className={`act-icon ${v.tone}`}>
                      <Icon name={v.icon} size={16} />
                    </span>
                    <div className="act-body">
                      <div className="act-text">{v.text}</div>
                      <div className="act-time">{relativeAgo(e.createdAt)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Your sites</h3>
            <Link href="/hr/sites" className="text-link" style={{ fontSize: 13 }}>
              Manage
            </Link>
          </div>
          <div className="panel-body">
            {sites.slice(0, 4).map((s) => (
              <Link
                key={s.id}
                href="/hr/sites"
                className="activity-row"
                style={{ cursor: 'pointer' }}
              >
                <span className="act-icon">
                  <Icon name="building" size={16} />
                </span>
                <div className="act-body">
                  <div className="act-text" style={{ fontWeight: 600 }}>
                    {s.name}
                  </div>
                  <div className="act-time" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    {s.workers} worker{s.workers !== 1 ? 's' : ''} · {s.supervisors} supervisor
                    {s.supervisors !== 1 ? 's' : ''}
                  </div>
                </div>
                <StateChip state={s.state} sm />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
