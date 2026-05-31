/**
 * HR create-site form — client component for /hr/sites/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 17
 *
 * Uses React 19's useActionState to wire the createSite server action.
 * Validates locally via HTML attributes (required, pattern, min/max) for
 * fast feedback; the server action re-validates with Zod before calling
 * the backend. Errors surface above the submit button. On success the
 * server action redirects to /hr/sites/:id — this client never sees the
 * success state because it is unmounted by the redirect.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import styles from '../styles.module.css';

import { createSite, type CreateSiteState } from './actions';

const INITIAL_STATE: CreateSiteState = { ok: null };

/**
 * Submit button reacting to <form> pending status.
 *
 * @derives(master-plan §G)
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.submit}>
      {pending ? 'Creating…' : 'Create site'}
    </button>
  );
}

/**
 * Client form for creating a Site.
 *
 * @derives(master-plan §G)
 */
export function SiteForm() {
  const [state, formAction] = useActionState(createSite, INITIAL_STATE);
  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="address" className={styles.label}>
          Address (optional)
        </label>
        <textarea
          id="address"
          name="address"
          maxLength={500}
          className={styles.textarea}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="latitude" className={styles.label}>
          Latitude (optional)
        </label>
        <input
          id="latitude"
          name="latitude"
          type="number"
          min={-90}
          max={90}
          step="any"
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="longitude" className={styles.label}>
          Longitude (optional)
        </label>
        <input
          id="longitude"
          name="longitude"
          type="number"
          min={-180}
          max={180}
          step="any"
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="workdays" className={styles.label}>
          Workdays (optional)
        </label>
        <input
          id="workdays"
          name="workdays"
          type="text"
          pattern="[MTWFSU_]{7}"
          maxLength={7}
          defaultValue="MTWTFS_"
          className={styles.input}
          autoComplete="off"
        />
        <span className={styles.hint}>M T W T F S U — use _ for off days</span>
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
