/**
 * Owner portal shell layout — gates the entire /owner subtree to OWNER role and
 * renders the persistent nav + main area for every Owner page.
 *
 * @derives(master-plan §G)
 */

import type { ReactNode } from 'react';

import { requireRole } from '../../lib/auth';

import { OwnerNav } from './Nav';
import styles from './owner.module.css';

/**
 * Server component layout for /owner/*. Awaits role gate, then renders chrome.
 *
 * @derives(master-plan §G)
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await requireRole('OWNER');
  return (
    <div className={styles.shell}>
      <OwnerNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
