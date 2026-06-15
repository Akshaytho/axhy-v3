'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Icon } from '../ui/Icon';

/**
 * One sidebar entry. `icon` is a key into the shared icon set.
 * @derives(master-plan §G)
 */
export type NavItem = { key: string; label: string; icon: string; href: string };

/**
 * Portal nav config — `main` + `more` groups, and which href is the portal root.
 * @derives(master-plan §G)
 */
export type NavConfig = { main: NavItem[]; more: NavItem[]; home: string };

/**
 * Identity shown in the sidebar foot + topbar company chip.
 * @derives(master-plan §G)
 */
export type ShellMe = { name: string; phone: string; company: string };

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/**
 * Portal-agnostic application shell (sidebar + topbar) shared by every web
 * portal. Pass the portal's `nav` config + the signed-in `me`; routing/active
 * state is derived from the current path. Add a portal by supplying a new
 * NavConfig — no shell changes needed.
 * @derives(master-plan §G)
 */
export function AppShell({
  nav,
  me,
  badges,
  children,
}: {
  nav: NavConfig;
  me: ShellMe;
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = [...nav.main, ...nav.more];
  const isActive = (href: string) =>
    href === nav.home
      ? pathname === nav.home
      : pathname === href || pathname.startsWith(href + '/');
  const active = items.find((it) => isActive(it.href));
  const title = active?.label ?? '';

  const NavLink = (it: NavItem) => {
    const on = isActive(it.href);
    const badge = badges?.[it.key] ?? 0;
    return (
      <Link
        key={it.key}
        href={it.href as never}
        className={`nav-item ${on ? 'active' : ''}`}
        aria-current={on ? 'page' : undefined}
      >
        <Icon name={it.icon} size={18} />
        {it.label}
        {badge > 0 ? <span className="nav-badge">{badge}</span> : null}
      </Link>
    );
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sb-brand">
          AXHY
          <span className="dot" />
          <span className="role">HR</span>
        </div>
        <nav className="sb-nav">
          {nav.main.map(NavLink)}
          <div className="sb-section">More</div>
          {nav.more.map(NavLink)}
        </nav>
        <div className="sb-foot">
          <div className="user-chip">
            <div className="avatar">{initials(me.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="u-name">{me.name}</div>
              <div className="u-meta">{me.phone}</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <div className="crumb">
            <span className="cur">{title}</span>
          </div>
          <div className="search">
            <Icon name="search" size={16} /> Search workers, sites…{' '}
            <span className="kbd">Soon</span>
          </div>
          <div className="topbar-right">
            <button className="icon-btn" title="Notifications" type="button">
              <Icon name="bell" size={18} />
            </button>
            <div className="company-chip">
              <span className="logo">{initials(me.company)}</span>
              {me.company}
            </div>
          </div>
        </header>
        <div className="scroll-area">{children}</div>
      </div>
    </div>
  );
}
