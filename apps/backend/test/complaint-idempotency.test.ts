/**
 * H6 — chat complaint idempotency (Complaint.dedupKey). Real-DB lab test.
 *
 * Proves a retried/replayed chat log_complaint cannot create a duplicate:
 *   - same dedupKey  -> the pre-check returns the SAME complaint (exactly one row)
 *   - different keys  -> distinct complaints
 *   - null dedupKey   -> never deduped (button/form path)
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/complaint-idempotency.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md H6)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';
import { createComplaintWithInitialMessage } from '../src/lib/services/complaint-service.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyId = uid();
const siteId = uid();
const supervisorUserId = uid();

const base = {
  companyId,
  siteId,
  supervisorUserId,
  createdByUserId: supervisorUserId,
  severity: 'LOW' as const,
  kind: 'other' as const,
  observedAt: null,
  origin: 'CHAT' as const,
};

describe('H6 — chat complaint idempotency (dedupKey)', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `dq-${sfx}`,
        slug: `dq-${sfx}`,
        ownerPhone: `+9199${sfx.slice(0, 4)}`,
        ownerName: 'DQ',
      },
    });
    await prisma.site.create({ data: { id: siteId, companyId, name: `dq-site-${sfx}` } });
  });

  afterAll(async () => {
    await prisma.complaintMessage.deleteMany({ where: { companyId } });
    await prisma.complaint.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await deleteCompanyDeep(prisma, { ids: [companyId] });
    await prisma.$disconnect();
  });

  it('same dedupKey returns the same complaint (no duplicate row)', async () => {
    const dk = `idem-${sfx}:abc`;
    const r1 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'lobby not cleaned', dedupKey: dk }),
    );
    const r2 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'lobby not cleaned', dedupKey: dk }),
    );
    expect(r1.kind).toBe('OK');
    expect(r2.kind).toBe('OK');
    if (r1.kind !== 'OK' || r2.kind !== 'OK') return;
    expect(r2.complaintId).toBe(r1.complaintId);
    const count = await prisma.complaint.count({ where: { companyId, dedupKey: dk } });
    expect(count).toBe(1);
  });

  it('different dedupKey creates distinct complaints', async () => {
    const r1 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'x', dedupKey: `idem-${sfx}:k1` }),
    );
    const r2 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'x', dedupKey: `idem-${sfx}:k2` }),
    );
    if (r1.kind !== 'OK' || r2.kind !== 'OK') throw new Error('expected OK');
    expect(r2.complaintId).not.toBe(r1.complaintId);
  });

  it('null dedupKey is never deduped (button/form path)', async () => {
    const r1 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'same words', dedupKey: null }),
    );
    const r2 = await withTenantContext(prisma, companyId, (tx) =>
      createComplaintWithInitialMessage(tx, { ...base, text: 'same words', dedupKey: null }),
    );
    if (r1.kind !== 'OK' || r2.kind !== 'OK') throw new Error('expected OK');
    expect(r2.complaintId).not.toBe(r1.complaintId);
  });
});
