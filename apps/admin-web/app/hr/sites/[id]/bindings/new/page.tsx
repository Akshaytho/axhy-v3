/**
 * HR add-binding page — /hr/sites/[id]/bindings/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 18
 *
 * Server component. Gates on HR role, awaits the dynamic `id` segment, and
 * renders the client BindingForm with the site id wired in. All validation,
 * mutation, and revalidation lives in ./actions.ts.
 *
 * @derives(master-plan §G)
 */

import { requireRole } from '../../../../../../lib/auth';

import { BindingForm } from './BindingForm';

/**
 * Server page for the add-binding form.
 *
 * @derives(master-plan §G)
 */
export default async function HrAddBindingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('HR');
  const { id: siteId } = await params;
  return (
    <section>
      <h1>Add supervisor binding</h1>
      <p>
        Bind a supervisor to this site. If this binding is for an acting-for assignment, you must
        provide an effective-until date so the substitution does not linger.
      </p>
      <BindingForm siteId={siteId} />
    </section>
  );
}
