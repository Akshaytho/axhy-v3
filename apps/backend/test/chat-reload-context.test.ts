/**
 * Real-DB tests for POST /chat/reload-context.
 *
 * Per docs/locked/chat-sidebar-context-flow.md Reload Context Button:
 *   - 3/day per supervisor, IST midnight reset (Scenes R-A, R-B, R-C)
 *   - 4th press → 429 with nextResetAt
 *   - Counter is per-supervisor (one supervisor's quota doesn't affect another)
 *   - Returns refreshed Layer 1/2 rule blocks + LivingDoc + Calendar
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 3)
 * @derives(docs/journeys/2026-05-19-wave-a-sidebar-chat-ai-scenarios.md Scenes R-A, R-B, R-C)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { consumeReloadContext } from '../src/lib/reload-context-counter.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

describe('POST /chat/reload-context', () => {
  it(
    'first 3 calls return 200 with decreasing remaining (Scene R-A)',
    { timeout: 60_000 },
    async () => {
      await withMultipleTenants(
        { count: 1, supervisorsPerTenant: 1, prefix: `rld-3ok-${Date.now()}-`, prisma },
        async ({ tenants, app }) => {
          const tenant = tenants[0]!;
          const sup = tenant.supervisors[0]!;
          for (let i = 0; i < 3; i++) {
            const res = await app.inject({
              method: 'POST',
              url: '/chat/reload-context',
              headers: { authorization: `Bearer ${sup.accessToken}` },
            });
            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.ok).toBe(true);
            expect(body.dailyLimit).toBe(3);
            expect(body.usedToday).toBe(i + 1);
            expect(body.remaining).toBe(3 - (i + 1));
            expect(body.blocks).toBeDefined();
          }
          // cleanup
          await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        },
      );
    },
  );

  it('4th call returns 429 with nextResetAt (Scene R-B)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `rld-429-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        for (let i = 0; i < 3; i++) {
          const r = await app.inject({
            method: 'POST',
            url: '/chat/reload-context',
            headers: { authorization: `Bearer ${sup.accessToken}` },
          });
          expect(r.statusCode).toBe(200);
        }
        const fourth = await app.inject({
          method: 'POST',
          url: '/chat/reload-context',
          headers: { authorization: `Bearer ${sup.accessToken}` },
        });
        expect(fourth.statusCode).toBe(429);
        const body = fourth.json();
        expect(body.error).toBe('RELOAD_LIMIT_REACHED');
        expect(body.dailyLimit).toBe(3);
        expect(body.usedToday).toBe(3);
        expect(body.remaining).toBe(0);
        expect(body.nextResetAt).toMatch(/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d/);
        expect(fourth.headers['x-reload-next-reset-at']).toBeTruthy();

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('GET /chat/reload-context/state reads counter without consuming', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `rld-st-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        await app.inject({
          method: 'POST',
          url: '/chat/reload-context',
          headers: { authorization: `Bearer ${sup.accessToken}` },
        });
        // State check after 1 consume should show usedToday=1
        const state1 = await app.inject({
          method: 'GET',
          url: '/chat/reload-context/state',
          headers: { authorization: `Bearer ${sup.accessToken}` },
        });
        expect(state1.statusCode).toBe(200);
        expect(state1.json().usedToday).toBe(1);
        expect(state1.json().remaining).toBe(2);

        // Another state check — shouldn't change anything
        const state2 = await app.inject({
          method: 'GET',
          url: '/chat/reload-context/state',
          headers: { authorization: `Bearer ${sup.accessToken}` },
        });
        expect(state2.json().usedToday).toBe(1);

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('counter is per-supervisor (Scene W-A style isolation)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 2, prefix: `rld-perSup-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const sup0 = tenant.supervisors[0]!;
        const sup1 = tenant.supervisors[1]!;

        // sup0 uses all 3
        for (let i = 0; i < 3; i++) {
          await app.inject({
            method: 'POST',
            url: '/chat/reload-context',
            headers: { authorization: `Bearer ${sup0.accessToken}` },
          });
        }
        // sup1's first call still works
        const sup1Res = await app.inject({
          method: 'POST',
          url: '/chat/reload-context',
          headers: { authorization: `Bearer ${sup1.accessToken}` },
        });
        expect(sup1Res.statusCode).toBe(200);
        expect(sup1Res.json().usedToday).toBe(1);

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('IST midnight reset: clock-mocked next-day call succeeds with usedToday=1 (Scene R-C)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `rld-ist-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        // Derived from system clock so the test isn't brittle to the
        // wall-clock IST date. `today` = right now; `tomorrow` = +25h
        // (safely crosses the IST midnight boundary regardless of when
        // the test runs).
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 25 * 60 * 60 * 1000);
        for (let i = 0; i < 3; i++) {
          const r = await withTenantContext(prisma, tenant.companyId, async (tx) =>
            consumeReloadContext(tx, {
              companyId: tenant.companyId,
              supervisorId: sup.userId,
              now: today,
            }),
          );
          expect(r.ok).toBe(true);
        }
        // 4th on same IST day → exceeded
        const fourthToday = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          consumeReloadContext(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
            now: today,
          }),
        );
        expect(fourthToday.ok).toBe(false);
        // 1st on the next IST day → OK
        const firstTomorrow = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          consumeReloadContext(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
            now: tomorrow,
          }),
        );
        expect(firstTomorrow.ok).toBe(true);
        if (firstTomorrow.ok) {
          expect(firstTomorrow.usedToday).toBe(1);
          expect(firstTomorrow.remaining).toBe(2);
        }

        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });
});
