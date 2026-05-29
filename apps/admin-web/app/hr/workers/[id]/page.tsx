/**
 * HR worker detail page — /hr/workers/[id].
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Server component. Gates on HR role, then fetches /admin/workers/:id where
 * :id is Worker.id (the same id the list page produces). Renders a <dl> of
 * the worker fields. If the worker has anonymizedPhone === true (R3 already
 * applied) a "Resigned (anonymized)" badge replaces the anonymize button —
 * the action is idempotent on the backend but we hide it client-side to
 * keep the HR workflow honest.
 *
 * On ApiError(404): calls notFound() so Next renders the closest not-found.tsx.
 *
 * Next 15: params is a Promise — awaited at start.
 *
 * @derives(master-plan §G)
 */

import { notFound } from 'next/navigation';

import { fetchJson, ApiError } from '../../../../lib/api';
import { requireRole } from '../../../../lib/auth';
import styles from '../styles.module.css';

import { AnonymizeButton } from './AnonymizeButton';

type WorkerDetail = {
  workerId: string;
  userId: string;
  membershipId: string;
  status: string;
  podId: string | null;
  name: string;
  phone: string;
  anonymizedPhone: boolean;
  createdAt: string;
};

/**
 * Fetch one worker; translate 404 into Next.js notFound().
 *
 * @derives(master-plan §G)
 */
async function loadWorker(id: string): Promise<WorkerDetail> {
  try {
    return await fetchJson<WorkerDetail>(`/admin/workers/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

/**
 * Worker detail server component.
 *
 * @derives(master-plan §G)
 */
export default async function HrWorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('HR');
  const { id } = await params;
  const worker = await loadWorker(id);
  return (
    <section>
      <h1>{worker.name}</h1>
      {worker.anonymizedPhone ? <div className={styles.badge}>Resigned (anonymized)</div> : null}
      <dl className={styles.detail}>
        <dt>Worker ID</dt>
        <dd>{worker.workerId}</dd>
        <dt>Phone</dt>
        <dd>{worker.phone}</dd>
        <dt>Status</dt>
        <dd>{worker.status}</dd>
        <dt>Pod</dt>
        <dd>{worker.podId ?? '—'}</dd>
        <dt>Created</dt>
        <dd>{new Date(worker.createdAt).toISOString()}</dd>
      </dl>
      {worker.anonymizedPhone ? null : <AnonymizeButton workerId={worker.workerId} />}
    </section>
  );
}
