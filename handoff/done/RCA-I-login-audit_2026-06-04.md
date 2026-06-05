# Done memo — RCA-I login audit (2026-06-04)

**Slice:** make logins auditable + stop swallowing the worker-activation transition failure silently.

## What shipped (NOT pushed — fix-only)

**Backend (1 file):** `apps/backend/src/routes/auth.ts` — `POST /auth/otp/verify`:

1. On a successful verify, records a **best-effort `AUTH_LOGIN`** AuditEvent scoped to `active.companyId` (actorId=`user.id`; payload: role, membershipId, availableRoles, truncated ip). Previously a successful verify issued tokens but recorded nothing for already-active workers and for every supervisor/HR/owner login.
2. In the existing worker `OTP_VERIFIED` transition catch, also records a **best-effort `WORKER_ACTIVATION_TRANSITION_FAILED`** AuditEvent (payload: membershipId, reason) so the previously-silent failure (warn-log only) is queryable for ops.

- Both writes are wrapped in their own try/catch → an audit failure logs but **never blocks login**.

**Test (1 file):** `apps/backend/test/auth-login-audit.test.ts` (new) — multi-company real-DB.

## Decisions

- **Granular OTP failure reason codes REJECTED on security grounds.** The RCA plan listed "return a reason code on OTP failure" — but distinguishing expired/consumed/invalid is an **OTP enumeration oracle** (tells an attacker a code _was_ issued for a phone). Kept the single generic `OTP_INVALID` (401). This is the secure standard.
- `AuditEvent.kind` is a free string → no Prisma schema change.
- **INVARIANT 3 preserved** — the verify path still never creates a Company; only audit writes were added.

## Verification (Railway prod DB `DATABASE_PUBLIC_URL`, 2 tenants)

- `auth-login-audit.test.ts` — **4/4 green**: worker login writes exactly 1 `AUTH_LOGIN` scoped to the active company (payload role=WORKER, via=otp); supervisor login audits (role=SUPERVISOR); multi-company isolation (co2 login audits to co2 only, zero in co1); one row per login (second login → +1).
- Regression: `auth-flow.test.ts` + `auth-flow-new-format.test.ts` — **10/10 green** (verify, wrong-code 401, no-membership 403, F1 claims, worker activation transition all unaffected).
- `pnpm --filter @axhy/backend run typecheck` — **clean** (confirms `recordAuditEvent(prisma, …)` is structurally valid).

## Known gaps (NOT in this slice)

- `OTP_REQUESTED` is intentionally NOT audited (no company context at request time, high volume, low forensic value).
- The `WORKER_ACTIVATION_TRANSITION_FAILED` audit is defensive and not unit-tested (requires fault injection to force a transition throw) — covered by code review + the best-effort wrapper.
- consent `policyVersion` validation is a separate item (worker-consent).
