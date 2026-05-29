/**
 * HR portal shell layout — gates the entire /hr subtree to HR role and
 * renders the persistent nav + main area for every HR page.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 13
 *
 * Closed-by-default: requireRole('HR') redirects to /login (no session)
 * or /forbidden (wrong role) before any child renders.
 *
 * @derives(master-plan §G)
 */

import type { ReactNode } from 'react';

import { requireRole } from '../../lib/auth';

import { HrNav } from './Nav';
import styles from './hr.module.css';

/**
 * Server component layout for /hr/*. Awaits role gate, then renders chrome.
 *
 * @derives(master-plan §G)
 */
export default async function HrLayout({ children }: { children: ReactNode }) {
  await requireRole('HR');
  return (
    <div className={styles.shell}>
      <HrNav />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
