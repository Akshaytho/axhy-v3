/**
 * Real-DB tests for the ChatThread 3-window service.
 *
 * Per docs/locked/security-gaps-to-fix.md GAP 8 + the scenarios at
 * docs/journeys/2026-05-19-wave-a-sidebar-chat-ai-scenarios.md
 * (Scenes W-A, W-B, W-C):
 *
 *   - First 3 threads succeed
 *   - 4th throws ThreadLimitReachedError → 409 in the route
 *   - Archive one → 4th now succeeds
 *   - Concurrent 4th attempts → exactly one succeeds
 *
 * Uses the axhy-sandbox via withMultipleTenants per the integration-tests
 * discipline lock in feedback_prod_only_testing.md.
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  createChatThread,
  archiveChatThread,
  listChatThreadsForSupervisor,
  ThreadLimitReachedError,
  MAX_ACTIVE_THREADS_PER_SUPERVISOR,
} from '../src/lib/chat-thread-service.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

describe('ChatThread 3-window service', () => {
  it('creates 3 active threads successfully (Scene W-A)', { timeout: 60_000 }, async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `cthr-wa-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR; i++) {
          const result = await withTenantContext(prisma, tenant.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
            }),
          );
          expect(result.activeCountAfterCreate).toBe(i + 1);
          expect(result.thread.archivedAt).toBeNull();
        }

        const all = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          listChatThreadsForSupervisor(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
          }),
        );
        expect(all.filter((t) => t.archivedAt === null)).toHaveLength(3);
      },
    );
  });

  it('throws ThreadLimitReachedError on the 4th create (Scene W-A)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `cthr-wa4-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR; i++) {
          await withTenantContext(prisma, tenant.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
            }),
          );
        }

        let thrown: unknown = null;
        try {
          await withTenantContext(prisma, tenant.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
            }),
          );
        } catch (err) {
          thrown = err;
        }

        expect(thrown).toBeInstanceOf(ThreadLimitReachedError);
        if (thrown instanceof ThreadLimitReachedError) {
          expect(thrown.code).toBe('THREAD_LIMIT_REACHED');
          expect(thrown.currentActiveCount).toBe(3);
          expect(thrown.supervisorId).toBe(supervisor.userId);
        }
      },
    );
  });

  it('archive → 4th now succeeds (Scene W-B)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `cthr-wb-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        const created: string[] = [];
        for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR; i++) {
          const r = await withTenantContext(prisma, tenant.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
            }),
          );
          created.push(r.thread.id);
        }

        const archiveResult = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          archiveChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
            threadId: created[0]!,
          }),
        );
        expect(archiveResult.archived).toBe(true);

        const fourth = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          createChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
          }),
        );
        expect(fourth.activeCountAfterCreate).toBe(3);

        const all = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          listChatThreadsForSupervisor(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
          }),
        );
        expect(all.filter((t) => t.archivedAt === null)).toHaveLength(3);
        expect(all.filter((t) => t.archivedAt !== null)).toHaveLength(1);
        expect(all).toHaveLength(4);
      },
    );
  });

  it('archive of already-archived thread returns ALREADY_ARCHIVED', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `cthr-arch-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        const created = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          createChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
          }),
        );

        await withTenantContext(prisma, tenant.companyId, async (tx) =>
          archiveChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
            threadId: created.thread.id,
          }),
        );

        const second = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          archiveChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
            threadId: created.thread.id,
          }),
        );
        expect(second).toEqual({ archived: false, reason: 'ALREADY_ARCHIVED' });
      },
    );
  });

  it('archive of non-existent thread returns THREAD_NOT_FOUND', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `cthr-nf-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const supervisor = tenant.supervisors[0]!;

        const result = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          archiveChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: supervisor.userId,
            threadId: '00000000-0000-0000-0000-000000000000',
          }),
        );
        expect(result).toEqual({ archived: false, reason: 'THREAD_NOT_FOUND' });
      },
    );
  });

  it('cross-supervisor: another supervisor in the same tenant has independent 3-thread budget', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 2, prefix: `cthr-xsup-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup0 = tenant.supervisors[0]!;
        const sup1 = tenant.supervisors[1]!;

        for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR; i++) {
          await withTenantContext(prisma, tenant.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenant.companyId,
              supervisorId: sup0.userId,
            }),
          );
        }

        const sup1Created = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          createChatThread(tx, {
            companyId: tenant.companyId,
            supervisorId: sup1.userId,
          }),
        );
        expect(sup1Created.activeCountAfterCreate).toBe(1);
      },
    );
  });

  it(
    'concurrent: 5 parallel attempts on a supervisor at 2 active threads → exactly ONE more is created (Scene W-C)',
    { timeout: 60_000 },
    async () => {
      await withMultipleTenants(
        { count: 1, supervisorsPerTenant: 1, prefix: `cthr-race-${Date.now()}-`, prisma },
        async ({ tenants }) => {
          const tenant = tenants[0]!;
          const supervisor = tenant.supervisors[0]!;

          // Seed 2 active threads — the next legal create is the 3rd; everything
          // after must fail. Five parallel attempts is the stress shape that
          // catches a race-vulnerable check-then-insert (without an advisory
          // lock or serializable isolation, all 5 could end up inserting because
          // each tx's SELECT COUNT sees 2 before any of them commits).
          for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR - 1; i++) {
            await withTenantContext(prisma, tenant.companyId, async (tx) =>
              createChatThread(tx, {
                companyId: tenant.companyId,
                supervisorId: supervisor.userId,
              }),
            );
          }

          const PARALLEL = 5;
          const attempts = Array.from({ length: PARALLEL }, () =>
            withTenantContext(prisma, tenant.companyId, async (tx) =>
              createChatThread(tx, {
                companyId: tenant.companyId,
                supervisorId: supervisor.userId,
              }),
            ),
          );
          const results = await Promise.allSettled(attempts);
          const fulfilled = results.filter((r) => r.status === 'fulfilled');
          const rejected = results.filter((r) => r.status === 'rejected');

          // EXACTLY ONE fulfilled — the race-safety invariant under any
          // parallelism. With the pg_advisory_xact_lock guard in
          // createChatThread, txns serialise on the (companyId, supervisorId)
          // tuple and only the first sees `count = 2`.
          expect(fulfilled.length).toBe(1);
          // The remaining 4 fail with THREAD_LIMIT_REACHED or a SSI
          // serialization_failure (40001) — both are acceptable.
          expect(rejected.length).toBe(PARALLEL - 1);
          for (const r of rejected) {
            const err = (r as PromiseRejectedResult).reason;
            const isLimitErr =
              err instanceof ThreadLimitReachedError ||
              err?.code === 'THREAD_LIMIT_REACHED' ||
              err?.code === '40001' ||
              /serialization_failure|could not serialize/i.test(err?.message ?? '');
            if (!isLimitErr) {
              // Surface unexpected error shape so the test failure is actionable
              console.error('Unexpected race-loser error:', err);
            }
            expect(isLimitErr).toBe(true);
          }

          // Hard invariant: at end of contention, exactly 3 active threads
          // (the 2 seeds + 1 winner). Never 4+.
          const activeCount = await prisma.chatThread.count({
            where: {
              companyId: tenant.companyId,
              supervisorId: supervisor.userId,
              archivedAt: null,
            },
          });
          expect(activeCount).toBe(MAX_ACTIVE_THREADS_PER_SUPERVISOR);
        },
      );
    },
  );

  it('cross-tenant: same supervisor name in different companies has separate budgets', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prefix: `cthr-xt-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;

        for (let i = 0; i < MAX_ACTIVE_THREADS_PER_SUPERVISOR; i++) {
          await withTenantContext(prisma, tenantA.companyId, async (tx) =>
            createChatThread(tx, {
              companyId: tenantA.companyId,
              supervisorId: tenantA.supervisors[0]!.userId,
            }),
          );
        }

        const tenantBCreated = await withTenantContext(prisma, tenantB.companyId, async (tx) =>
          createChatThread(tx, {
            companyId: tenantB.companyId,
            supervisorId: tenantB.supervisors[0]!.userId,
          }),
        );
        expect(tenantBCreated.activeCountAfterCreate).toBe(1);
      },
    );
  });
});
