/**
 * Supervisor preview — main orchestrator (rebuilt 2026-05-01 round 2).
 *
 * Renders phone-frame + debug strip + tab bar + active tab. Each tab now
 * answers ONE question per panel-locked redesign principle.
 *
 * Query param `?frame=off` drops the desktop phone-frame chrome for
 * founder full-bleed testing.
 *
 * @derives(master-plan §G)
 */

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { ChatTab } from './_components/ChatTab';
import { TodayTab } from './_components/TodayTab';
import { SummaryTab } from './_components/SummaryTab';
import { UpdatesTab } from './_components/UpdatesTab';
import { ProfileTab } from './_components/ProfileTab';
import type { TimeOfDay } from './_lib/mock';

type TabKey = 'chat' | 'today' | 'summary' | 'updates' | 'profile';

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

  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('11am');
  const [showReach, setShowReach] = useState(false);

  return (
    <div className={frameless ? 'sup-stage is-frameless' : 'sup-stage'}>
      <div className="sup-debug-strip">
        <strong>Supervisor preview</strong>
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

          <div className="sup-screen">
            {activeTab === 'chat' && <ChatTab timeOfDay={timeOfDay} />}
            {activeTab === 'today' && <TodayTab timeOfDay={timeOfDay} />}
            {activeTab === 'summary' && <SummaryTab timeOfDay={timeOfDay} />}
            {activeTab === 'updates' && <UpdatesTab timeOfDay={timeOfDay} />}
            {activeTab === 'profile' && <ProfileTab timeOfDay={timeOfDay} />}
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

          <nav className="sup-tabbar" aria-label="Supervisor tabs">
            <TabButton
              active={activeTab === 'chat'}
              label="Chat"
              icon={<ChatIcon />}
              onClick={() => setActiveTab('chat')}
            />
            <TabButton
              active={activeTab === 'today'}
              label="Today"
              icon={<TodayIcon />}
              onClick={() => setActiveTab('today')}
            />
            <TabButton
              active={activeTab === 'summary'}
              label="Summary"
              icon={<SummaryIcon />}
              onClick={() => setActiveTab('summary')}
            />
            <TabButton
              active={activeTab === 'updates'}
              label="Updates"
              icon={<UpdatesIcon />}
              onClick={() => setActiveTab('updates')}
            />
            <TabButton
              active={activeTab === 'profile'}
              label="Profile"
              icon={<ProfileIcon />}
              onClick={() => setActiveTab('profile')}
            />
          </nav>
        </div>
      </div>
    </div>
  );
}

/** @derives(master-plan §G) */
function TabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? 'sup-tab is-on' : 'sup-tab'} onClick={onClick}>
      <span className="sup-tab-icon-svg" aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
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

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M21 12a8 8 0 0 1-12.3 6.7L3 20l1.3-5.7A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function SummaryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 19V5M4 19h16M8 16V9M12 16v-4M16 16v-9" strokeLinecap="round" />
    </svg>
  );
}

function UpdatesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}
