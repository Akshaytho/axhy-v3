/**
 * HR add-binding form — client component for /hr/sites/[id]/bindings/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 18
 *
 * Uses React 19's useActionState to wire the createBinding server action.
 * `siteId` is passed both as a prop (for display/scoping) and as a hidden
 * input (so the server action sees it in FormData). Local HTML validation
 * is intentionally lightweight — the server action re-validates the entire
 * body with Zod (including the actingForUserId ↔ effectiveUntil refinement)
 * before calling the backend.
 *
 * On success the server action redirects to /hr/sites/:id; this client is
 * unmounted by the redirect and never shows a success state.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import styles from '../../../styles.module.css';

import { createBinding, type CreateBindingState } from './actions';

const INITIAL_STATE: CreateBindingState = { ok: null };

const UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Submit button reacting to <form> pending status.
 *
 * @derives(master-plan §G)
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.submit}>
      {pending ? 'Adding…' : 'Add binding'}
    </button>
  );
}

/**
 * Client form for adding a supervisor binding to a Site.
 *
 * @derives(master-plan §G)
 */
export function BindingForm({ siteId }: { siteId: string }) {
  const [state, formAction] = useActionState(createBinding, INITIAL_STATE);
  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="siteId" value={siteId} />
      <div className={styles.field}>
        <label htmlFor="supervisorUserId" className={styles.label}>
          Supervisor user id (UUID)
        </label>
        <input
          id="supervisorUserId"
          name="supervisorUserId"
          type="text"
          required
          pattern={UUID_PATTERN}
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="effectiveFrom" className={styles.label}>
          Effective from
        </label>
        <input
          id="effectiveFrom"
          name="effectiveFrom"
          type="datetime-local"
          required
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="effectiveUntil" className={styles.label}>
          Effective until (optional, required if Acting-for is set)
        </label>
        <input
          id="effectiveUntil"
          name="effectiveUntil"
          type="datetime-local"
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="actingForUserId" className={styles.label}>
          Acting-for user id (optional, UUID)
        </label>
        <input
          id="actingForUserId"
          name="actingForUserId"
          type="text"
          pattern={UUID_PATTERN}
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="reason" className={styles.label}>
          Reason
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          maxLength={1000}
          className={styles.textarea}
          autoComplete="off"
        />
      </div>
      {state.ok === false && state.message ? (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      ) : null}
      <SubmitButton />
    </form>
  );
}
