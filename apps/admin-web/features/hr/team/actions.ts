/**
 * Server action for the HR Team screen — invite a supervisor.
 * Wraps POST /admin/memberships (AdminCreateMembershipInput). HR may invite
 * SUPERVISOR; baseSalaryPaise defaults to 0 (set later in payroll). 401 → /login.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { fetchJson, ApiError } from '../../../lib/api';
import type { TeamMemberDetail } from '../data';

/**
 * Invites a supervisor membership and revalidates the team screen.
 * @derives(master-plan §G)
 */
export async function inviteSupervisor(name: string, phone: string): Promise<void> {
  try {
    await fetchJson('/admin/memberships', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        role: 'SUPERVISOR',
        baseSalaryPaise: 0,
      }),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/memberships');
}

/**
 * On-demand member detail for the Team drill-in (client can't read the cookie).
 * @derives(master-plan §G)
 */
export async function fetchTeamMember(userId: string): Promise<TeamMemberDetail> {
  try {
    return await fetchJson<TeamMemberDetail>(`/hr/team/${encodeURIComponent(userId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
}

/**
 * Deactivates a staff member via POST /hr/team/:userId/deactivate (server-side:
 * status → INACTIVE + tokenEpoch bump, ending their sessions) and revalidates
 * the team screen. 401 → /login.
 * @derives(master-plan §G)
 */
export async function deactivateMember(userId: string): Promise<void> {
  try {
    await fetchJson(`/hr/team/${encodeURIComponent(userId)}/deactivate`, { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }
  revalidatePath('/hr/memberships');
}
