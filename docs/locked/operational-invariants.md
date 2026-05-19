---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Operational Invariants

These are facts about the system that must ALWAYS be true. Code that violates any invariant is a bug. No exceptions.

## Multi-Tenant Invariants

### INVARIANT 1: No cross-tenant data access

Every query is scoped by companyId. RLS policies enforce this at DB level. App-level filtering is defense-in-depth, not the primary mechanism.

### INVARIANT 2: Company status gates all operations

A SUSPENDED company cannot:

- Send chat messages (403)
- Create assignments (403)
- Run AI calls (403)
- Log in new users (403)

A SUSPENDED company CAN:

- Read existing data (historical access)
- Contact support

### INVARIANT 3: Tenant creation is admin-only

Worker login NEVER creates Company rows. If a worker's company doesn't exist, the login fails with "Company not found. Contact your administrator."

### INVARIANT 4: Hard-delete is SUPER_ADMIN only

COMPANY_ADMIN can soft-delete (set deletedAt). Only SUPER_ADMIN can hard-delete (physical row removal). Cascade delete removes everything.

## Financial Invariants

### INVARIANT 5: AI spend is atomic

incrementSpend uses raw SQL (not Prisma) to atomically increment Company.aiSpendDailyInr. No read-modify-write. No optimistic locking. Just: `UPDATE Company SET aiSpendDailyInr = aiSpendDailyInr + $1`.

### INVARIANT 6: Budget alerts are idempotent

The WARN alert fires once per day per company (idempotency via Outbox). The CAP error fires on every request that exceeds the cap. If the alert system is down, the budget cap still enforces.

### INVARIANT 7: Pricing is per-visit plus monthly floor

Per-completed-task, no per-seat, AI included. The system never charges per AI message or per decision card. The AI cost is part of the visit cost.

## Data Integrity Invariants

### INVARIANT 8: Policy is append-only

Every Policy write creates a new row. Previous rows are preserved with previousValueSnapshot. There is no UPDATE on Policy. There is no DELETE. "Deleting" a policy means inserting a row with value: null.

### INVARIANT 9: Audit events are immutable

AuditEvent rows are INSERT-only. No UPDATE. No DELETE. The audit trail is the legal record of everything that happened.

### INVARIANT 10: LivingDoc rules have state machines

A rule can only transition:

```
PENDING  -> ACTIVE   (supervisor confirms)
PENDING  -> REJECTED (supervisor rejects)
PENDING  -> EXPIRED  (30 days without decision)
ACTIVE   -> EXPIRED  (manual expire or cap overflow)
```

No other transitions. REJECTED rules cannot become ACTIVE. EXPIRED rules cannot become ACTIVE. To re-activate an expired rule, create a new rule with the same text.

### INVARIANT 11: Worker history retained forever

Worker records with child records (assignments, attendance, complaints) are NEVER deleted. Soft-delete only. For GDPR/DPDP: anonymize PII fields but keep the record structure.

## Sustainability Invariants

### INVARIANT 12: No surface picks its own model

model-policy.ts is the single source of truth. Adding a new AI surface requires adding it to model-policy.ts with: model name, vendor, per-call cost ceiling, rationale (why this model, not a cheaper one).

### INVARIANT 13: The 400+ rules moat

The company's accumulated rules (Policy + LivingDoc) are the competitive moat. This data NEVER leaves the system. There is no bulk export API. There is no "download all my rules" feature. If a company churns, their data stays (for legal compliance) but becomes inaccessible.
