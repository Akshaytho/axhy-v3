/**
 * HR portal shell layout. Routing-layer only: gate to the HR role, hydrate the
 * signed-in identity, and render the shared <AppShell> with HR's nav. All HR
 * pages render inside this shell. Closed-by-default — requireRole redirects to
 * /login (no session) or /forbidden (wrong role) before any child renders.
 *
 * @derives(master-plan §G)
 */

import type { ReactNode } from 'react';

import { AppShell, type ShellMe } from '../../components/shell/AppShell';
import { getNavBadges } from '../../features/hr/data';
import { HR_NAV } from '../../features/hr/nav';
import { requireRole } from '../../lib/auth';
import { getMe } from '../../lib/me';
import '../../styles/portal.css';

export default async function HrLayout({ children }: { children: ReactNode }) {
  await requireRole('HR');

  // Hydrate the sidebar/topbar identity + nav badges. The shell still renders
  // with safe fallbacks if a call is momentarily unavailable, so a transient
  // backend blip never blanks the whole portal.
  let me: ShellMe = { name: 'HR', phone: '', company: '' };
  let badges: Record<string, number> = {};
  const [meRes, badgeRes] = await Promise.allSettled([getMe(), getNavBadges()]);
  if (meRes.status === 'fulfilled') {
    me = {
      name: meRes.value.user?.name ?? 'HR',
      phone: meRes.value.user?.phone ?? '',
      company: meRes.value.activeCompany?.name ?? '',
    };
  }
  if (badgeRes.status === 'fulfilled') badges = badgeRes.value;

  return (
    <AppShell nav={HR_NAV} me={me} badges={badges}>
      {children}
    </AppShell>
  );
}
