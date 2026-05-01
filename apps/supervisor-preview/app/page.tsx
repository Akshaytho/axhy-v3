/**
 * Supervisor preview — main orchestrator.
 *
 * Renders the phone-frame container + debug strip + tab bar + active tab.
 * State for time-of-day rewind and reach overlay lives here.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import { ChatTab } from './_components/ChatTab';
import { TodayTab } from './_components/TodayTab';
import { SummaryTab } from './_components/SummaryTab';
import { UpdatesTab } from './_components/UpdatesTab';
import { ProfileTab } from './_components/ProfileTab';
import type { TimeOfDay } from './_lib/mock';

type TabKey = 'chat' | 'today' | 'summary' | 'updates' | 'profile';

const TABS: Array<{ key: TabKey; label: string; iconChar: string }> = [
  { key: 'chat', label: 'Chat', iconChar: 'C' },
  { key: 'today', label: 'Today', iconChar: 'T' },
  { key: 'summary', label: 'Summary', iconChar: 'S' },
  { key: 'updates', label: 'Updates', iconChar: 'U' },
  { key: 'profile', label: 'Profile', iconChar: 'P' },
];

const TIMES: Array<{ key: TimeOfDay; label: string }> = [
  { key: '7am', label: '7 AM' },
  { key: '11am', label: '11 AM' },
  { key: '3pm', label: '3 PM' },
  { key: '11pm', label: '11 PM' },
];

/** @derives(master-plan §G) */
export default function SupervisorPreviewPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('11am');
  const [showReach, setShowReach] = useState(false);

  return (
    <div className="sup-stage">
      <div className="sup-debug-strip">
        <strong>Supervisor preview</strong>
        <span>· Suresh @ Reddy Cleaning Services</span>
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
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={activeTab === t.key ? 'sup-tab is-on' : 'sup-tab'}
                onClick={() => setActiveTab(t.key)}
              >
                <span className="sup-tab-icon" aria-hidden="true">
                  {t.iconChar}
                </span>
                {t.label}
              </button>
            ))}
          </nav>
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
