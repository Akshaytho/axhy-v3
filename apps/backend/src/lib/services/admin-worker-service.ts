/**
 * Service for POST /admin/workers (R2).
 *
 * Creates User (or reuses) + Membership(WORKER) + Worker in PENDING_ACTIVATION
 * state. workerMachine entry state; OTP_VERIFIED transitions to ACTIVE later
 * via the existing workerOtpVerifiedService.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

/** @derives(ADR-0026) */
export type AdminCreateWorkerServiceInput = {
  callerCompanyId: string;
  callerUserId: string;
  body: {
    phone: string;
    name: string;
    baseSalaryPaise: number;
    bankIfsc?: string;
    bankAcct?: string;
    preferredLanguage?: string;
  };
};

/** @derives(ADR-0026) */
export type AdminCreateWorkerServiceOutput =
  | { kind: 'OK'; workerId: string; userId: string; membershipId: string }
  | { kind: 'ALREADY_EXISTS' };

/** @derives(ADR-0026) */
export async function adminCreateWorkerService(
  tx: Prisma.TransactionClient,
  input: AdminCreateWorkerServiceInput,
): Promise<AdminCreateWorkerServiceOutput> {
  // [ORCHESTRATOR_EXCEPTION] User by phone — atomic INSERT ... ON CONFLICT DO UPDATE.
  // Prisma's tx.user.upsert is NOT atomic at SQL (SELECT-then-INSERT), so it
  // races identically to the original findFirst+create pattern. The earlier
  // catch+re-query attempt fails inside a Prisma $transaction (Postgres 25P02:
  // transaction aborted). Only raw INSERT ... ON CONFLICT (phone) DO UPDATE SET
  // phone = EXCLUDED.phone RETURNING id is atomic at the Postgres level.
  // The no-op SET is required because DO NOTHING + RETURNING does not return
  // existing rows. Anonymised rows have phone 'anon:<uuid>' so they never
  // collide with a real E.164 phone lookup.
  const newId = randomUUID();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "axhy"."User" ("id", "phone", "locale", "status", "is_platform_admin", "createdAt", "updatedAt")
    VALUES (${newId}::uuid, ${input.body.phone}, 'en', 'ACTIVE', false, NOW(), NOW())
    ON CONFLICT ("phone") DO UPDATE SET "phone" = EXCLUDED."phone"
    RETURNING "id"
  `;
  const userId = rows[0].id;

  try {
    const membership = await tx.membership.create({
      data: {
        companyId: input.callerCompanyId,
        userId,
        role: 'WORKER',
        baseSalaryPaise: input.body.baseSalaryPaise,
        bankIfsc: input.body.bankIfsc ?? null,
        bankAcct: input.body.bankAcct ?? null,
        status: 'ACTIVE',
      },
    });

    const worker = await tx.worker.create({
      data: {
        companyId: input.callerCompanyId,
        userId,
        name: input.body.name,
        phone: input.body.phone,
        preferredLanguage: input.body.preferredLanguage ?? 'hi',
        state: 'PENDING_ACTIVATION',
      },
    });

    await recordAuditEvent(tx, {
      companyId: input.callerCompanyId,
      kind: 'WORKER_CREATED',
      actorId: input.callerUserId,
      targetId: worker.id,
      payload: {
        workerId: worker.id,
        userId,
        membershipId: membership.id,
        name: input.body.name,
      },
    });

    return { kind: 'OK', workerId: worker.id, userId, membershipId: membership.id };
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return { kind: 'ALREADY_EXISTS' };
    }
    throw err;
  }
}
