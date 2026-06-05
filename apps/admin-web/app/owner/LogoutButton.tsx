/**
 * Logout button — issues DELETE to /api/auth/session and navigates to /login.
 *
 * Client component because HTML forms cannot natively send DELETE.
 *
 * @derives(master-plan §G)
 */

'use client';

import styles from './owner.module.css';

/**
 * Renders a logout button that clears session cookies via DELETE then
 * hard-redirects to /login.
 *
 * @derives(master-plan §G)
 */
export function LogoutButton() {
  async function handleClick() {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } finally {
      window.location.assign('/login');
    }
  }
  return (
    <button type="button" onClick={handleClick} className={styles.logoutBtn}>
      Log out
    </button>
  );
}
