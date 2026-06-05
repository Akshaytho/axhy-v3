/**
 * Homepage router `/` — Redirects users to their corresponding role portal
 * (HR portal or Owner portal) based on active session, or gates with login.
 * Removes the old marketing landing page stub.
 *
 * @derives(master-plan §G)
 */

import { redirect } from 'next/navigation';

import { getSession } from '../lib/auth';

/**
 * Root home page component. Gates access and redirects.
 *
 * @derives(master-plan §G)
 */
export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'HR') {
    redirect('/hr');
  }

  // Owner, Super Admin, or Company Admin defaults to Owner portal
  redirect('/owner');
}
