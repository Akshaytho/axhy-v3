/**
 * HR portal navigation — brand + section links + logout.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 13
 *
 * Server component for the link list; logout is a tiny client component
 * because the browser cannot send a DELETE method from an HTML <form>.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { LogoutButton } from './LogoutButton';
import styles from './hr.module.css';

const ITEMS = [
  { href: '/hr', label: 'Dashboard' },
  { href: '/hr/memberships', label: 'Memberships' },
  { href: '/hr/workers', label: 'Workers' },
  { href: '/hr/sites', label: 'Sites' },
  { href: '/hr/leave-requests', label: 'Leave requests' },
];

/**
 * Persistent nav for /hr/*. Renders brand, section links, and logout.
 *
 * @derives(master-plan §G)
 */
export function HrNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>AXHY HR</div>
      <ul className={styles.navList}>
        {ITEMS.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className={styles.navLink}>
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className={styles.logout}>
        <LogoutButton />
      </div>
    </nav>
  );
}
