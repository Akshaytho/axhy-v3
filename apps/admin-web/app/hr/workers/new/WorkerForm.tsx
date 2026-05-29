/**
 * HR invite-worker form — client component for /hr/workers/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Uses React 19's useActionState to wire the inviteWorker server action.
 * Validates locally via HTML attributes (required, pattern, maxLength) for
 * fast feedback; the server action re-validates with Zod before calling
 * the backend. Errors surface above the submit button. On success the
 * server action redirects to /hr/workers — this client never sees the
 * success state because it is unmounted by the redirect.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import styles from '../styles.module.css';

import { inviteWorker, type InviteWorkerState } from './actions';

const INITIAL_STATE: InviteWorkerState = { ok: null };

/**
 * Submit button reacting to <form> pending status.
 *
 * @derives(master-plan §G)
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.submit}>
      {pending ? 'Sending…' : 'Invite worker'}
    </button>
  );
}

/**
 * Client form for inviting a Worker.
 *
 * @derives(master-plan §G)
 */
export function WorkerForm() {
  const [state, formAction] = useActionState(inviteWorker, INITIAL_STATE);
  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="phone" className={styles.label}>
          Phone (E.164, e.g. +919999900000)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          pattern="\+\d{10,15}"
          className={styles.input}
          autoComplete="off"
        />
      </div>
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
        <label htmlFor="baseSalaryPaise" className={styles.label}>
          Base salary (paise)
        </label>
        <input
          id="baseSalaryPaise"
          name="baseSalaryPaise"
          type="number"
          min={0}
          required
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="bankIfsc" className={styles.label}>
          Bank IFSC (optional)
        </label>
        <input
          id="bankIfsc"
          name="bankIfsc"
          type="text"
          maxLength={32}
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="bankAcct" className={styles.label}>
          Bank account (optional)
        </label>
        <input
          id="bankAcct"
          name="bankAcct"
          type="text"
          maxLength={64}
          className={styles.input}
          autoComplete="off"
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="preferredLanguage" className={styles.label}>
          Preferred language
        </label>
        <select
          id="preferredLanguage"
          name="preferredLanguage"
          className={styles.select}
          defaultValue="hi"
        >
          <option value="hi">Hindi</option>
          <option value="te">Telugu</option>
          <option value="ta">Tamil</option>
          <option value="kn">Kannada</option>
          <option value="en">English</option>
        </select>
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
