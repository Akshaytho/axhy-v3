/**
 * Real-DB tests for the per-supervisor daily TOKEN cap.
 *
 * Supersedes the message-count cap per founder design 2026-05-19:
 * "context based like 50000 tokens per day" — a 30-second voice note
 * burns ~10× the tokens of a 3-word message, so token-based is more
 * honest about cost than message count.
 *
 * Default: 50000 tokens/day per supervisor.
 * Policy override: ai.limits.tokens_per_supervisor_daily.
 *
 * @derives(plans/abstract-wandering-kazoo.md Wave A follow-on)
 * @derives(docs/locked/chat-abuse-prevention.md — supersedes "200/day messages")
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import {
  checkSupervisorTokenCap,
  getDailyTokenLimit,
  DEFAULT_DAILY_TOKEN_LIMIT,
  POLICY_KEY_DAILY_TOKEN_LIMIT,
} from '../src/lib/supervisor-token-cap.js';
import { setPolicy } from '../src/lib/policy-service.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

async function seedChatMessageTokens(
  companyId: string,
  supervisorId: string,
  rows: Array<{ tokensIn: number; tokensOut: number; createdAt?: Date }>,
): Promise<void> {
  // Need a ChatThread first
  const thread = await prisma.chatThread.create({
    data: { companyId, supervisorId, lastMessageAt: new Date() },
  });
  for (const r of rows) {
    await prisma.chatMessage.create({
      data: {
        companyId,
        threadId: thread.id,
        role: 'assistant',
        aiResponseText: 'seed',
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        createdAt: r.createdAt ?? new Date(),
      },
    });
  }
}

describe('supervisor-token-cap', () => {
  it('defaults to 50000 when no Policy override is set', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-def-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const limit = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          getDailyTokenLimit(tx, tenant.companyId),
        );
        expect(limit).toBe(DEFAULT_DAILY_TOKEN_LIMIT);
        expect(limit).toBe(50000);
      },
    );
  });

  it('reads override from Policy table (OWNER-set)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-pol-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const ownerUserId = tenant.supervisors[0]!.userId;
        await prisma.membership.updateMany({
          where: { companyId: tenant.companyId, userId: ownerUserId },
          data: { role: 'OWNER' },
        });
        await withTenantContext(prisma, tenant.companyId, async (tx) => {
          await setPolicy(
            tx,
            {
              companyId: tenant.companyId,
              key: POLICY_KEY_DAILY_TOKEN_LIMIT,
              value: 100000,
              category: 'ai',
            },
            { role: 'OWNER', userId: ownerUserId },
          );
        });
        const limit = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          getDailyTokenLimit(tx, tenant.companyId),
        );
        expect(limit).toBe(100000);

        await prisma.notification.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('check returns ok=true when usedToday < limit', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-ok-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        await seedChatMessageTokens(tenant.companyId, sup.userId, [
          { tokensIn: 1500, tokensOut: 500 },
          { tokensIn: 2000, tokensOut: 1000 },
        ]);
        const result = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
          }),
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.usedTodayTokens).toBe(5000); // 1500+500+2000+1000
          expect(result.dailyLimitTokens).toBe(50000);
          expect(result.remainingTokens).toBe(45000);
        }
      },
    );
  });

  it('check returns ok=false when usedToday >= limit', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-cap-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        const owner = sup.userId;
        await prisma.membership.updateMany({
          where: { companyId: tenant.companyId, userId: owner },
          data: { role: 'OWNER' },
        });
        await withTenantContext(prisma, tenant.companyId, async (tx) => {
          await setPolicy(
            tx,
            {
              companyId: tenant.companyId,
              key: POLICY_KEY_DAILY_TOKEN_LIMIT,
              value: 5000,
              category: 'ai',
            },
            { role: 'OWNER', userId: owner },
          );
        });
        await seedChatMessageTokens(tenant.companyId, sup.userId, [
          { tokensIn: 3000, tokensOut: 2500 },
        ]);
        const result = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
          }),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toBe('TOKEN_LIMIT_REACHED');
          expect(result.usedTodayTokens).toBe(5500);
          expect(result.dailyLimitTokens).toBe(5000);
          expect(result.nextResetAt).toBeInstanceOf(Date);
        }
        await prisma.notification.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('NULL tokens treated as 0 (back-compat with pre-migration-015 rows)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-null-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        const thread = await prisma.chatThread.create({
          data: {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
            lastMessageAt: new Date(),
          },
        });
        await prisma.chatMessage.create({
          data: {
            companyId: tenant.companyId,
            threadId: thread.id,
            role: 'assistant',
            aiResponseText: 'legacy row, no tokens',
            // tokensIn + tokensOut left as null (pre-migration shape)
          },
        });
        const result = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
          }),
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.usedTodayTokens).toBe(0);
      },
    );
  });

  it('IST midnight reset', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `stc-ist-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup = tenant.supervisors[0]!;
        // Use clock-relative dates so the test works on any calendar day.
        // "today" = mid-day UTC of current IST day; "yesterday" = 24h
        // earlier; "tomorrow" = 25h ahead (safely crosses IST midnight
        // regardless of when the test runs).
        const today = new Date();
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const tomorrow = new Date(today.getTime() + 25 * 60 * 60 * 1000);

        await seedChatMessageTokens(tenant.companyId, sup.userId, [
          {
            tokensIn: 4000,
            tokensOut: 1000,
            createdAt: yesterday,
          },
          {
            tokensIn: 800,
            tokensOut: 200,
            createdAt: today,
          },
        ]);

        const todayResult = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
            now: today,
          }),
        );
        if (todayResult.ok) expect(todayResult.usedTodayTokens).toBe(1000);

        const tomorrowResult = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup.userId,
            now: tomorrow,
          }),
        );
        if (tomorrowResult.ok) expect(tomorrowResult.usedTodayTokens).toBe(0);
      },
    );
  });

  it('per-supervisor isolation (one supervisor at limit does not block another)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 2, prefix: `stc-perSup-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const sup0 = tenant.supervisors[0]!;
        const sup1 = tenant.supervisors[1]!;
        await prisma.membership.updateMany({
          where: { companyId: tenant.companyId, userId: sup0.userId },
          data: { role: 'OWNER' },
        });
        await withTenantContext(prisma, tenant.companyId, async (tx) => {
          await setPolicy(
            tx,
            {
              companyId: tenant.companyId,
              key: POLICY_KEY_DAILY_TOKEN_LIMIT,
              value: 1000,
              category: 'ai',
            },
            { role: 'OWNER', userId: sup0.userId },
          );
        });
        await seedChatMessageTokens(tenant.companyId, sup0.userId, [
          { tokensIn: 800, tokensOut: 200 },
        ]);
        const r0 = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup0.userId,
          }),
        );
        expect(r0.ok).toBe(false);
        const r1 = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          checkSupervisorTokenCap(tx, {
            companyId: tenant.companyId,
            supervisorId: sup1.userId,
          }),
        );
        expect(r1.ok).toBe(true);
        if (r1.ok) expect(r1.usedTodayTokens).toBe(0);
        await prisma.notification.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });
});
