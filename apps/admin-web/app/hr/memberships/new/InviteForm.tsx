/**
 * HR invite-member form — client component for /hr/memberships/new.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 15
 *
 * Uses React 19's useActionState to wire the inviteMembership server action.
 * Validates locally via HTML attributes (required, pattern, maxLength) for
 * fast feedback; the server action re-validates with Zod before calling the
 * backend. Errors and success surface above the submit button.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import styles from '../styles.module.css';

import { inviteMembership, type InviteMembershipState } from './actions';

const INITIAL_STATE: InviteMembershipState = { ok: null };

/**
 * Submit button that reacts to <form> pending status.
 *
 * @derives(master-plan §G)
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.submit}>
      {pending ? 'Sending…' : 'Invite member'}
    </button>
  );
}

/**
 * Client form for inviting a HR/SUPERVISOR membership.
 *
 * @derives(master-plan §G)
 */
export function InviteForm() {
  const [state, formAction] = useActionState(inviteMembership, INITIAL_STATE);
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
        <label htmlFor="role" className={styles.label}>
          Role
        </label>
        <select id="role" name="role" required className={styles.select} defaultValue="">
          <option value="" disabled>
            Select a role
          </option>
          <option value="HR">HR</option>
          <option value="SUPERVISOR">Supervisor</option>
        </select>
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
        <label htmlFor="podId" className={styles.label}>
          Pod ID (optional UUID)
        </label>
        <input id="podId" name="podId" type="text" className={styles.input} autoComplete="off" />
      </div>
      {state.ok === false && state.message ? (
        <div className={styles.error} role="alert">
          {state.message}
        </div>
      ) : null}
      {state.ok === true ? (
        <div className={styles.success} role="status">
          Member invited successfully.
        </div>
      ) : null}
      <SubmitButton />
    </form>
  );
}
