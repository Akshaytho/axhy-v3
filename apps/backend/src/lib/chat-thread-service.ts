/**
 * ChatThread 3-window service — app-layer count cap + race-safe creation.
 *
 * Per docs/locked/security-gaps-to-fix.md GAP 8 (BLOCKER) + the chat-sidebar
 * UX in docs/locked/chat-sidebar-context-flow.md, each supervisor may have
 * up to 3 ACTIVE threads (archivedAt IS NULL) per company. The 4th creation
 * attempt returns 409 THREAD_LIMIT_REACHED.
 *
 * The DB-level constraint (migration 014) drops the old single-thread
 * @@unique and adds a partial index for cheap active-only lookups. The
 * count cap itself is enforced here, inside a serializable transaction,
 * to handle concurrent "New thread" double-taps without ending up with 4
 * active rows.
 *
 * Why serializable (not a unique index with a count column): the
 * supervisor's realistic concurrency is just their own client double-
 * tapping; the contention is per-(companyId, supervisorId) and rare. A
 * serializable SELECT-then-INSERT is simpler than a generated-column-
 * with-row-number trick and behaves correctly under Postgres SSI.
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/security-gaps-to-fix.md GAP 8)
 * @derives(docs/locked/chat-sidebar-context-flow.md)
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 */

import type { Prisma } from '@prisma/client';

/** Locked-spec value. Not configurable per-tenant — every supervisor in
 *  every company has the same 3-thread floor. If a future tenant proves a
 *  business case for a different cap, move this to Policy table. */
export const MAX_ACTIVE_THREADS_PER_SUPERVISOR = 3;

/**
 * Stable error code for the 4th-thread case. Matches the HTTP 409 mapping
 * the chat-threads route returns to mobile.
 */
export class ThreadLimitReachedError extends Error {
  readonly code = 'THREAD_LIMIT_REACHED';
  constructor(
    public readonly companyId: string,
    public readonly supervisorId: string,
    public readonly currentActiveCount: number,
  ) {
    super(
      `Supervisor ${supervisorId} already has ${currentActiveCount} active threads (max ${MAX_ACTIVE_THREADS_PER_SUPERVISOR}). Archive a thread first.`,
    );
    this.name = 'ThreadLimitReachedError';
  }
}

export type CreateThreadInput = {
  companyId: string;
  supervisorId: string;
};

export type CreateThreadResult = {
  thread: {
    id: string;
    companyId: string;
    supervisorId: string;
    createdAt: Date;
    lastMessageAt: Date | null;
    archivedAt: Date | null;
  };
  activeCountAfterCreate: number;
};

/**
 * Create a new ACTIVE ChatThread for (companyId, supervisorId). Must run
 * inside a withTenantContext transaction — caller's responsibility.
 *
 * The 3-window check is a SELECT-COUNT-then-INSERT pair inside the same tx.
 * Postgres serialisable isolation guarantees: if two concurrent attempts
 * both see count=3 and try to insert a 4th, exactly one tx will commit and
 * the other will be aborted with a serialisation failure. The caller MUST
 * be ready to retry once on `40001 serialization_failure` (Fastify route
 * handler does this automatically — see chat-threads route).
 *
 * Returns `{ thread, activeCountAfterCreate }` on success.
 * Throws `ThreadLimitReachedError` (mapped to HTTP 409) when the cap is hit.
 */
export async function createChatThread(
  tx: Prisma.TransactionClient,
  input: CreateThreadInput,
): Promise<CreateThreadResult> {
  // Race guard: Postgres advisory xact-lock keyed on (companyId,
  // supervisorId). Two concurrent attempts on the same (company,
  // supervisor) tuple will serialise — the second waits for the first
  // tx to commit/rollback before its SELECT COUNT runs. Cleared on
  // commit or rollback (xact-scoped), no manual unlock needed.
  //
  // Per docs/locked/operational-invariants.md "no check-then-act races"
  // (feedback_production_grade_workflow_rules.md P4). Defense-in-depth:
  // even though Prisma's default Read Committed + Railway latency tend
  // to serialise small bursts naturally, this lock makes the invariant
  // hold at any parallelism level (multi-process, multi-region too —
  // the lock is global to the DB).
  //
  // The lock key is hashtext(companyId || ':' || supervisorId) — 32-bit
  // hash. Collisions are statistically rare AND benign (two unrelated
  // supervisors would just serialise their thread creates briefly).
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `${input.companyId}:${input.supervisorId}`,
  );

  const activeCount = await tx.chatThread.count({
    where: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      archivedAt: null,
    },
  });

  if (activeCount >= MAX_ACTIVE_THREADS_PER_SUPERVISOR) {
    throw new ThreadLimitReachedError(input.companyId, input.supervisorId, activeCount);
  }

  const created = await tx.chatThread.create({
    data: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      lastMessageAt: null,
    },
  });

  return {
    thread: {
      id: created.id,
      companyId: created.companyId,
      supervisorId: created.supervisorId,
      createdAt: created.createdAt,
      lastMessageAt: created.lastMessageAt,
      archivedAt: created.archivedAt,
    },
    activeCountAfterCreate: activeCount + 1,
  };
}

/**
 * Archive a ChatThread by setting `archivedAt = now()`. The thread row
 * stays — supervisor can still read its messages. New messages do not
 * append to archived threads; the chat route picks the most-recently
 * active thread on send.
 *
 * Returns `{ archived: true }` on success, `{ archived: false, reason }`
 * when the thread cannot be archived (not found, already archived, or
 * cross-tenant).
 *
 * Must run inside a withTenantContext transaction.
 */
export async function archiveChatThread(
  tx: Prisma.TransactionClient,
  input: { companyId: string; supervisorId: string; threadId: string },
): Promise<{ archived: true; archivedAt: Date } | { archived: false; reason: string }> {
  const existing = await tx.chatThread.findFirst({
    where: {
      id: input.threadId,
      companyId: input.companyId,
      supervisorId: input.supervisorId,
    },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    return { archived: false, reason: 'THREAD_NOT_FOUND' };
  }
  if (existing.archivedAt !== null) {
    return { archived: false, reason: 'ALREADY_ARCHIVED' };
  }
  const now = new Date();
  await tx.chatThread.update({
    where: { id: input.threadId },
    data: { archivedAt: now },
  });
  return { archived: true, archivedAt: now };
}

/**
 * List a supervisor's threads (active + archived), newest active first,
 * then archived by archivedAt DESC. Used by the chat thread switcher UI.
 */
export async function listChatThreadsForSupervisor(
  tx: Prisma.TransactionClient,
  input: { companyId: string; supervisorId: string },
): Promise<
  Array<{
    id: string;
    createdAt: Date;
    lastMessageAt: Date | null;
    archivedAt: Date | null;
  }>
> {
  const rows = await tx.chatThread.findMany({
    where: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
    },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { lastMessageAt: 'desc' }],
    select: {
      id: true,
      createdAt: true,
      lastMessageAt: true,
      archivedAt: true,
    },
  });
  return rows;
}
