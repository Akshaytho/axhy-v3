/**
 * HR invite-member page — /hr/memberships/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 15
 *
 * Server component. Gates on HR role, renders the heading and the client
 * InviteForm which owns its own useActionState wiring. All validation,
 * mutation, and revalidation lives in ./actions.ts.
 *
 * @derives(master-plan §G)
 */

import { requireRole } from '../../../../lib/auth';

import { InviteForm } from './InviteForm';

/**
 * Server page for the invite-member form.
 *
 * @derives(master-plan §G)
 */
export default async function HrInviteMembershipPage() {
  await requireRole('HR');
  return (
    <section>
      <h1>Invite member</h1>
      <p>
        Invite an HR or Supervisor user by phone. They will be activated immediately and can log in
        with the phone number you provide.
      </p>
      <InviteForm />
    </section>
  );
}
