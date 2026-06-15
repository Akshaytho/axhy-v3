import type { NavConfig } from '../../components/shell/AppShell';

/**
 * HR portal navigation — the only place HR's sidebar is defined. Adding a
 * screen = add one entry here + its route under app/hr. Icons are keys into
 * the shared icon set (components/ui/icons.ts).
 * @derives(master-plan §G)
 */
export const HR_NAV: NavConfig = {
  home: '/hr',
  main: [
    { key: 'home', label: 'Home', icon: 'home', href: '/hr' },
    { key: 'today', label: 'Today', icon: 'shield', href: '/hr/today' },
    { key: 'workers', label: 'Workers', icon: 'users', href: '/hr/workers' },
    { key: 'sites', label: 'Sites', icon: 'building', href: '/hr/sites' },
    { key: 'leave', label: 'Leave', icon: 'calendarOff', href: '/hr/leave-requests' },
    { key: 'complaints', label: 'Complaints', icon: 'complaint', href: '/hr/complaints' },
    { key: 'swaps', label: 'Swaps', icon: 'swap', href: '/hr/swaps' },
    { key: 'reversals', label: 'Reversals', icon: 'undo', href: '/hr/reversals' },
  ],
  more: [
    { key: 'payroll', label: 'Payroll', icon: 'briefcase', href: '/hr/payroll' },
    { key: 'policies', label: 'Policies', icon: 'bookOpen', href: '/hr/policies' },
    { key: 'updates', label: 'Updates', icon: 'megaphone', href: '/hr/updates' },
    { key: 'team', label: 'Team', icon: 'userCog', href: '/hr/memberships' },
    { key: 'record', label: 'Record', icon: 'archive', href: '/hr/record' },
    { key: 'settings', label: 'Settings', icon: 'sliders', href: '/hr/settings' },
  ],
};
