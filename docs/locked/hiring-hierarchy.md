---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-25
Category: architecture_lock
---

# Hiring Hierarchy — Who Creates Whom

## The Rule

```
OWNER (the owner)
   ↓ creates
HR (trusted, 2-5 people in a 2K-employee shop)
   ↓ creates
SUPERVISOR  &  WORKER
   ↓ creates
(nothing — supervisors and workers do not onboard anyone)
```

## Authority Table

| Caller role | Can create Membership for role | Notes                                                                         |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------- |
| SUPER_ADMIN | OWNER                          | Platform-level. Bootstraps a brand-new tenant company.                        |
| OWNER       | HR, OWNER                      | Owner adds HR (rare, 1-2 per year). May add a co-owner.                       |
| HR          | SUPERVISOR, WORKER             | The high-volume hiring path. Daily worker creates, weekly supervisor creates. |
| SUPERVISOR  | (none)                         | Supervisors do not onboard anyone. They request replacements.                 |
| WORKER      | (none)                         | Workers do not onboard anyone.                                                |

## Why this matches reality

Indian cleaning companies of 200-2,000 employees run on a high-trust HR layer. The owner (OWNER) is occupied with client contracts, payroll signoff, and capacity planning — they hire 2-5 HR people in a year and trust them with daily hiring. HR is typically a 5-10 year employee who runs onboarding for both workers (high churn, 15-20% monthly) and supervisors (1 supervisor per 20-30 workers; in a 2K shop that means ~70-100 supervisors with weekly turnover).

Supervisors manage workers in the field. They handle attendance, photo verification, complaints, and site-level decisions. They do not hire. When they need a replacement worker, they raise a request to HR.

This rule reflects how cleaning companies actually operate, not how SaaS dashboards typically wire approvals.

## Forbidden patterns

- **Supervisor creates a worker.** Future routes must reject this with `403 FORBIDDEN_WRONG_ROLE`. If a customer asks to enable supervisor-creates-worker (e.g., for a site supervisor who handles their own onboarding), it requires a constitutional session with the founder. Do not add a "feature flag" workaround.
- **Approval gate between HR-creates-supervisor.** No two-step "HR proposes, ADMIN approves" flow. HR creates supervisor directly. If a larger shop later asks for an approval gate, treat it as a new feature in a separate slice, not a default for everyone.
- **Worker self-signs-up via a public landing.** OTP verify can match an existing User row to an existing Membership, but it cannot create a Membership for a new worker. New workers must be created by HR first.

## How this composes with the rule hierarchy

The rule-hierarchy doc (`rule-hierarchy-three-layers.md`) governs who writes policy rules. This doc governs who creates members. The two are parallel and independent:

| Authority on rules                 | Authority on hiring       |
| ---------------------------------- | ------------------------- |
| Layer 1: OWNER (Policy rules)      | Hires HR                  |
| Layer 2: HR + OWNER (Policy rules) | Hires SUPERVISOR + WORKER |
| Layer 3: SUPERVISOR (LivingDoc)    | Hires nobody              |

A supervisor cannot create members, AND cannot write Layer 1/Layer 2 rules. The layer descends with hiring authority.

## Enforcement

Every admin/HR membership-creation route enforces the table above via:

1. **Role gate (preHandler).** The route's role check rejects unauthorized callers with `403 FORBIDDEN_WRONG_ROLE` before any business logic runs.
2. **Target-role gate (in handler).** After parsing the request body, the handler checks `(callerRole, targetRole)` against the authority table. Mismatch → `403 FORBIDDEN_TARGET_ROLE`.
3. **Tenant gate (existing pattern).** All creates filter by `companyId` from the caller's JWT; cross-tenant creates impossible.
4. **Audit trail.** Every membership create writes an AuditEvent (`MEMBERSHIP_CREATED`) with `actorUserId`, `targetUserId`, `targetRole`, `companyId`.

## Amendment process

This is a locked architectural invariant. Future changes require:

1. Open a constitutional session with the founder.
2. Document the new authority table + the real-world scenario that motivates the change.
3. Add an `## Amendment YYYY-MM-DD` section to this file; do not edit the original rule. The amendment cites the founder's approval message and the panel that reviewed it.
4. Cascade: re-audit every admin/HR route to apply the new rule.

No code change to admin/HR routes is allowed if it contradicts this doc, even if the change "looks safer" or "is more flexible." Cleaning company hiring is the model; SaaS dashboard convention is not.
