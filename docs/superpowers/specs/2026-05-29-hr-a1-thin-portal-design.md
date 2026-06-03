---
title: HR A1 — Thin Admin-Web Portal
date: 2026-05-29
status: APPROVED (autonomous-session self-approval)
authority: spec (candidate)
slice: HR A1
supersedes: none
@derives:
  - docs/personas/HR_PERSONA.md
  - docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md
  - axhy-cognitive-system/memory/base/sop_qa_enterprise_walk.md
---

# HR A1 — Thin Admin-Web Portal Design

> Self-approved 2026-05-29 in autonomous session. Founder pre-authorized full
> design, build, and QA without intermediate review for this session.
> Scope locked per `handoff/STATUS.md` row "HR A1".

## 1. Goal

Stand up a working HR-portal surface in `apps/admin-web` so an HR user can,
end to end and through the UI alone, perform the seven core HR operations
against the already-shipped R1–R5 backend routes plus the leave-decide hook.
Basic UI is fine. Every function must actually work for real testing — no
dead links, no placeholders. This portal unblocks the F1-b 5-persona
enterprise QA walk that otherwise has no HR surface to drive.

The seven operations:

1. Invite an HR or SUPERVISOR membership (R1).
2. Invite a WORKER (R2).
3. View a list of memberships in my pods.
4. View a list of workers in my pods, drill into one, anonymize them (R3).
5. Create a site (R4), view a list of sites, drill into one.
6. Bind a supervisor to a site (R5), view existing bindings on a site.
7. See a pending leave-request inbox for workers in my pods; approve or reject.

## 2. Scope expansion (in A1, autonomous decision)

The five HR backend routes are POST-only. A POST-only portal cannot satisfy
"every function works for real testing" because HR cannot see what they
created without leaving the UI for the database. A1 therefore adds the
minimum GET surface required to make the portal self-evidencing:

| Endpoint                        | Role gate   | Pod scoping | Pagination       |
| ------------------------------- | ----------- | ----------- | ---------------- |
| `GET /admin/memberships`        | OWNER \| HR | HR-only     | cursor, limit≤50 |
| `GET /admin/workers`            | OWNER \| HR | HR-only     | cursor, limit≤50 |
| `GET /admin/workers/:id`        | OWNER \| HR | HR-only     | n/a              |
| `GET /admin/sites`              | OWNER \| HR | tenant      | cursor, limit≤50 |
| `GET /admin/sites/:id`          | OWNER \| HR | tenant      | n/a              |
| `GET /admin/sites/:id/bindings` | OWNER \| HR | tenant      | cursor, limit≤50 |
| `GET /admin/leave-requests`     | HR          | inbox       | cursor, limit≤50 |

"HR-only" pod scoping: when caller role is HR, server filters rows to those
where the related `Membership.podId` belongs to a pod owned by the caller
(`HRPod.primaryOwnerUserId = caller.userId OR backupOwnerUserId = caller.userId`).
When caller role is OWNER, no pod filter is applied — OWNER sees the full
tenant.

"Inbox" pod scoping for leave-requests: when caller is HR, return rows where
`workerId` resolves to a Membership in one of the caller's pods. Supervisor
inbox is out of A1 scope (deferred to the supervisor-surface slice).

Cursor pagination uses opaque base64-encoded `(createdAt, id)` tuples. The
default and maximum `limit` is 50. Responses include `nextCursor` (nullable).

## 3. Backend changes

### 3.1 New GET handlers

Added to the existing route files:

- `apps/backend/src/routes/admin-memberships.ts` — list handler.
- `apps/backend/src/routes/admin-workers.ts` — list + detail handlers.
- `apps/backend/src/routes/admin-sites.ts` — list + detail handlers;
  bindings list as a new sub-route inside the same file.
- `apps/backend/src/routes/leave-requests.ts` — new `GET /leave-requests`
  inbox handler under `requireRole('SUPERVISOR','HR')`.

All new handlers:

1. Run `requireRole(...)` preHandler.
2. Resolve `companyId` from `req.auth.companyId`.
3. When `req.auth.role === 'HR'`, compute `myPodIds` via the helper
   `getMyPodIds(prisma, userId, companyId)` exported from a new
   `apps/backend/src/middleware/pod-scope.ts`.
4. Apply the pod-scoping filter to the Prisma query.
5. Return `{ items, nextCursor }`.

### 3.2 Pod-scope helper

`apps/backend/src/middleware/pod-scope.ts` exports:

- `getMyPodIds(prisma, userId, companyId): Promise<string[]>` — returns the
  IDs of HRPod rows where the user is primary or backup owner within the
  company.
- `requirePodOwnership(prisma, podId, userId, companyId): Promise<void>` —
  throws `PodOwnershipError` if the user is not an owner. Reserved for
  future writes that target a specific pod; not used by A1 GETs directly.

### 3.3 Leave-decide role-gate refinement

`apps/backend/src/routes/leave-requests.ts:121` currently rejects all
non-SUPERVISOR callers. After A1:

```
if (auth.role !== 'SUPERVISOR' && auth.role !== 'HR') {
  reply.code(403).send({ error: 'SUPERVISOR_OR_HR_REQUIRED' });
  return;
}

if (auth.role === 'HR') {
  const workerMembership = await prisma.membership.findFirst({
    where: { userId: leaveRequest.workerId, companyId: auth.companyId },
    select: { podId: true },
  });
  if (!workerMembership?.podId) {
    reply.code(403).send({ error: 'WORKER_NOT_IN_POD' });
    return;
  }
  const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);
  if (!myPodIds.includes(workerMembership.podId)) {
    reply.code(403).send({ error: 'NOT_YOUR_POD' });
    return;
  }
}
```

`auth.userId` and `auth.companyId` are required on the JWT payload. Confirm
during implementation; if `userId` is missing, add it as a
backward-compatible field on access tokens.

### 3.4 Tenant isolation guarantee

Every new query goes through Prisma with an explicit `companyId` filter.
None of the new code touches `prisma.$queryRaw` or bypasses Prisma. The
audit warnings about raw prisma in `notifications.ts` and `auth.ts` are
pre-existing and out of scope for A1.

## 4. Admin-web changes

### 4.1 Token persistence

Today the login page calls `POST /auth/otp/verify` but discards the
response. A1 wires:

1. Login page (`apps/admin-web/app/login/page.tsx`) reads
   `{ accessToken, refreshToken, user: { id, companyId, role } }` from the
   verify response.
2. On success, the page POSTs `{ accessToken, refreshToken }` to
   `apps/admin-web/app/api/auth/session/route.ts` (a Next.js 15 route
   handler).
3. That handler sets two httpOnly cookies:
   - `axhy_at` (accessToken, 15 min, `Secure`, `SameSite=Lax`, `Path=/`).
   - `axhy_rt` (refreshToken, 7 day, `HttpOnly`, `Secure`,
     `SameSite=Lax`, `Path=/api/auth`).
4. Handler returns `{ redirect: '/hr' | '/owner' }` derived from the role.
5. Login page navigates to the returned path.

Refresh-token rotation in admin-web is deferred to a later slice (F1-c).
For A1 the access token is short-lived; HR users re-login on expiry.
Acceptable for a thin testing shell.

### 4.2 Auth helpers

New file `apps/admin-web/lib/auth.ts`:

- `getSession(): Promise<Session | null>` — reads `axhy_at` from
  `cookies()`, verifies via `@axhy/jwt-public` (a re-export of the
  backend's `verifyAccessToken` using the same JWKS), returns
  `{ userId, companyId, role }` or `null` on missing/expired/invalid.
- `requireRole(...roles: Role[]): Promise<Session>` — calls
  `getSession()`, redirects to `/login` if missing, redirects to
  `/forbidden` if role mismatch, returns session otherwise.

If `@axhy/jwt-public` does not exist, A1 adds it as a new shared package
whose only export is `verifyAccessToken` (no dependencies on Prisma,
suitable for the Next.js edge runtime).

### 4.3 API client

New file `apps/admin-web/lib/api.ts`:

- `fetchJson<T>(path, init?): Promise<T>` — reads `axhy_at` from
  `cookies()` (server-action context), sets
  `Authorization: Bearer <token>` and `Accept: application/json`, throws
  `ApiError(status, code, message)` on non-2xx, returns parsed body on
  success.

### 4.4 Routing

```
apps/admin-web/app/
  hr/
    layout.tsx                     — calls requireRole('HR'); renders shell+nav
    error.tsx                      — catches ApiError; on 401 redirects to /login
    page.tsx                       — dashboard (counts)
    memberships/
      page.tsx                     — list
      new/page.tsx                 — invite HR or SUPERVISOR form
    workers/
      page.tsx                     — list
      new/page.tsx                 — invite WORKER form
      [id]/page.tsx                — detail + anonymize button (client modal)
    sites/
      page.tsx                     — list
      new/page.tsx                 — create site form
      [id]/page.tsx                — detail + bindings list + add-binding link
      [id]/bindings/new/page.tsx   — add binding form
    leave-requests/
      page.tsx                     — pending inbox
      [id]/page.tsx                — detail + approve/reject buttons
  api/
    auth/
      session/route.ts             — POST persists tokens, DELETE logs out
  forbidden/page.tsx               — "You do not have access" + link to /login
```

### 4.5 Server-action shape

Every write is a server action co-located with its form. Conventional
signature:

```ts
'use server';
import { cookies } from 'next/headers';
import { fetchJson, ApiError } from '@/lib/api';

export async function inviteWorker(_prev: FormState, formData: FormData): Promise<FormState> {
  // 1. Parse + validate with a local Zod schema (mirror of backend Zod).
  // 2. Call fetchJson('/admin/workers', { method:'POST', body }).
  // 3. On success: revalidatePath('/hr/workers'); return { ok:true, id }.
  // 4. On ApiError(401): redirect('/login').
  // 5. On ApiError(other): return { ok:false, code, message }.
}
```

Forms use `useActionState` (Next 15) so the page can render field-level
errors. Only the form is a client component — the page stays server.

### 4.6 Styling

Follows the existing per-route prefixed-class pattern:

- `app/hr/hr.module.css` — shell, nav, layout.
- `app/hr/memberships/styles.module.css` — list + form.
- and so on.

All colors, spacing, and typography pull from `@axhy/ui-tokens`. No
Tailwind, no shadcn. Forms reuse the input/error classes seen in the
login page (`login-input`, `login-field-error`) but renamed to
`hr-input`, `hr-field-error` inside the HR module.

## 5. Data flow

```
Browser POST /login form
  → page.tsx POSTs /auth/otp/verify (backend)
  → backend returns {accessToken, refreshToken, user}
  → page.tsx POSTs /api/auth/session (admin-web route handler)
  → route handler sets cookies
  → page.tsx navigates to /hr (or /owner)

Server component /hr/workers/page.tsx
  → getSession() → role check
  → fetchJson('/admin/workers?cursor=...&limit=50')
  → renders table

Server action inviteWorker
  → fetchJson('/admin/workers', {method:'POST', body})
  → revalidatePath('/hr/workers')
  → returns FormState
```

## 6. Error handling

| Source            | Path                                               |
| ----------------- | -------------------------------------------------- |
| Backend 401       | server action → `redirect('/login')`               |
| Backend 403       | error boundary → "Not allowed" page                |
| Backend 4xx other | server action → `FormState{ok:false,code,msg}`     |
| Backend 5xx       | error boundary → "Try again" page                  |
| Network failure   | error boundary → "Try again" page                  |
| Zod parse failure | server action → `FormState{ok:false,field errors}` |

No silent swallowing. Every catch path either rethrows, returns a typed
error state, or surfaces a UI message. Satisfies the
`development-anti-cheating.md` no-op-rethrow rule.

## 7. Testing strategy

### 7.1 Backend integration tests

Each new GET handler gets a real-DB integration test in
`apps/backend/src/routes/<file>_test.ts`:

1. Setup: seed an OWNER, HR-A (with pod P1), HR-B (with pod P2), and
   matching memberships/workers/sites across two tenants T1, T2.
2. Assert: HR-A sees only P1 rows in T1; HR-B sees only P2; OWNER sees
   all in T1; nothing crosses to T2.
3. Assert pagination: `limit=2` returns 2 items + `nextCursor`;
   following cursor returns next 2.
4. Assert role-gate: WORKER and SUPERVISOR callers receive 403.

Leave-decide refinement:

1. HR-A approves leave for a worker in P1 → 200.
2. HR-A approves leave for a worker in P2 → 403 NOT_YOUR_POD.
3. SUPERVISOR with active binding approves → 200 (unchanged path).
4. WORKER approves → 403 (unchanged path).

### 7.2 Server-action contract tests

Skipped. Server actions in A1 are thin wrappers around `fetchJson`.
The backend integration tests plus the Playwright E2E cover behavior
end to end.

### 7.3 E2E water-flow (Playwright, per QA Enterprise Walk SOP)

A single Playwright test runs the full HR water-flow:

1. HR logs in via OTP (backend `AXHY_OTP_BYPASS=1`).
2. Lands on `/hr` dashboard, sees counts.
3. Navigates to memberships, invites a SUPERVISOR, sees them in list.
4. Navigates to workers, invites a WORKER, sees them in list.
5. Opens worker detail, anonymizes, sees state change.
6. Navigates to sites, creates a site, sees it in list.
7. Opens site detail, adds a binding for the supervisor, sees binding.
8. Navigates to leave-requests, approves the seeded request, sees the
   row leave the inbox.
9. Logs out, lands on /login.

Each step asserts on visible DOM text, not internal state.

### 7.4 SOP four-layer verification

For each operation in the E2E, a separate verification script asserts
the four layers per `sop_qa_enterprise_walk.md`:

- **UI:** Playwright DOM assertion.
- **Route:** request log confirms the backend handler ran.
- **Primary DB:** SQL query confirms the row exists with expected values.
- **Side-effects:** audit log row, queue job, or cache entry as
  applicable. Most A1 ops have no side-effect other than DB;
  recorded as "n/a" with reason.

Findings recorded in `docs/evidence/2026-05-29/EVID-HR-A1-QA.md`.

## 8. Out of scope (deferred)

- HR Updates endpoints (POST /hr-updates, ack, GET).
- HR pod create/edit UI — assume pods exist; empty-state if none.
- Binding revoke / end-now flow.
- Search/filter UI beyond cursor pagination.
- Bulk operations.
- Audit log surface.
- Refresh-token rotation in admin-web (defer to F1-c).
- Worker mobile invite-redemption flow.
- Owner shell beyond current login redirect behavior.
- Mobile responsiveness beyond what existing CSS tokens already deliver.

## 9. Risks and assumptions

- **JWT payload contains `userId` and `companyId`.** Confirm during
  implementation. If missing, add as backward-compatible field.
- **`AXHY_OTP_BYPASS=1` is available in the test env.** Confirm before E2E.
- **Existing public routes (`/about`, `/pricing`, etc.) are unaffected.**
  No route-group restructuring.
- **Pre-existing audit MEDIUMs are not regressed.** Chat rate-limit and
  raw Prisma in notifications/auth remain pre-existing debt; A1 adds
  nothing new.

## 10. Done-criteria

- All seven HR operations work end to end through the UI alone.
- Backend integration tests for the seven new GETs and the leave-decide
  refinement pass against a real DB.
- Playwright E2E passes against the deployed staging Railway environment.
- SOP four-layer findings doc filed at `docs/evidence/2026-05-29/EVID-HR-A1-QA.md`.
- `check_before_done` gate green.
- PR opened against `main` with this spec, plan, code, tests, and evidence.
- Pre-existing audit MEDIUMs unchanged in count.
