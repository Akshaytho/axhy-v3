/**
 * HR invite-worker page — /hr/workers/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Server component. Gates on HR role, renders the heading and the client
 * WorkerForm which owns its own useActionState wiring. All validation,
 * mutation, and revalidation lives in ./actions.ts.
 *
 * @derives(master-plan §G)
 */

import { requireRole } from '../../../../lib/auth';

import { WorkerForm } from './WorkerForm';

/**
 * Server page for the invite-worker form.
 *
 * @derives(master-plan §G)
 */
export default async function HrInviteWorkerPage() {
  await requireRole('HR');
  return (
    <section>
      <h1>Invite worker</h1>
      <p>
        Invite a cleaner by phone. The worker is created in PENDING_ACTIVATION state and activated
        on first login.
      </p>
      <WorkerForm />
    </section>
  );
}
