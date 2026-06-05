/**
 * Owner portal navigation — brand + section links + logout.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { LogoutButton } from './LogoutButton';
import styles from './owner.module.css';

const ITEMS = [
  { href: '/owner', label: 'Dashboard' },
  { href: '/system/map', label: 'System Map' },
  { href: '/system/graph', label: 'System Graph' },
];

/**
 * Persistent nav for /owner/*. Renders brand, section links, and logout.
 *
 * @derives(master-plan §G)
 */
export function OwnerNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>AXHY OWNER</div>
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
