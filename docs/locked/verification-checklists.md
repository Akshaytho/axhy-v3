---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Verification Checklists

Before marking ANY task as complete, verify against the relevant checklist. These are not optional. Skipping a checklist item is a bug.

## Chat/AI Changes

- [ ] impactCheck run, no hardBlocks
- [ ] Budget gate (assertWithinBudget) called before AI invocation
- [ ] Budget increment in same transaction as domain write
- [ ] Idempotency-Key header required and enforced
- [ ] 50-concurrent semaphore enforced
- [ ] Response includes proper error codes for all failure modes
- [ ] Decision cards created as PROPOSED state
- [ ] LivingDoc changes go through PENDING state
- [ ] Rule hierarchy tested (Layer 1 > Layer 2 > Layer 3)
- [ ] Prompt injection tested with adversarial rule text
- [ ] Multi-language tested (Hindi, Telugu, English, code-switched)

## Schema Changes

- [ ] Prisma migration created and tested
- [ ] Indexes added for query patterns
- [ ] Constraints enforce business invariants at DB level
- [ ] Nullable columns justified (not lazy)
- [ ] Migration is reversible or explicitly one-way
- [ ] Run against axhy-sandbox before merging

## API Routes

- [ ] requireAuth on every route
- [ ] withTenantContext wrapping all DB operations
- [ ] Zod validation with bounds on all fields
- [ ] AuditEvent created for state changes
- [ ] Error codes are specific (not generic 500)
- [ ] Cross-tenant access impossible (RLS + app filter)

## UI Changes

- [ ] R6 design comparison done (side-by-side screenshot)
- [ ] Decision cards render correctly in all states
- [ ] Loading states shown during AI calls
- [ ] Error states shown for all failure modes
- [ ] Works in Hindi/Telugu/English
- [ ] Tested on actual device/emulator
- [ ] Playwright screenshots captured

## Security Changes

- [ ] No raw SQL with string interpolation
- [ ] No `any` types
- [ ] No empty catch blocks
- [ ] Tenant isolation verified
- [ ] Rate limits enforced
- [ ] Audit trail created
- [ ] Input validated and bounded

## Done Memo Requirements

Every completed task produces a done memo with:

- Spec coverage matrix (which spec items were addressed)
- What changed (files, routes, schema)
- What was tested (happy path + edge cases)
- What was NOT tested (with reason)
- Screenshots (if UI change)
- Adversarial panel review (at wave end)
