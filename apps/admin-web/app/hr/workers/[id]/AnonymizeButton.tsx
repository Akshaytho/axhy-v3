/**
 * Anonymize-worker confirm button — client component for /hr/workers/[id].
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Renders a "Anonymize worker" button that opens a native <dialog> modal
 * with a required reason textarea (maxLength 500) plus Cancel/Confirm
 * actions. The confirm calls the anonymizeWorker server action. A useTransition
 * pending flag disables the buttons while the request is in flight, and any
 * error message is rendered inside the modal so HR sees it before closing.
 *
 * Native <dialog> is used over a custom overlay because it gives free focus
 * trap + Escape-to-close + backdrop semantics with no extra deps.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useRef, useState, useTransition } from 'react';

import styles from '../styles.module.css';

import { anonymizeWorker } from './actions';

/**
 * Button + dialog that walks HR through the anonymize confirm step.
 *
 * @derives(master-plan §G)
 */
export function AnonymizeButton({ workerId }: { workerId: string }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = () => {
    setReason('');
    setError(null);
    dialogRef.current?.showModal();
  };
  const close = () => {
    dialogRef.current?.close();
  };
  const submit = () => {
    if (!reason.trim()) {
      setError('Please enter a reason.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await anonymizeWorker(workerId, reason.trim());
      if (result.ok) {
        close();
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <>
      <button type="button" onClick={open} className={styles.dangerBtn}>
        Anonymize worker
      </button>
      <dialog ref={dialogRef} className={styles.modal}>
        <h2 className={styles.modalTitle}>Anonymize this worker?</h2>
        <p className={styles.modalText}>
          The worker&apos;s phone will be replaced with an anonymized hash so PII is removed from
          the active record. This cannot be undone.
        </p>
        <label htmlFor="reason" className={styles.label}>
          Reason (required, max 500 chars)
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={styles.textarea}
        />
        {error ? (
          <div className={styles.error} role="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}
        <div className={styles.modalActions}>
          <button type="button" onClick={close} disabled={isPending} className={styles.modalCancel}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className={styles.modalConfirm}
          >
            {isPending ? 'Anonymizing…' : 'Confirm'}
          </button>
        </div>
      </dialog>
    </>
  );
}
