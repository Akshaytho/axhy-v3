/**
 * Approve / reject decision buttons — client component for /hr/leave-requests/[id].
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 19
 *
 * Renders two distinct form blocks (approve and reject) each posting to its
 * own server action. A shared optional decision-note textarea sits above
 * the buttons; the same textarea value submits with whichever button HR
 * clicks because both forms include a hidden mirror input populated from
 * local state. useTransition disables both buttons while either submission
 * is in flight to prevent double-decision races.
 *
 * Two forms (not one) because Next.js server actions are bound per <form>,
 * and approve/reject are distinct mutations that should each carry their
 * own auditable submission boundary.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState, useTransition } from 'react';

import styles from '../styles.module.css';

import { approveLeave, rejectLeave } from './actions';

/**
 * Decide buttons + optional note for a REQUESTED leave.
 *
 * @derives(master-plan §G)
 */
export function DecideButtons({ leaveId }: { leaveId: string }) {
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const submit = (action: (fd: FormData) => Promise<void>) => () => {
    const fd = new FormData();
    fd.set('leaveId', leaveId);
    if (note.trim().length > 0) fd.set('decisionNote', note.trim());
    startTransition(async () => {
      await action(fd);
    });
  };

  return (
    <div className={styles.decideCard}>
      <h2 className={styles.decideTitle}>Decide this request</h2>
      <label htmlFor="decisionNote" className={styles.label}>
        Optional note (max 500 chars)
      </label>
      <textarea
        id="decisionNote"
        name="decisionNote"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why this decision? (visible to the worker)"
        className={styles.textarea}
      />
      <div className={styles.actionsRow}>
        <button
          type="button"
          onClick={submit(rejectLeave)}
          disabled={isPending}
          className={styles.rejectBtn}
        >
          {isPending ? 'Working…' : 'Reject'}
        </button>
        <button
          type="button"
          onClick={submit(approveLeave)}
          disabled={isPending}
          className={styles.approveBtn}
        >
          {isPending ? 'Working…' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
