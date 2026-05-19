---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Development Code Standards

## The 10 Development Rules

When Claude Code builds ANY part of the Axhy system, these rules apply. No exceptions. No "this is just a quick fix." No "I'll clean it up later."

### D1: SCHEMA IS LAW

schema.prisma is the single source of truth (ADR-0003). Every field, every relation, every index, every constraint is intentional. If you need a field that doesn't exist, create a Prisma migration. Never work around missing fields with JSON columns, localStorage, or in-memory state.

### D2: STATE MACHINES ARE INVARIANTS

Every state machine in packages/state-machines/ defines legal transitions. If a transition doesn't exist in the machine, it doesn't exist in the product. Never add a state transition without updating the state machine first. Never bypass a state machine with a direct DB update.

### D3: MODELS ARE NOT YOUR CHOICE

model-policy.ts assigns models to surfaces. The AI never picks its own model. If you're adding a new AI surface, add it to model-policy.ts with a per-call cost ceiling FIRST. Then build the feature.

### D4: BUDGET IS ENFORCED, NOT LOGGED

assertWithinBudget must be called BEFORE every AI invocation, not after. incrementSpend must happen in the SAME transaction as the domain write. If the transaction rolls back, the spend must also roll back. No orphaned spend increments.

### D5: TENANT ISOLATION IS NON-NEGOTIABLE

Every DB read and write goes through withTenantContext. Every API route uses requireAuth. No raw Prisma calls outside the transaction scope. If you find yourself writing `prisma.chatMessage.findMany()` without a companyId filter, you have a bug.

### D6: DECISIONS ARE PROPOSALS

Every AI-generated action creates a SupervisorDecision in PROPOSED state. Nothing happens in the domain until the supervisor applies it. The ONLY exception is propose_log_complaint (fire-and-display, because complaints are time-sensitive evidence).

### D7: ERRORS ARE SPECIFIC

Never catch an error and return a generic message. Every error has a specific error code, a specific HTTP status, and a specific user-facing message. The frontend maps error codes to localized messages.

### D8: TESTS HIT REAL DB

Integration tests use the axhy-sandbox tenant on the production Railway database. No mocks for DB calls. No mocks for state machine transitions. Mocks are allowed only for external services (OpenAI, Sarvam, Cohere) where the cost-tracking fake vector is used.

### D9: AUDIT EVERYTHING

Every decision apply, every rule change, every membership change, every budget alert creates an AuditEvent. The audit trail is append-only. Never update or delete audit events.

### D10: ONE TRANSACTION OR NO TRANSACTION

If a route does multiple writes (ChatMessage + SupervisorDecision + incrementSpend), ALL writes happen in ONE transaction. If any write fails, ALL roll back. No partial state. No "message saved but decision lost."

## Code Quality Standards

### Every route has these layers:

```
1. requireAuth (JWT verification)
2. withTenantContext (Postgres GUC + RLS)
3. Zod input validation
4. Business logic (service function)
5. Audit event creation
6. Response mapping (never expose internal errors)
```

No route skips any layer. No shortcut routes "for testing."

### Every database write is transactional:

```typescript
// CORRECT:
await withTenantContext(tx => {
  await tx.chatMessage.create(...)
  await tx.supervisorDecision.create(...)
  await incrementSpend(tx, companyId, costInr)
})

// WRONG:
await db.chatMessage.create(...)  // outside transaction
await db.supervisorDecision.create(...)  // separate transaction
```

### Every AI call has a budget gate:

```typescript
// CORRECT:
await assertWithinBudget(surface, estimatedCost, tenantCtx)
const result = await callModel(...)
await incrementSpend(tx, companyId, actualCost)

// WRONG:
const result = await callModel(...)  // no budget check
console.log('spent:', result.cost)   // logging is not enforcement
```

### Every Zod schema has bounds:

```typescript
// CORRECT:
z.string().min(1).max(300);
z.array(ruleSchema).max(100);
z.number().int().positive();

// WRONG:
z.string(); // allows empty string, 10MB string
z.array(ruleSchema); // allows 0 or 1 million items
z.number(); // allows NaN, Infinity, -0
```

### Every error has a code:

```typescript
// CORRECT:
throw new AppError('WORKER_NOT_FOUND', 404, 'Worker not found');
throw new AppError('BUDGET_EXCEEDED', 429, 'Daily AI limit reached');

// WRONG:
throw new Error('something went wrong');
return res.status(500).json({ error: 'Internal error' });
```

## Schema Discipline

When changing the database schema:

1. NEVER modify schema.prisma without creating a migration
2. NEVER add a nullable column that should have a default
3. NEVER remove a column that has FK references
4. NEVER change a column type without migrating existing data
5. ALWAYS add indexes for columns used in WHERE clauses
6. ALWAYS add constraints for business invariants (not just app-level checks)
7. ALWAYS run prisma validate + prisma generate after changes
8. ALWAYS test the migration against axhy-sandbox before merging

## What "Done" Means

A feature is NOT done when the code compiles and the route returns 200.

A feature IS done when ALL of these are true:

- tsc --noEmit clean (no type errors)
- All existing tests still pass
- New tests cover happy path + 3 edge cases
- Integration test hits real DB (axhy-sandbox tenant)
- Zod schemas have bounds on every field
- Audit events created for every state change
- Budget gates enforced for every AI call
- Tenant isolation verified (no cross-company leaks)
- Feature works in the actual app (browser/emulator)
- R6 design comparison done (if UI change)
- impactCheck was run before starting (no locked conflicts)
- No TODO, FIXME, any, or empty catch in committed code
