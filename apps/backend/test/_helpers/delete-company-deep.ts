/**
 * FK-safe deep delete of companies — TEST CLEANUP ONLY.
 *
 * Migration 031 (`20260612_031_restrict_legal_trail_cascade`) changed three
 * Company foreign keys from ON DELETE CASCADE to ON DELETE RESTRICT to make the
 * legal trail un-erasable (locked INVARIANT 9 "audit immutable" and INVARIANT 11
 * "worker history forever"):
 *
 *   - Visit.companyId       → RESTRICT
 *   - AuditEvent.companyId  → RESTRICT
 *   - Attendance.companyId  → RESTRICT
 *
 * Every other Company child FK is still ON DELETE CASCADE (verified against the
 * live catalog: 3 `r` + 25 `c`/`n`). So a bare `company.deleteMany()` now throws
 * a foreign-key violation (Prisma P2003 / Postgres 23503) the moment any visit,
 * audit row, or attendance row still references the company. Before 031 the
 * cascade silently swept them — that is the regression this helper repairs.
 *
 * This helper clears exactly those three RESTRICT-protected tables first, then
 * deletes the companies — the remaining children go with the parent via cascade.
 * That is the correct teardown for tests, which legitimately create and discard
 * throwaway tenants. PRODUCTION CODE MUST NEVER DELETE THESE TABLES — the FK
 * restriction is the feature. This file lives under test/_helpers for that reason.
 *
 * Accepts company ids OR a slug prefix (the two addressing modes the suite uses).
 *
 * @derives(ADR-0024) — Postgres is the immutable source-of-truth for the audit
 *   trail; migration 031 enforces that with RESTRICT. @derives(migration 031)
 *   @derives(handoff 2026-06-12 "NEW DEBT")
 */
import type { PrismaClient } from '@prisma/client';

export type DeleteCompanyTarget = { ids: string[] } | { slugPrefix: string };

export async function deleteCompanyDeep(
  prisma: PrismaClient,
  target: DeleteCompanyTarget,
): Promise<void> {
  let companyIds: string[];
  if ('ids' in target) {
    companyIds = target.ids.filter(Boolean);
  } else {
    const rows = await prisma.company.findMany({
      where: { slug: { startsWith: target.slugPrefix } },
      select: { id: true },
    });
    companyIds = rows.map((r) => r.id);
  }
  if (companyIds.length === 0) return;

  const where = { companyId: { in: companyIds } };
  // The three RESTRICT-protected legal-trail tables (migration 031) — must be
  // emptied before the parent delete or Postgres refuses with FK 23503.
  await prisma.attendance.deleteMany({ where });
  await prisma.visit.deleteMany({ where });
  await prisma.auditEvent.deleteMany({ where });
  // All remaining Company children are ON DELETE CASCADE — they go with the parent.
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
}
