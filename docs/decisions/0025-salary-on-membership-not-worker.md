# ADR-0025: Salary belongs on Membership, not Worker

- **Status:** Accepted
- **Date:** 2026-05-25
- **Master plan §:** §G (data model invariants)
- **Panel debate:** founder-direct (single-step constitutional decision)
- **Supersedes:** none

## Context

The `Worker` model carries three payroll fields: `baseSalaryPaise` (Int, default 0), `bankIfsc` (String?, @personal), `bankAcct` (String?, @personal). These were placed there in early scaffolding when Worker was the only "paid role" entity in the schema. The wave-2 cross-persona QA preparation (2026-05-25) surfaced that HR and Supervisor roles are also salaried in Indian cleaning companies, and the current schema has nowhere to persist their pay or bank details.

Forces at play:

- HR is a salaried employee (~₹25,000-50,000/month in mid-size cleaning shops); Supervisor too (~₹15,000-25,000/month). Today they cannot exist in our schema with salary information.
- The hiring hierarchy lock (`docs/locked/hiring-hierarchy.md`) requires admin/HR routes to create memberships for HR and Supervisor. If those routes can't accept salary, every onboarding flow has a hole.
- Worker is the only role-specific entity table because it carries lifecycle state, joining date, and worker-only fields like `preferredLanguage`. HR and Supervisor don't have analogous tables — their identity lives entirely in User + Membership.

## Options considered

| Option                                                                         | Pros                                                                                                                                                                                                                                                              | Cons                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Move salary + bank fields from Worker to Membership                         | Mirrors Zoho Payroll / RazorpayX / TallyPrime / Workday / BambooHR convention. Every paid role gets salary fields uniformly. Worker keeps only role-specific lifecycle data. When a worker is promoted to supervisor, salary travels with the new Membership row. | One-time migration with backfill. Downstream consumer updates (1 prod service + 8 test files + 2 seed scripts).                                                            |
| B: Keep salary on Worker; add duplicate fields to Membership for HR/Supervisor | No migration needed for existing data.                                                                                                                                                                                                                            | Two sources of truth for Worker pay (Worker.baseSalaryPaise vs Membership.baseSalaryPaise where role=WORKER). Inconsistency risk. Future refactors must keep them in sync. |
| C: Add a new Employment table that Worker references                           | Most normalised; would also accommodate SalaryHistory later.                                                                                                                                                                                                      | Membership IS the employment record in this schema; introducing another table doubles the indirection without benefit until SalaryHistory becomes a real requirement.      |

## Decision

We chose **Option A**.

Salary is a function of `(Person, Company, Role)`, which is precisely what Membership represents. Every production-grade Indian payroll system stores compensation on the employment record, not on a role-specific table:

- Zoho Payroll: salary on `employee_compensation` linked to the Employee + Job role.
- RazorpayX Payroll: `salary_structure` keyed by employment_id.
- TallyPrime: salary on Employee Master with Designation as a separate dimension.
- Workday, BambooHR, Deel: same "compensation per employment" pattern, internationalised.

A role-specific table like `Worker` should hold only fields that don't generalise to other roles: the workerMachine state, the worker's preferred notification language for visit alerts, the joining date for the worker-specific tenure.

## Consequences

### Positive

- HR and Supervisor onboarding routes (this slice) can accept salary at create time.
- Wave-2 cross-persona QA can verify HR + Supervisor flows with realistic data.
- Future role additions (e.g., FACILITY_MANAGER) inherit salary handling for free.
- Code mental model is honest: salary lives where employment lives.

### Negative

- Migration `20260525_019_salary_to_membership` requires a backfill step. Reversible via the down-migration SQL commented at the bottom of the migration file.
- `markAbsentService` adds one Membership join per call. Already indexed on `Membership @@unique([companyId, userId, role])`; no measurable latency impact.
- 8 existing test files inline `baseSalaryPaise` on `prisma.worker.create({ data: ... })`. They get migrated mechanically to `prisma.membership.create({ data: ... })`.
- 2 seed scripts (`seed-sandbox.ts`, `seed-demo-today.ts`) update similarly.

### Migration plan

1. Add 3 columns to Membership (default 0 / null).
2. Backfill from Worker to matching Membership rows (where role=WORKER).
3. DO-block verification — count match between Worker rows and backfilled Membership rows.
4. Drop the 3 columns from Worker.

Rollback path: down-migration SQL in the migration file (copies back from Membership to Worker, drops Membership columns). Only run with founder approval.

## References

- `docs/locked/hiring-hierarchy.md` — hiring authority that this schema serves
- `docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md` — design spec
- `docs/plans/2026-05-25-admin-hr-backend-wave-2-prep-implementation.md` — implementation plan
- `/tmp/axhy-salary-consumers.txt` — full consumer enumeration (Task A1 grep output)
