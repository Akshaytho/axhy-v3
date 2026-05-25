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
  let user = await tx.user.findFirst({
    where: { phone: input.body.phone, NOT: { phone: { startsWith: 'anon:' } } },
  });
  if (!user) {
    user = await tx.user.create({
      data: { phone: input.body.phone, locale: 'en' },
    });
  }

  try {
    const membership = await tx.membership.create({
      data: {
        companyId: input.callerCompanyId,
        userId: user.id,
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
        userId: user.id,
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
        userId: user.id,
        membershipId: membership.id,
        name: input.body.name,
      },
    });

    return { kind: 'OK', workerId: worker.id, userId: user.id, membershipId: membership.id };
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
