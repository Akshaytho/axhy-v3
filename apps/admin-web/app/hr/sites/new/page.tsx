/**
 * HR create-site page — /hr/sites/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 17
 *
 * Server component. Gates on HR role, renders the heading and the client
 * SiteForm which owns its own useActionState wiring. All validation,
 * mutation, and revalidation lives in ./actions.ts.
 *
 * @derives(master-plan §G)
 */

import { requireRole } from '../../../../lib/auth';

import { SiteForm } from './SiteForm';

/**
 * Server page for the create-site form.
 *
 * @derives(master-plan §G)
 */
export default async function HrCreateSitePage() {
  await requireRole('HR');
  return (
    <section>
      <h1>New site</h1>
      <p>
        Create a facility. The site is created in DRAFT state; supervisor bindings can be added on
        the detail page once created.
      </p>
      <SiteForm />
    </section>
  );
}
