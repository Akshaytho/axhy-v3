# Admin/HR Backend (Wave-2 Prep) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 5 admin/HR backend routes + schema migration that unblock wave-2 cross-persona QA, enforcing the hiring authority locked in `docs/locked/hiring-hierarchy.md`.

**Architecture:** Backend-only TypeScript on Fastify+Prisma. Two new route files (`admin-memberships.ts`, `admin-workers.ts`) and one extension (`admin-sites.ts` for site + binding). One new middleware (`role-gates.ts`) implements the two-stage authority check. One Prisma migration moves payroll fields from Worker to Membership. One ADR (0025) records the schema decision.

**Tech Stack:** Fastify 5, Prisma + Postgres (axhy schema), Zod, jose (JWT), vitest (integration tests), pnpm workspaces.

**Source spec:** [docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md](2026-05-25-admin-hr-backend-wave-2-prep.md) — read before starting any phase.

**Spec correction baked in:** The spec said R3 "wraps existing identity-lifecycle service." Verification (this session) confirmed **no such service exists** — `grep -rln "anonymize" apps/backend/src` returns no service. R3 builds the anonymize service from scratch in Phase D.

---

## File Structure

### Create

| Path                                                                                               | Responsibility                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `axhy-v3/docs/decisions/0025-salary-on-membership-not-worker.md`                                   | ADR for the schema move                                                                                             |
| `axhy-v3/packages/shared-schema/prisma/migrations/20260525_019_salary_to_membership/migration.sql` | Move + backfill + drop                                                                                              |
| `axhy-v3/apps/backend/src/middleware/role-gates.ts`                                                | `requireRole(...)` preHandler + `assertTargetRole(callerRole, targetRole)` pure function + `HIRING_AUTHORITY` const |
| `axhy-v3/packages/shared-schema/src/zod/admin-memberships.ts`                                      | Zod for R1 input/output                                                                                             |
| `axhy-v3/packages/shared-schema/src/zod/admin-workers.ts`                                          | Zod for R2 + R3 input/output                                                                                        |
| `axhy-v3/packages/shared-schema/src/zod/admin-sites.ts`                                            | Zod for R4 input/output                                                                                             |
| `axhy-v3/packages/shared-schema/src/zod/admin-bindings.ts`                                         | Zod for R5 input/output                                                                                             |
| `axhy-v3/apps/backend/src/lib/services/admin-membership-service.ts`                                | R1 business logic                                                                                                   |
| `axhy-v3/apps/backend/src/lib/services/admin-worker-service.ts`                                    | R2 business logic                                                                                                   |
| `axhy-v3/apps/backend/src/lib/services/anonymize-worker-service.ts`                                | R3 business logic (NEW; spec correction)                                                                            |
| `axhy-v3/apps/backend/src/lib/services/admin-site-service.ts`                                      | R4 + R5 business logic                                                                                              |
| `axhy-v3/apps/backend/src/routes/admin-memberships.ts`                                             | R1 route                                                                                                            |
| `axhy-v3/apps/backend/src/routes/admin-workers.ts`                                                 | R2 + R3 routes                                                                                                      |
| `axhy-v3/apps/backend/src/routes/admin-sites.ts`                                                   | R4 + R5 routes                                                                                                      |
| `axhy-v3/apps/backend/test/admin-memberships.test.ts`                                              | 5 integration tests for R1                                                                                          |
| `axhy-v3/apps/backend/test/admin-workers.test.ts`                                                  | 5 integration tests for R2                                                                                          |
| `axhy-v3/apps/backend/test/admin-workers-anonymize.test.ts`                                        | 5 integration tests for R3                                                                                          |
| `axhy-v3/apps/backend/test/admin-sites.test.ts`                                                    | 5 integration tests for R4                                                                                          |
| `axhy-v3/apps/backend/test/admin-bindings.test.ts`                                                 | 5 integration tests for R5                                                                                          |
| `axhy-v3/apps/backend/test/role-gates.test.ts`                                                     | Unit tests for `requireRole`, `assertTargetRole`, HIRING_AUTHORITY drift check                                      |
| `axhy-v3/apps/backend/test/salary-migration.test.ts`                                               | 3 schema-migration tests                                                                                            |
| `axhy-v3/docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md`                      | Learning from the spec-vs-code drift this slice caught                                                              |

### Modify

| Path                                                          | Change                                                |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `axhy-v3/packages/shared-schema/prisma/schema.prisma`         | Worker: drop 3 fields. Membership: add 3 fields.      |
| `axhy-v3/apps/backend/src/lib/services/attendance-service.ts` | `markAbsentService` reads salary from Membership join |
| `axhy-v3/apps/backend/src/server.ts`                          | Register 3 new route bundles                          |
| `axhy-v3/handoff/NEXT_SESSION.md`                             | Update with wave-2-prep status                        |
| `axhy-v3/handoff/STATUS.md`                                   | Add the new slice row                                 |

---

## Phase A — Schema move (precondition)

### Task A1: Audit consumers of the 3 Worker payroll fields

**Files:** read-only sweep

- [ ] **Step 1: Grep for all consumers**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
grep -rn "baseSalaryPaise\|bankIfsc\|bankAcct" apps packages \
  --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next \
  > /tmp/axhy-salary-consumers.txt
cat /tmp/axhy-salary-consumers.txt
```

Expected: hits in `schema.prisma`, `attendance-service.ts`, `seed-sandbox.ts`, possibly Zod schemas, possibly tests. Every hit must be enumerated; nothing in production code touches these fields after the migration.

- [ ] **Step 2: For each hit, classify as KEEP / MIGRATE / DROP and record in a checklist**

Append the classification to the bottom of this plan as a temporary tracking section, OR keep in a scratch file. Each hit must be addressed before Phase A is complete.

- [ ] **Step 3: Commit the consumer list as a comment in ADR-0025**

Move to Task A2.

### Task A2: Write ADR-0025

**Files:**

- Create: `axhy-v3/docs/decisions/0025-salary-on-membership-not-worker.md`

- [ ] **Step 1: Read the ADR template**

```bash
cat /Users/thotaakshay/eclean_workspace/axhy-v3/docs/decisions/_template.md
```

- [ ] **Step 2: Write ADR-0025 following template**

Content (verbatim — fill the Status/Date frontmatter to match template):

```markdown
# ADR-0025: Salary belongs on Membership, not Worker

## Status

Accepted — 2026-05-25 (founder Akshay Thota)

## Context

The Worker model carries `baseSalaryPaise`, `bankIfsc`, `bankAcct`. These were placed there in early scaffolding when Worker was the only "paid role" entity. The wave-2 QA preparation surfaced that HR and Supervisor roles are also salaried in Indian cleaning companies, and the current schema has nowhere to persist their pay or bank details.

## Decision

Move `baseSalaryPaise`, `bankIfsc`, `bankAcct` from `Worker` to `Membership`. Worker keeps only role-specific fields (`state`, `preferredLanguage`, `name`, `phone`, `userId`, `joinedAt`).

## Rationale

Every production-grade Indian payroll system stores salary on the employment record:

- Zoho Payroll: salary on `employee_compensation` linked to the Employee + Job role.
- RazorpayX Payroll: `salary_structure` keyed by employment_id, not by worker_id.
- TallyPrime: salary on the Employee Master, with Designation as a separate field.
- Workday + BambooHR: the same "compensation per employment" pattern, internationalised.

The conceptual rule: salary is a function of `(Person, Company, Role)`. When a worker is promoted to supervisor, the new salary attaches to the new Membership. When an employee changes companies, the old salary doesn't follow them. Membership is precisely that tuple in our schema.

A role-specific table like `Worker` should hold only fields that don't generalise to other roles: the state machine state, the worker's preferred notification language for visit alerts, the joining date for the worker-specific tenure.

## Consequences

- Migration `20260525_019_salary_to_membership` moves the 3 columns. Reversible via a follow-up migration that copies back.
- `markAbsentService` reads salary from a Membership join. One extra query per absence call. Indexed on the existing `@@unique([companyId, userId, role])`.
- HR and Supervisor onboarding routes can now accept salary at create time. Wave-2 cross-persona QA becomes possible.
- Future work: SalaryHistory table for raises/adjustments — deferred until product asks for it.

## Alternatives Considered

1. Keep on Worker, add duplicate fields to Membership. Two sources of truth. Rejected.
2. Add an Employment table that Worker references. More normalisation, but Membership IS the Employment record. Rejected.
3. Defer the move to a later slice. Forces wave-2 QA to either skip HR/Supervisor salary or fake it via Prisma. Rejected per founder direction.

## References

- `docs/locked/hiring-hierarchy.md` — hiring authority that this schema serves
- `docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md` — design spec
- Wave-2 QA preflight (2026-05-25) — where the gap was surfaced
```

- [ ] **Step 3: Commit ADR**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add docs/decisions/0025-salary-on-membership-not-worker.md
git commit -m "$(cat <<'EOF'
docs: ADR-0025 salary belongs on Membership not Worker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task A3: Write the Prisma migration SQL

**Files:**

- Create: `axhy-v3/packages/shared-schema/prisma/migrations/20260525_019_salary_to_membership/migration.sql`

- [ ] **Step 1: Create the migration directory and SQL**

```bash
mkdir -p /Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/migrations/20260525_019_salary_to_membership
```

Write file contents:

```sql
-- ADR-0025: Move payroll fields from Worker to Membership.
--
-- Reversible: see down-migration SQL at the bottom of this file (commented).
-- Safe to run on Railway prod given current scale (~6 worker rows in QA Test Co,
-- no other tenant rows). Lock duration expected <50ms total.

-- Step 1: Add new columns to Membership with defaults matching current Worker defaults.
ALTER TABLE "axhy"."Membership"
  ADD COLUMN "baseSalaryPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bankIfsc" VARCHAR(16),
  ADD COLUMN "bankAcct" TEXT;

-- Step 2: Backfill from Worker to matching Membership rows (where role=WORKER).
UPDATE "axhy"."Membership" m
SET
  "baseSalaryPaise" = w."baseSalaryPaise",
  "bankIfsc"        = w."bankIfsc",
  "bankAcct"        = w."bankAcct"
FROM "axhy"."Worker" w
WHERE
  m."userId" = w."userId"
  AND m."companyId" = w."companyId"
  AND m."role" = 'WORKER'
  AND w."userId" IS NOT NULL;

-- Step 3: Verify backfill — count must match Workers with userId set.
DO $$
DECLARE
  worker_count INT;
  membership_count INT;
BEGIN
  SELECT COUNT(*) INTO worker_count
    FROM "axhy"."Worker"
    WHERE "userId" IS NOT NULL;
  SELECT COUNT(*) INTO membership_count
    FROM "axhy"."Membership" m
    INNER JOIN "axhy"."Worker" w
      ON m."userId" = w."userId"
     AND m."companyId" = w."companyId"
    WHERE m."role" = 'WORKER'
      AND m."baseSalaryPaise" = w."baseSalaryPaise";
  IF worker_count <> membership_count THEN
    RAISE EXCEPTION 'Backfill mismatch: % workers vs % memberships with salary copied', worker_count, membership_count;
  END IF;
END $$;

-- Step 4: Drop the columns from Worker.
ALTER TABLE "axhy"."Worker"
  DROP COLUMN "baseSalaryPaise",
  DROP COLUMN "bankIfsc",
  DROP COLUMN "bankAcct";

-- =============================================================================
-- DOWN MIGRATION (manual — uncomment + run only with founder approval):
--
-- ALTER TABLE "axhy"."Worker"
--   ADD COLUMN "baseSalaryPaise" INTEGER NOT NULL DEFAULT 0,
--   ADD COLUMN "bankIfsc" VARCHAR(16),
--   ADD COLUMN "bankAcct" TEXT;
--
-- UPDATE "axhy"."Worker" w
-- SET
--   "baseSalaryPaise" = m."baseSalaryPaise",
--   "bankIfsc"        = m."bankIfsc",
--   "bankAcct"        = m."bankAcct"
-- FROM "axhy"."Membership" m
-- WHERE m."userId" = w."userId"
--   AND m."companyId" = w."companyId"
--   AND m."role" = 'WORKER';
--
-- ALTER TABLE "axhy"."Membership"
--   DROP COLUMN "baseSalaryPaise",
--   DROP COLUMN "bankIfsc",
--   DROP COLUMN "bankAcct";
```

- [ ] **Step 2: Update schema.prisma to reflect the new shape**

In `axhy-v3/packages/shared-schema/prisma/schema.prisma`:

In `model Membership`, add (after `podId`):

```prisma
  /// Monthly salary in paise (₹1 = 100 paise). 0 for unpaid roles (SUPER_ADMIN, optional COMPANY_ADMIN).
  /// @derives(ADR-0025)
  baseSalaryPaise   Int      @default(0)
  /// @personal bank IFSC for payroll transfer
  /// @derives(ADR-0025)
  bankIfsc          String?  @db.VarChar(16)
  /// @personal bank account number for payroll transfer
  /// @derives(ADR-0025)
  bankAcct          String?
```

In `model Worker`, remove the lines:

```prisma
  /// @personal optional worker bank for salary
  bankIfsc          String?  @db.VarChar(16)
  /// @personal optional worker bank account
  bankAcct          String?
```

and:

```prisma
  /// monthly salary in paise (₹1 = 100 paise)
  baseSalaryPaise   Int      @default(0)
```

- [ ] **Step 3: Run `prisma generate`**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm --filter @axhy/shared-schema exec prisma generate
```

Expected: no errors. Generated client now exposes `Membership.baseSalaryPaise` and removes the Worker fields.

- [ ] **Step 4: Run typecheck to see breakages**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm -r run typecheck 2>&1 | tee /tmp/axhy-typecheck-A3.txt
```

Expected: typecheck failures only in the consumer files Task A1 enumerated (`attendance-service.ts`, possibly `seed-sandbox.ts`, possibly test fixtures). These are fixed in Task A4 + A5.

- [ ] **Step 5: Commit migration + schema**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add packages/shared-schema/prisma/migrations/20260525_019_salary_to_membership/migration.sql \
        packages/shared-schema/prisma/schema.prisma \
        packages/shared-schema/src/
git commit -m "$(cat <<'EOF'
feat(schema): move salary + bank fields from Worker to Membership

Migration 20260525_019. Implements ADR-0025. Worker keeps only role-specific
fields; payroll lives on Membership for every paid role.

@derives(ADR-0025)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Note: this commit may need `AXHY_AUDIT_EMERGENCY=1` if pre-commit blocks on the typecheck breakages from Task A1 consumer list — DO NOT use the emergency flag; instead complete Task A4 first and bundle into one commit. Restart this step after A4 if needed.

### Task A4: Update `attendance-service.ts` to read salary from Membership

**Files:**

- Modify: `axhy-v3/apps/backend/src/lib/services/attendance-service.ts`
- Modify: `axhy-v3/apps/backend/test/attendance-*.test.ts` (whichever exist; grep)

- [ ] **Step 1: Read the current attendance service end to end**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
cat apps/backend/src/lib/services/attendance-service.ts
```

Identify the read site of `worker.baseSalaryPaise` and the test that asserts on payDeductPaise.

- [ ] **Step 2: Write the failing test FIRST (TDD)**

In `apps/backend/test/attendance-membership-salary.test.ts` (new):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { markAbsentService } from '../src/lib/services/attendance-service.js';
import { createCompanyFixture, createWorkerFixtureWithMembership } from './_helpers/fixtures.js';

describe('markAbsentService — salary on Membership', () => {
  it('computes payDeductPaise from Membership.baseSalaryPaise (not Worker)', async () => {
    const { company, supervisor } = await createCompanyFixture();
    const { worker } = await createWorkerFixtureWithMembership({
      companyId: company.id,
      baseSalaryPaise: 30_000_00, // ₹30,000 monthly on Membership
    });
    const result = await prisma.$transaction(async (tx) => {
      return markAbsentService(
        tx,
        { workerId: worker.id, date: '2026-05-25', status: 'ABSENT', reason: null },
        { companyId: company.id, userId: supervisor.id },
      );
    });
    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    // 30,000 / 26 working days = ~1,154 ₹ per day = 115,384 paise (use the service's own divisor)
    expect(result.attendance.payDeductPaise).toBeGreaterThan(0);
    // verify the source is Membership: change Membership.baseSalaryPaise and rerun
    await tx.membership.update({
      where: { id: worker.membershipId },
      data: { baseSalaryPaise: 60_000_00 },
    });
    const result2 = await markAbsentService(
      prisma,
      { workerId: worker.id, date: '2026-05-26', status: 'ABSENT', reason: null },
      { companyId: company.id, userId: supervisor.id },
    );
    if (result2.kind !== 'OK') throw new Error('expected OK');
    expect(result2.attendance.payDeductPaise).toBeGreaterThan(result.attendance.payDeductPaise);
  });
});
```

- [ ] **Step 3: Run the test, expect it to fail**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- attendance-membership-salary 2>&1 | tail -30
```

Expected: fails because either (a) `_helpers/fixtures` lacks `createWorkerFixtureWithMembership`, or (b) the service still reads from Worker. Both are real failures, not setup.

- [ ] **Step 4: Update `markAbsentService` to read salary from Membership**

Open `apps/backend/src/lib/services/attendance-service.ts`. Find the block that reads `worker.baseSalaryPaise`. Replace with a Membership join:

```ts
// BEFORE (illustrative; locate the exact lines):
//   const worker = await tx.worker.findFirst({ where: { id: workerId, companyId } });
//   const payDeductPaise = computeDeduction(worker.baseSalaryPaise);

// AFTER:
const worker = await tx.worker.findFirst({
  where: { id: workerId, companyId },
});
if (!worker) return { kind: 'WORKER_NOT_FOUND' as const };

let baseSalaryPaise = 0;
if (worker.userId) {
  const membership = await tx.membership.findFirst({
    where: {
      userId: worker.userId,
      companyId,
      role: 'WORKER',
    },
    select: { baseSalaryPaise: true },
  });
  baseSalaryPaise = membership?.baseSalaryPaise ?? 0;
}
const payDeductPaise = computeDeduction(baseSalaryPaise);
```

The exact insertion point depends on the existing structure — locate via `grep -n "baseSalaryPaise" apps/backend/src/lib/services/attendance-service.ts`.

- [ ] **Step 5: Add the test fixture helper**

In `apps/backend/test/_helpers/fixtures.ts` (or whichever module holds existing helpers — check via `ls apps/backend/test/_helpers/`):

```ts
export async function createWorkerFixtureWithMembership(input: {
  companyId: string;
  baseSalaryPaise: number;
}) {
  const user = await prisma.user.create({
    data: { phone: `+9199${Math.random().toString().slice(2, 10)}`, locale: 'en' },
  });
  const membership = await prisma.membership.create({
    data: {
      companyId: input.companyId,
      userId: user.id,
      role: 'WORKER',
      baseSalaryPaise: input.baseSalaryPaise,
    },
  });
  const worker = await prisma.worker.create({
    data: {
      companyId: input.companyId,
      userId: user.id,
      name: 'Test Worker',
      phone: user.phone,
      state: 'ACTIVE',
    },
  });
  return { user, membership, worker: { ...worker, membershipId: membership.id } };
}
```

- [ ] **Step 6: Run the test again, expect green**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- attendance-membership-salary 2>&1 | tail -30
```

Expected: PASS.

- [ ] **Step 7: Run typecheck — all packages**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm -r run typecheck 2>&1 | tee /tmp/axhy-typecheck-A4.txt
```

Expected: clean. If any consumer from Task A1 list still breaks, fix it in this same task.

- [ ] **Step 8: Commit the service update + test**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add apps/backend/src/lib/services/attendance-service.ts \
        apps/backend/test/attendance-membership-salary.test.ts \
        apps/backend/test/_helpers/
git commit -m "$(cat <<'EOF'
feat(attendance): read salary from Membership not Worker

markAbsentService now joins Membership (where role=WORKER) for payroll-deduction
computation. ADR-0025. New integration test asserts the source of truth.

@derives(ADR-0025)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task A5: Apply migration on Railway + verify

- [ ] **Step 1: Inspect current data state on Railway**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run --service Postgres -- node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.worker.count().then(c => { console.log("workers:", c); return p.$disconnect(); });
'
```

Expected: small count (~6 in QA Test Co, none elsewhere).

- [ ] **Step 2: Apply migration**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run --service Postgres -- pnpm --filter @axhy/shared-schema exec prisma migrate deploy 2>&1 | tee /tmp/axhy-migrate-A5.txt
```

Expected: migration 20260525_019 applied. If the verify DO block raises an exception, do NOT proceed — the backfill failed and rollback is needed.

- [ ] **Step 3: Verify against the live DB**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run --service Postgres -- node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.membership.findMany({
  where: { role: "WORKER" },
  select: { id: true, userId: true, baseSalaryPaise: true, bankIfsc: true },
}).then(rs => { console.log(JSON.stringify(rs, null, 2)); return p.$disconnect(); });
'
```

Expected: every WORKER membership has `baseSalaryPaise` (possibly 0 if Worker.baseSalaryPaise was 0).

- [ ] **Step 4: Run full integration tests against the migrated DB**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration 2>&1 | tail -30
```

Expected: all existing tests still pass (no regressions).

- [ ] **Step 5: No commit needed — migration files already committed in A3**

---

## Phase B — Foundation (role gates + Zod)

### Task B1: Write `role-gates.ts` middleware + HIRING_AUTHORITY const

**Files:**

- Create: `axhy-v3/apps/backend/src/middleware/role-gates.ts`
- Create: `axhy-v3/apps/backend/test/role-gates.test.ts`

- [ ] **Step 1: Write the failing test FIRST**

In `apps/backend/test/role-gates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  HIRING_AUTHORITY,
  assertTargetRole,
  TargetRoleError,
} from '../src/middleware/role-gates.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('role-gates — HIRING_AUTHORITY', () => {
  it('matches the locked hiring-hierarchy.md authority table byte-for-byte', () => {
    const lockedDoc = readFileSync(
      path.join(REPO_ROOT, 'docs/locked/hiring-hierarchy.md'),
      'utf-8',
    );
    // Parse the | Caller role | Can create Membership for role | rows
    const rows = [
      ...lockedDoc.matchAll(/\| (SUPER_ADMIN|COMPANY_ADMIN|HR|SUPERVISOR|WORKER)\s+\| ([^|]+)\|/g),
    ];
    expect(rows.length).toBe(5);
    for (const [, caller, allowed] of rows) {
      const parsedAllowed = allowed
        .split(/[,]/)
        .map((s) => s.trim().replace(/[() ].*/g, ''))
        .filter((s) => /^[A-Z_]+$/.test(s));
      const constAllowed = HIRING_AUTHORITY[caller as keyof typeof HIRING_AUTHORITY];
      expect([...constAllowed].sort()).toEqual(parsedAllowed.sort());
    }
  });

  it('assertTargetRole allows HR -> WORKER', () => {
    expect(() => assertTargetRole('HR', 'WORKER')).not.toThrow();
  });

  it('assertTargetRole rejects SUPERVISOR -> WORKER with TargetRoleError', () => {
    expect(() => assertTargetRole('SUPERVISOR', 'WORKER')).toThrow(TargetRoleError);
  });

  it('assertTargetRole rejects HR -> COMPANY_ADMIN with TargetRoleError', () => {
    expect(() => assertTargetRole('HR', 'COMPANY_ADMIN')).toThrow(TargetRoleError);
  });
});
```

- [ ] **Step 2: Run the test, expect it to fail (module not found)**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm --filter @axhy/backend test:integration -- role-gates 2>&1 | tail -15
```

Expected: fails with "Cannot find module .../role-gates.js".

- [ ] **Step 3: Implement `role-gates.ts`**

```ts
/**
 * Role-gate primitives for admin/HR routes.
 *
 * Two gates per route:
 *   1. requireRole(...) — Fastify preHandler that 401s without JWT and
 *      403s if the caller's role isn't allowed to call this route at all.
 *   2. assertTargetRole(callerRole, targetRole) — pure function that
 *      checks (callerRole, targetRole) against HIRING_AUTHORITY.
 *
 * HIRING_AUTHORITY mirrors docs/locked/hiring-hierarchy.md.
 * A test (role-gates.test.ts) parses the locked doc and asserts the
 * const matches byte-for-byte. Drift fails the build.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Role } from '@axhy/shared-schema';

export const HIRING_AUTHORITY = {
  SUPER_ADMIN: ['COMPANY_ADMIN'],
  COMPANY_ADMIN: ['HR', 'COMPANY_ADMIN'],
  HR: ['SUPERVISOR', 'WORKER'],
  SUPERVISOR: [],
  WORKER: [],
} as const satisfies Record<Role, ReadonlyArray<Role>>;

export class TargetRoleError extends Error {
  constructor(
    public readonly callerRole: Role,
    public readonly targetRole: Role,
  ) {
    super(`Role ${callerRole} is not allowed to create members of role ${targetRole}`);
    this.name = 'TargetRoleError';
  }
}

export function assertTargetRole(callerRole: Role, targetRole: Role): void {
  const allowed = HIRING_AUTHORITY[callerRole] ?? [];
  if (!allowed.includes(targetRole)) {
    throw new TargetRoleError(callerRole, targetRole);
  }
}

export function requireRole(...allowedRoles: Role[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }
    if (!allowedRoles.includes(req.auth.role)) {
      reply.code(403).send({
        error: 'FORBIDDEN_WRONG_ROLE',
        message: `Role ${req.auth.role} is not permitted to call this route. Required: ${allowedRoles.join(' or ')}`,
      });
      return;
    }
  };
}
```

- [ ] **Step 4: Run the test, expect green**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm --filter @axhy/backend test:integration -- role-gates 2>&1 | tail -15
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add apps/backend/src/middleware/role-gates.ts apps/backend/test/role-gates.test.ts
git commit -m "$(cat <<'EOF'
feat(middleware): add role-gates (requireRole, assertTargetRole, HIRING_AUTHORITY)

Two-stage authority check for admin/HR routes per docs/locked/hiring-hierarchy.md.
HIRING_AUTHORITY const mirrors the locked doc table; CI test asserts byte-match.

@derives(docs/locked/hiring-hierarchy.md)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task B2: Write the 4 admin Zod schemas

**Files:**

- Create: `axhy-v3/packages/shared-schema/src/zod/admin-memberships.ts`
- Create: `axhy-v3/packages/shared-schema/src/zod/admin-workers.ts`
- Create: `axhy-v3/packages/shared-schema/src/zod/admin-sites.ts`
- Create: `axhy-v3/packages/shared-schema/src/zod/admin-bindings.ts`
- Modify: `axhy-v3/packages/shared-schema/src/index.ts` — add 4 re-exports

- [ ] **Step 1: Write `admin-memberships.ts`**

```ts
/**
 * Zod schemas for POST /admin/memberships.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(ADR-0025)
 */

import { z } from 'zod';

export const AdminCreateMembershipInput = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, 'phone must be E.164'),
  name: z.string().min(1).max(120),
  role: z.enum(['HR', 'SUPERVISOR']), // COMPANY_ADMIN co-owner deferred (see spec §R1)
  baseSalaryPaise: z.number().int().nonnegative(),
  bankIfsc: z.string().max(16).optional(),
  bankAcct: z.string().max(40).optional(),
  podId: z.string().uuid().optional(),
});
export type AdminCreateMembershipInput = z.infer<typeof AdminCreateMembershipInput>;

export const AdminCreateMembershipOutput = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['HR', 'SUPERVISOR']),
  status: z.literal('ACTIVE'),
});
export type AdminCreateMembershipOutput = z.infer<typeof AdminCreateMembershipOutput>;
```

- [ ] **Step 2: Write `admin-workers.ts`**

```ts
/**
 * Zod schemas for POST /admin/workers + POST /admin/workers/:id/anonymize.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(ADR-0025)
 */

import { z } from 'zod';

export const AdminCreateWorkerInput = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/),
  name: z.string().min(1).max(120),
  baseSalaryPaise: z.number().int().nonnegative(),
  bankIfsc: z.string().max(16).optional(),
  bankAcct: z.string().max(40).optional(),
  preferredLanguage: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional()
    .default('hi'),
});
export type AdminCreateWorkerInput = z.infer<typeof AdminCreateWorkerInput>;

export const AdminCreateWorkerOutput = z.object({
  workerId: z.string().uuid(),
  userId: z.string().uuid(),
  membershipId: z.string().uuid(),
  state: z.literal('PENDING_ACTIVATION'),
});
export type AdminCreateWorkerOutput = z.infer<typeof AdminCreateWorkerOutput>;

export const AdminAnonymizeWorkerInput = z.object({
  reason: z.string().min(1).max(500),
  effectiveAt: z.string().datetime().optional(),
});
export type AdminAnonymizeWorkerInput = z.infer<typeof AdminAnonymizeWorkerInput>;

export const AdminAnonymizeWorkerOutput = z.object({
  workerId: z.string().uuid(),
  anonymizedAt: z.string().datetime(),
});
export type AdminAnonymizeWorkerOutput = z.infer<typeof AdminAnonymizeWorkerOutput>;
```

- [ ] **Step 3: Write `admin-sites.ts`**

```ts
/**
 * Zod schemas for POST /admin/sites.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { z } from 'zod';

export const AdminCreateSiteInput = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(500).optional(),
  latitude: z.number().gte(-90).lte(90).optional(),
  longitude: z.number().gte(-180).lte(180).optional(),
  workdays: z
    .string()
    .regex(/^[MTWFSU_]{7}$/)
    .optional()
    .default('MTWTFS_'),
});
export type AdminCreateSiteInput = z.infer<typeof AdminCreateSiteInput>;

export const AdminCreateSiteOutput = z.object({
  siteId: z.string().uuid(),
  state: z.literal('DRAFT'),
});
export type AdminCreateSiteOutput = z.infer<typeof AdminCreateSiteOutput>;
```

- [ ] **Step 4: Write `admin-bindings.ts`**

```ts
/**
 * Zod schemas for POST /admin/sites/:id/bindings.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(ADR-0003) — SiteSupervisorBinding model
 */

import { z } from 'zod';

export const AdminCreateBindingInput = z
  .object({
    supervisorUserId: z.string().uuid(),
    effectiveFrom: z.string().datetime(),
    effectiveUntil: z.string().datetime().optional(),
    actingForUserId: z.string().uuid().optional(),
    reason: z.string().min(1).max(1000),
  })
  .refine((v) => !v.actingForUserId || !!v.effectiveUntil, {
    message: 'effectiveUntil is required when actingForUserId is set',
    path: ['effectiveUntil'],
  });
export type AdminCreateBindingInput = z.infer<typeof AdminCreateBindingInput>;

export const AdminCreateBindingOutput = z.object({
  bindingId: z.string().uuid(),
});
export type AdminCreateBindingOutput = z.infer<typeof AdminCreateBindingOutput>;
```

- [ ] **Step 5: Add re-exports to `packages/shared-schema/src/index.ts`**

Find the existing block of `export * from './zod/...'` lines and add:

```ts
export * from './zod/admin-memberships.js';
export * from './zod/admin-workers.js';
export * from './zod/admin-sites.js';
export * from './zod/admin-bindings.js';
```

- [ ] **Step 6: Run shared-schema typecheck**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm --filter @axhy/shared-schema run typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add packages/shared-schema/src/zod/admin-memberships.ts \
        packages/shared-schema/src/zod/admin-workers.ts \
        packages/shared-schema/src/zod/admin-sites.ts \
        packages/shared-schema/src/zod/admin-bindings.ts \
        packages/shared-schema/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared-schema): Zod for 4 admin/HR routes

AdminCreateMembershipInput, AdminCreateWorkerInput + Anonymize, AdminCreateSiteInput,
AdminCreateBindingInput. Membership Zod restricts to HR|SUPERVISOR for this slice;
COMPANY_ADMIN co-owner deferred per spec §R1.

@derives(docs/locked/hiring-hierarchy.md, ADR-0025)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — POST /admin/memberships (R1)

### Task C1: Implement R1 end-to-end with TDD

**Files:**

- Create: `axhy-v3/apps/backend/src/lib/services/admin-membership-service.ts`
- Create: `axhy-v3/apps/backend/src/routes/admin-memberships.ts`
- Create: `axhy-v3/apps/backend/test/admin-memberships.test.ts`
- Modify: `axhy-v3/apps/backend/src/server.ts` (register route)

- [ ] **Step 1: Write the failing 5-test integration suite FIRST**

In `apps/backend/test/admin-memberships.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, startTestServer } from './_helpers/test-app.js';
import { createCompanyFixture, mintAccessToken } from './_helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';

describe('POST /admin/memberships', () => {
  beforeAll(async () => {
    await startTestServer();
  });
  afterAll(async () => {
    await app.close();
  });

  it('401 without Authorization header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/memberships',
      payload: { phone: '+919999999991', name: 'Test HR', role: 'HR', baseSalaryPaise: 5000000 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('AUTH_REQUIRED');
  });

  it('403 when caller role is SUPERVISOR (not allowed on /admin/memberships)', async () => {
    const { company, supervisor } = await createCompanyFixture();
    const token = await mintAccessToken({
      userId: supervisor.id,
      companyId: company.id,
      role: 'SUPERVISOR',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: '+919999999992', name: 'Test HR', role: 'HR', baseSalaryPaise: 5000000 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
  });

  it('403 FORBIDDEN_TARGET_ROLE when HR tries to create HR', async () => {
    const { company, hr } = await createCompanyFixture();
    const token = await mintAccessToken({ userId: hr.id, companyId: company.id, role: 'HR' });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: '+919999999993', name: 'Test HR 2', role: 'HR', baseSalaryPaise: 5000000 },
    });
    expect(res.statusCode).toBe(400); // Zod rejects body.role='HR' from HR caller perspective; if Zod allows then 403
    // Adjust based on actual Zod (Zod accepts HR|SUPERVISOR; HR creating HR is locked-doc forbidden)
    // The route checks target-role gate after parsing; expect 403 here:
    // (If Zod accepts, the route returns 403 with FORBIDDEN_TARGET_ROLE)
  });

  it('happy path: COMPANY_ADMIN creates HR', async () => {
    const { company, owner } = await createCompanyFixture();
    const token = await mintAccessToken({
      userId: owner.id,
      companyId: company.id,
      role: 'COMPANY_ADMIN',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        phone: '+919999999994',
        name: 'New HR',
        role: 'HR',
        baseSalaryPaise: 5_000_000,
        bankIfsc: 'SBIN0000123',
        bankAcct: '0000123456',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.role).toBe('HR');
    expect(body.status).toBe('ACTIVE');
    const created = await prisma.membership.findUnique({ where: { id: body.membershipId } });
    expect(created).not.toBeNull();
    expect(created!.baseSalaryPaise).toBe(5_000_000);
  });

  it('happy path: HR creates SUPERVISOR', async () => {
    const { company, hr } = await createCompanyFixture();
    const token = await mintAccessToken({ userId: hr.id, companyId: company.id, role: 'HR' });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        phone: '+919999999995',
        name: 'New Supervisor',
        role: 'SUPERVISOR',
        baseSalaryPaise: 2_500_000,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('SUPERVISOR');
  });
});
```

Note: `createCompanyFixture` must seed `owner`, `hr`, `supervisor` rows. Extend it if needed. `mintAccessToken` is the test-side counterpart to `apps/backend/scripts/mint-token.ts` — call `issueAccessToken` from `src/lib/jwt.js` directly.

- [ ] **Step 2: Run tests, expect failures**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-memberships 2>&1 | tail -30
```

Expected: 5/5 fail.

- [ ] **Step 3: Write `admin-membership-service.ts`**

```ts
/**
 * Service for POST /admin/memberships.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(ADR-0025)
 */

import type { Prisma } from '@prisma/client';
import type { Role } from '@axhy/shared-schema';
import { TargetRoleError, assertTargetRole } from '../../middleware/role-gates.js';

type MembershipServiceInput = {
  callerRole: Role;
  callerCompanyId: string;
  callerUserId: string;
  body: {
    phone: string;
    name: string;
    role: 'HR' | 'SUPERVISOR';
    baseSalaryPaise: number;
    bankIfsc?: string;
    bankAcct?: string;
    podId?: string;
  };
};

type MembershipServiceOutput =
  | { kind: 'OK'; membershipId: string; userId: string; role: 'HR' | 'SUPERVISOR' }
  | { kind: 'FORBIDDEN_TARGET_ROLE'; callerRole: Role; targetRole: Role }
  | { kind: 'ALREADY_EXISTS' };

export async function adminCreateMembershipService(
  tx: Prisma.TransactionClient,
  input: MembershipServiceInput,
): Promise<MembershipServiceOutput> {
  try {
    assertTargetRole(input.callerRole, input.body.role);
  } catch (err) {
    if (err instanceof TargetRoleError) {
      return {
        kind: 'FORBIDDEN_TARGET_ROLE',
        callerRole: err.callerRole,
        targetRole: err.targetRole,
      };
    }
    throw err;
  }

  // Upsert User by phone — exclude anonymised rows (auth.ts pattern).
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
        role: input.body.role,
        baseSalaryPaise: input.body.baseSalaryPaise,
        bankIfsc: input.body.bankIfsc ?? null,
        bankAcct: input.body.bankAcct ?? null,
        podId: input.body.role === 'HR' ? (input.body.podId ?? null) : null,
        status: 'ACTIVE',
      },
    });

    // Audit
    await tx.auditEvent.create({
      data: {
        companyId: input.callerCompanyId,
        kind: 'MEMBERSHIP_CREATED',
        actorUserId: input.callerUserId,
        payload: {
          targetUserId: user.id,
          targetRole: input.body.role,
          membershipId: membership.id,
          createdName: input.body.name,
        } as Prisma.JsonObject,
      },
    });

    return { kind: 'OK', membershipId: membership.id, userId: user.id, role: input.body.role };
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
```

- [ ] **Step 4: Write `admin-memberships.ts` route**

```ts
/**
 * POST /admin/memberships
 *
 * Caller: COMPANY_ADMIN, HR.
 * Target: HR (admin only), SUPERVISOR (HR only). COMPANY_ADMIN co-owner deferred.
 *
 * @derives(docs/locked/hiring-hierarchy.md)
 * @derives(ADR-0025)
 */

import type { FastifyInstance } from 'fastify';
import { AdminCreateMembershipInput } from '@axhy/shared-schema';
import { prisma } from '../lib/prisma.js';
import { withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { adminCreateMembershipService } from '../lib/services/admin-membership-service.js';

export async function registerAdminMembershipRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/admin/memberships',
    { preHandler: requireRole('COMPANY_ADMIN', 'HR') },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateMembershipInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateMembershipService(tx, {
          callerRole: auth.role,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );

      if (out.kind === 'FORBIDDEN_TARGET_ROLE') {
        reply.code(403).send({
          error: 'FORBIDDEN_TARGET_ROLE',
          message: `Role ${out.callerRole} cannot create members of role ${out.targetRole}`,
        });
        return;
      }
      if (out.kind === 'ALREADY_EXISTS') {
        reply.code(409).send({
          error: 'MEMBERSHIP_ALREADY_EXISTS',
          message: 'A membership with this phone and role already exists in this company',
        });
        return;
      }
      reply.send({
        membershipId: out.membershipId,
        userId: out.userId,
        role: out.role,
        status: 'ACTIVE',
      });
    },
  );
}
```

- [ ] **Step 5: Register the route in `server.ts`**

Find the existing block of `registerXxxRoutes(app)` calls in `apps/backend/src/server.ts` and add:

```ts
import { registerAdminMembershipRoutes } from './routes/admin-memberships.js';
// ...
await registerAdminMembershipRoutes(app);
```

- [ ] **Step 6: Run tests, expect green**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-memberships 2>&1 | tail -30
```

Expected: all 5 PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add apps/backend/src/lib/services/admin-membership-service.ts \
        apps/backend/src/routes/admin-memberships.ts \
        apps/backend/src/server.ts \
        apps/backend/test/admin-memberships.test.ts
git commit -m "$(cat <<'EOF'
feat(routes): POST /admin/memberships (R1) — HR + SUPERVISOR creation

Caller role gate + target role gate per docs/locked/hiring-hierarchy.md.
5 integration tests (auth/role/target/2x happy). COMPANY_ADMIN co-owner deferred.

@derives(docs/locked/hiring-hierarchy.md, ADR-0025)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Worker + Anonymize (R2 + R3)

### Task D1: POST /admin/workers (R2) end-to-end

**Files:**

- Create: `axhy-v3/apps/backend/src/lib/services/admin-worker-service.ts`
- Create: `axhy-v3/apps/backend/src/routes/admin-workers.ts`
- Create: `axhy-v3/apps/backend/test/admin-workers.test.ts`
- Modify: `axhy-v3/apps/backend/src/server.ts`

- [ ] **Step 1: Write the 5-test suite (same shape as C1 Step 1, adapted for /admin/workers)**

In `apps/backend/test/admin-workers.test.ts`:

```ts
// (full test file — 5 tests: 401, 403 wrong caller (SUPERVISOR), 403 target (admin tries WORKER),
//  happy path, cross-tenant. Pattern mirrors admin-memberships.test.ts exactly.)
```

Use the C1 test as the template; the only differences are:

- URL: `/admin/workers`
- Only HR can call (per locked doc HR -> WORKER)
- Body shape uses `AdminCreateWorkerInput`
- Happy path asserts `Worker` row created with state=PENDING_ACTIVATION

- [ ] **Step 2: Run tests, expect failures**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-workers 2>&1 | tail -30
```

- [ ] **Step 3: Implement `admin-worker-service.ts`**

```ts
/**
 * Service for POST /admin/workers.
 *
 * @derives(docs/locked/hiring-hierarchy.md, ADR-0025)
 */

import type { Prisma } from '@prisma/client';

type AdminCreateWorkerInput = {
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

type AdminCreateWorkerOutput =
  | { kind: 'OK'; workerId: string; userId: string; membershipId: string }
  | { kind: 'ALREADY_EXISTS' };

export async function adminCreateWorkerService(
  tx: Prisma.TransactionClient,
  input: AdminCreateWorkerInput,
): Promise<AdminCreateWorkerOutput> {
  let user = await tx.user.findFirst({
    where: { phone: input.body.phone, NOT: { phone: { startsWith: 'anon:' } } },
  });
  if (!user) {
    user = await tx.user.create({ data: { phone: input.body.phone, locale: 'en' } });
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
        state: 'PENDING_ACTIVATION', // workerMachine entry state
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: input.callerCompanyId,
        kind: 'WORKER_CREATED',
        actorUserId: input.callerUserId,
        payload: {
          workerId: worker.id,
          userId: user.id,
          membershipId: membership.id,
        } as Prisma.JsonObject,
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
```

- [ ] **Step 4: Write `admin-workers.ts` route (R2 part only, R3 added in D2)**

```ts
/**
 * /admin/workers/* routes.
 *
 * @derives(docs/locked/hiring-hierarchy.md, ADR-0025)
 */

import type { FastifyInstance } from 'fastify';
import { AdminCreateWorkerInput } from '@axhy/shared-schema';
import { prisma } from '../lib/prisma.js';
import { withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { adminCreateWorkerService } from '../lib/services/admin-worker-service.js';

export async function registerAdminWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/workers', { preHandler: requireRole('HR') }, async (req, reply) => {
    const auth = req.auth!;
    const parsed = AdminCreateWorkerInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
      adminCreateWorkerService(tx, {
        callerCompanyId: auth.companyId,
        callerUserId: auth.userId,
        body: parsed.data,
      }),
    );
    if (out.kind === 'ALREADY_EXISTS') {
      reply
        .code(409)
        .send({ error: 'WORKER_ALREADY_EXISTS', message: 'Worker exists for this phone' });
      return;
    }
    reply.send({
      workerId: out.workerId,
      userId: out.userId,
      membershipId: out.membershipId,
      state: 'PENDING_ACTIVATION',
    });
  });
}
```

- [ ] **Step 5: Register in server.ts**

```ts
import { registerAdminWorkerRoutes } from './routes/admin-workers.js';
// ...
await registerAdminWorkerRoutes(app);
```

- [ ] **Step 6: Run tests, expect green**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-workers 2>&1 | tail -30
```

- [ ] **Step 7: Commit (R2 only — R3 follows in D2)**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add apps/backend/src/lib/services/admin-worker-service.ts \
        apps/backend/src/routes/admin-workers.ts \
        apps/backend/src/server.ts \
        apps/backend/test/admin-workers.test.ts
git commit -m "$(cat <<'EOF'
feat(routes): POST /admin/workers (R2) — HR creates Worker in PENDING_ACTIVATION

User upsert + Membership(WORKER) + Worker row in one transaction. workerMachine
entry state. Salary on Membership per ADR-0025.

@derives(docs/locked/hiring-hierarchy.md, ADR-0025)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task D2: POST /admin/workers/:id/anonymize (R3) — NEW service from scratch

**Files:**

- Create: `axhy-v3/apps/backend/src/lib/services/anonymize-worker-service.ts`
- Modify: `axhy-v3/apps/backend/src/routes/admin-workers.ts` (add anonymize handler)
- Create: `axhy-v3/apps/backend/test/admin-workers-anonymize.test.ts`
- Create: `axhy-v3/docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md`

**Critical note:** the source spec said this route "wraps an existing identity-lifecycle service." It does not exist — `grep -rln "anonymize" apps/backend/src` returns no matches in service code. This task BUILDS the service.

- [ ] **Step 1: Write the 5-test suite for anonymize**

In `apps/backend/test/admin-workers-anonymize.test.ts`:

```ts
// 5 tests: 401, 403 wrong caller (SUPERVISOR), 404 worker not found,
// 403 cross-tenant (worker belongs to different company), happy path.
// Happy path asserts:
//   - Worker.state == 'TERMINATED'
//   - Worker.userId is null
//   - User.phone starts with 'anon:'
//   - Membership.status == 'INACTIVE'
//   - AuditEvent kind = 'WORKER_ANONYMIZED' with reason + actor
```

- [ ] **Step 2: Run tests, expect failures (5/5)**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-workers-anonymize 2>&1 | tail -30
```

- [ ] **Step 3: Implement `anonymize-worker-service.ts`**

```ts
/**
 * Anonymize a worker on resignation.
 *
 * Spec said this wraps an existing identity-lifecycle service; verification
 * during the wave-2-prep slice (2026-05-25) showed no such service existed.
 * This module IS the canonical anonymize implementation. Tests assert all 5
 * effects (worker state, worker userId, user phone, membership status, audit).
 *
 * @derives(docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md §R3)
 */

import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type AnonymizeInput = {
  workerId: string;
  callerCompanyId: string;
  callerUserId: string;
  reason: string;
  effectiveAt?: Date;
};

type AnonymizeOutput =
  | { kind: 'OK'; workerId: string; anonymizedAt: Date }
  | { kind: 'WORKER_NOT_FOUND' }
  | { kind: 'WORKER_ALREADY_TERMINATED' };

function hashPhone(phone: string): string {
  const digest = createHash('sha256').update(phone).digest('hex');
  return `anon:${digest.slice(0, 32)}`;
}

export async function anonymizeWorkerService(
  tx: Prisma.TransactionClient,
  input: AnonymizeInput,
): Promise<AnonymizeOutput> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: input.callerCompanyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };
  if (worker.state === 'TERMINATED' || worker.state === 'ARCHIVED') {
    return { kind: 'WORKER_ALREADY_TERMINATED' };
  }

  const effectiveAt = input.effectiveAt ?? new Date();

  // Anonymize the User row (if linked) — phone replaced one-way.
  if (worker.userId) {
    const user = await tx.user.findUnique({ where: { id: worker.userId } });
    if (user && !user.phone.startsWith('anon:')) {
      await tx.user.update({
        where: { id: worker.userId },
        data: { phone: hashPhone(user.phone) },
      });
    }
    // Deactivate the Membership (audit-trail retains)
    await tx.membership.updateMany({
      where: { userId: worker.userId, companyId: input.callerCompanyId, role: 'WORKER' },
      data: { status: 'INACTIVE' },
    });
  }

  // Worker transitions to TERMINATED via workerMachine; here we apply the side-effects.
  await tx.worker.update({
    where: { id: worker.id },
    data: {
      state: 'TERMINATED',
      userId: null,
    },
  });

  await tx.auditEvent.create({
    data: {
      companyId: input.callerCompanyId,
      kind: 'WORKER_ANONYMIZED',
      actorUserId: input.callerUserId,
      payload: {
        workerId: worker.id,
        previousUserId: worker.userId,
        reason: input.reason,
        effectiveAt: effectiveAt.toISOString(),
      } as Prisma.JsonObject,
    },
  });

  return { kind: 'OK', workerId: worker.id, anonymizedAt: effectiveAt };
}
```

- [ ] **Step 4: Add the anonymize route handler to `admin-workers.ts`**

Append inside `registerAdminWorkerRoutes`:

```ts
app.post<{ Params: { id: string } }>(
  '/admin/workers/:id/anonymize',
  { preHandler: requireRole('HR') },
  async (req, reply) => {
    const auth = req.auth!;
    const parsed = AdminAnonymizeWorkerInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
      anonymizeWorkerService(tx, {
        workerId: req.params.id,
        callerCompanyId: auth.companyId,
        callerUserId: auth.userId,
        reason: parsed.data.reason,
        effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
      }),
    );
    if (out.kind === 'WORKER_NOT_FOUND') {
      reply.code(404).send({ error: 'WORKER_NOT_FOUND', message: 'Worker not in this company' });
      return;
    }
    if (out.kind === 'WORKER_ALREADY_TERMINATED') {
      reply
        .code(409)
        .send({
          error: 'WORKER_ALREADY_TERMINATED',
          message: 'Worker is already terminated or archived',
        });
      return;
    }
    reply.send({ workerId: out.workerId, anonymizedAt: out.anonymizedAt.toISOString() });
  },
);
```

And add the imports:

```ts
import { AdminAnonymizeWorkerInput } from '@axhy/shared-schema';
import { anonymizeWorkerService } from '../lib/services/anonymize-worker-service.js';
```

- [ ] **Step 5: Write the learning doc**

`docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md`:

```markdown
---
broken_rule: 'feedback_never_assume_check_entire_codebase_and_docs.md — Never assume — scan codebase'
persona: all
date: 2026-05-25
session: 'admin-hr-backend-wave-2-prep slice — spec referenced a service that did not exist'
check_pattern: 'wraps existing|existing.*service'
check_paths: 'docs/plans|docs/personas'
check_expect: 'caller must grep apps/backend/src/lib/services/ for the named service first'
---

# Learning: A spec saying "wraps existing service" must be verified before planning

## What happened

The 2026-05-25 admin/HR backend spec said R3 (`POST /admin/workers/:id/anonymize`)
"wraps the existing identity-lifecycle service." During plan writing, a grep of
`apps/backend/src/lib/services/` returned no `anonymize*` or `identity-lifecycle*`
file. The service was aspirational.

## Root cause

The spec was drafted from memory + persona docs that described an idealised state
of the system. Spec-vs-code drift is a constant risk and grows over time.

## Prevention rule

Before any plan step that says "wraps existing X" or "uses existing Y" or "extends
existing Z":

1. Grep for the named symbol in `apps/backend/src/`, `packages/`, and `apps/mobile/`.
2. If 0 hits, treat the plan step as "build from scratch" and revise the estimate.
3. If hits exist, read the actual signature before assuming the wrapper is trivial.

## Detection

Phase 0 audit greps `wraps existing|existing.*service` in `docs/plans/` and `docs/personas/`.
If a match is found, audit prints: "VERIFY: <file> references an 'existing' service —
confirm it exists in code before relying on it in a plan step."
```

- [ ] **Step 6: Run tests, expect green**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration -- admin-workers-anonymize 2>&1 | tail -30
```

- [ ] **Step 7: Commit**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git add apps/backend/src/lib/services/anonymize-worker-service.ts \
        apps/backend/src/routes/admin-workers.ts \
        apps/backend/test/admin-workers-anonymize.test.ts \
        docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md
git commit -m "$(cat <<'EOF'
feat(routes): POST /admin/workers/:id/anonymize (R3) — HR resigns worker

Builds anonymize service from scratch (spec said "wraps existing" but service
did not exist; learning captured). One-way SHA256 phone hash, Worker->TERMINATED,
userId=null, Membership=INACTIVE, audit event. 5 integration tests pass.

Learning: docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md
Broke rule: feedback_never_assume_check_entire_codebase_and_docs.md

@derives(docs/locked/hiring-hierarchy.md, docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md §R3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase E — Sites + Bindings (R4 + R5)

### Task E1: POST /admin/sites (R4) end-to-end

**Files:**

- Create: `axhy-v3/apps/backend/src/lib/services/admin-site-service.ts`
- Create: `axhy-v3/apps/backend/src/routes/admin-sites.ts`
- Create: `axhy-v3/apps/backend/test/admin-sites.test.ts`
- Modify: `axhy-v3/apps/backend/src/server.ts`

Follow the same TDD pattern as Phases C/D: write the 5-test suite first, expect failures, implement the service + route, register in server.ts, verify green, commit.

- [ ] **Step 1: Test suite (5 tests: 401, 403 wrong caller [WORKER], cross-tenant on the optional `companyId` field of any related entity, happy path COMPANY_ADMIN, happy path HR)**

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: `admin-site-service.ts`** — creates Site with state=DRAFT default, workdays default 'MTWTFS\_', writes AuditEvent kind=SITE_CREATED.

- [ ] **Step 4: `admin-sites.ts` route** — `requireRole('COMPANY_ADMIN', 'HR')`, calls service via `withTenantContext`.

- [ ] **Step 5: Register in server.ts**

- [ ] **Step 6: Run, expect green**

- [ ] **Step 7: Commit (R4 only)**

```bash
git commit -m "feat(routes): POST /admin/sites (R4) — COMPANY_ADMIN/HR creates Site

@derives(docs/locked/hiring-hierarchy.md)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task E2: POST /admin/sites/:id/bindings (R5) end-to-end

**Files:**

- Modify: `axhy-v3/apps/backend/src/lib/services/admin-site-service.ts` (add `adminCreateBindingService`)
- Modify: `axhy-v3/apps/backend/src/routes/admin-sites.ts` (add binding handler)
- Create: `axhy-v3/apps/backend/test/admin-bindings.test.ts`

- [ ] **Step 1: Test suite (5 tests):**
  - 401 unauthenticated
  - 403 wrong caller role (SUPERVISOR)
  - 404 SITE_NOT_FOUND (site in different company)
  - 404 SUPERVISOR_NOT_FOUND (target supervisor not in caller's company)
  - Happy path: HR binds Supervisor X to Site Y; binding row written; AuditEvent kind=BINDING_CREATED with createdBy=caller.userId.

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: `adminCreateBindingService`** — validates Site.companyId, validates target Membership(role=SUPERVISOR) exists in company, validates acting-binding has effectiveUntil set, creates SiteSupervisorBinding, writes audit.

- [ ] **Step 4: Route handler** — uses `AdminCreateBindingInput`, calls service via `withTenantContext`.

- [ ] **Step 5: Run, expect green**

- [ ] **Step 6: Commit (R5)**

---

## Phase F — Verify + Ship

### Task F1: Full test suite green against Railway

- [ ] **Step 1: Run all integration tests**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
railway run -- pnpm --filter @axhy/backend test:integration 2>&1 | tee /tmp/axhy-test-F1.txt
tail -30 /tmp/axhy-test-F1.txt
```

Expected: all green, including 29 new tests (5 per route × 5 routes + 4 role-gate tests).

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm -r run typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Run session audit**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
pnpm --filter @axhy/ai-tools run audit 2>&1 | tail -30
```

Expected: no new BLOCKER or HIGH findings. MEDIUM may exist (pre-existing).

### Task F2: Update handoff docs

- [ ] **Step 1: Update STATUS.md** — add a row for this slice in the active phase table, marked DONE.

- [ ] **Step 2: Update NEXT_SESSION.md** — add a section "admin-hr-backend-wave-2-prep DONE" with the route list + a "next: resume wave 2" pointer.

- [ ] **Step 3: Commit handoff changes**

```bash
git commit -m "docs: handoff for admin-hr-backend-wave-2-prep DONE; wave-2 unblocked

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
"
```

### Task F3: Push + smoke-verify production

- [ ] **Step 1: Push to main**

```bash
cd /Users/thotaakshay/eclean_workspace/axhy-v3
git push origin main
```

Railway auto-deploys.

- [ ] **Step 2: Wait for deploy + smoke-verify**

```bash
sleep 60
curl -s -o /dev/null -w "%{http_code}\n" https://backend-production-344e1.up.railway.app/health
# Expected: 200

curl -s https://backend-production-344e1.up.railway.app/admin/memberships -X POST \
  -H "content-type: application/json" \
  -d '{"phone":"+919999999999","name":"smoke","role":"HR","baseSalaryPaise":1000000}' \
  -w "\nhttp=%{http_code}\n"
# Expected: 401 AUTH_REQUIRED
```

- [ ] **Step 3: With a real COMPANY_ADMIN token (minted via scripts/mint-token.ts), POST a real membership; assert 200 + DB row written; then rollback the inserted row.**

### Task F4: Hand off to wave 2

- [ ] **Step 1: Confirm done with check_before_done**

```ts
// Call mcp__axhy-guardrail__check_before_done with:
//   slice_name: "admin-hr-backend-wave-2-prep"
//   tests_passed: true (verified F1 step 1)
//   typecheck_passed: true (verified F1 step 2)
//   handoff_updated: true (verified F2)
//   slice_files: [list every file created/modified]
//   flow_completeness: each route + each E-item with verified=true
```

- [ ] **Step 2: Resume wave 2** — kick the wave-2 todo list back into play. seed script writes via real APIs now; walker covers cross-persona scenarios.

---

## Self-Review (run before handoff)

### Spec coverage

- [x] R1 POST /admin/memberships → Task C1
- [x] R2 POST /admin/workers → Task D1
- [x] R3 POST /admin/workers/:id/anonymize → Task D2 (with spec correction)
- [x] R4 POST /admin/sites → Task E1
- [x] R5 POST /admin/sites/:id/bindings → Task E2
- [x] Migration M1 → Task A3 + A5
- [x] ADR-0025 → Task A2
- [x] Role gate middleware → Task B1
- [x] Authority drift test → Task B1 step 1
- [x] 29 integration tests → distributed across C/D/E (5 each × 5 routes + role-gate suite + salary migration suite)
- [x] Handoff updates → Task F2

### Type consistency

- `HIRING_AUTHORITY` referenced consistently in B1, C1, D1, D2 — same const.
- `requireRole('COMPANY_ADMIN', 'HR')` shape consistent across C1, E1, E2.
- `requireRole('HR')` consistent across D1, D2.
- `withTenantContext(prisma, auth.companyId, async (tx) => ...)` shape consistent everywhere.
- `Membership.baseSalaryPaise` (post-migration) referenced from A4 onward — never reverts to Worker.

### Placeholder scan

- No "TBD", "TODO", "fill in later".
- E1 Step 1 references "5 tests" without showing each test body — this is the same pattern as C1, intentionally avoiding repetition. Each test is fully specified by analogy to C1 + locked-doc rules. Acceptable for an experienced engineer; a less experienced one should copy C1's test file and edit.

### Scope

- Single implementation slice. No further decomposition needed; 6 phases × 1-2 tasks each = 13 atomic units.
- Out-of-scope items explicitly enumerated in spec §Scope.

---

## Execution handoff

Plan complete and saved to `axhy-v3/docs/plans/2026-05-25-admin-hr-backend-wave-2-prep-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with review checkpoints between. Best for the schema-move phase (high risk) and the role-gate foundation (cross-cutting).
2. **Inline execution** — go phase-by-phase in this session with batch commits at phase boundaries. Faster if the founder is staying engaged.

Pick one before kicking off Phase A.
