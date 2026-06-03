<!-- [ORCHESTRATOR_EXCEPTION] backend role-gate matrix audit -->

# A2 — Backend role-gate audit (full matrix)

Pure code audit. No probing — `grep` only, then reading handlers. Covers all 33 route files in `apps/backend/src/routes/`.

Three-tier classification:

- **PROPERLY GATED** — `preHandler` includes `requireRole(...)` or `requireWorkerRole`.
- **GATED INLINE** — `preHandler: requireAuth` only, but the handler body checks `auth.role !== 'X'` early-return.
- **UNGATED** — Neither preHandler nor inline. Any authenticated user (any role) can hit the endpoint; whatever scoping happens is at the service/query layer only.

## Matrix

| Route file                     | Gate type            | Notes                                                                                                                       |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| auth.ts                        | n/a (public auth)    | `/auth/otp/request`, `/auth/otp/verify`                                                                                     |
| auth-refresh.ts                | n/a (public refresh) | `/auth/refresh`                                                                                                             |
| me.ts                          | UNGATED              | `/me` — likely intentional (every user has a profile)                                                                       |
| **admin-memberships.ts**       | PROPERLY GATED       | `requireRole('OWNER', 'HR')` ✓                                                                                              |
| **admin-sites.ts**             | PROPERLY GATED       | `requireRole('OWNER', 'HR')` ✓                                                                                              |
| **admin-workers.ts**           | PROPERLY GATED       | `requireRole('HR')` ✓                                                                                                       |
| **super-admin-memberships.ts** | PROPERLY GATED       | `requireRole('SUPER_ADMIN')` ✓                                                                                              |
| **worker-captures.ts**         | PROPERLY GATED       | `requireWorkerRole` ✓                                                                                                       |
| **worker-consent.ts**          | PROPERLY GATED       | `requireWorkerRole` ✓                                                                                                       |
| **worker-submit.ts**           | PROPERLY GATED       | `requireWorkerRole` ✓                                                                                                       |
| **worker-today.ts**            | PROPERLY GATED       | `requireWorkerRole` ✓                                                                                                       |
| **worker-visit.ts**            | PROPERLY GATED       | `requireWorkerRole` ✓                                                                                                       |
| activity.ts                    | GATED INLINE         | 2 inline `auth.role !== 'SUPERVISOR'` checks                                                                                |
| replacement-invites.ts         | GATED INLINE         | 3 inline checks (covers 5 POSTs)                                                                                            |
| leave-requests.ts              | GATED INLINE         | 1 inline check (line 125)                                                                                                   |
| swap-requests.ts               | GATED INLINE         | 1 inline check (line 57)                                                                                                    |
| visits.ts                      | GATED INLINE         | 2 inline checks                                                                                                             |
| admin-policy.ts                | GATED VIA SERVICE    | ACL inside `setPolicy` → `PolicyKeyForbiddenError`                                                                          |
| **supervisor-decisions.ts**    | **UNGATED**          | `GET /supervisor/decisions`, `POST /supervisor/decisions/:id/dismiss`, `POST /decisions/:id/apply` — NO role check anywhere |
| **supervisor-today.ts**        | **UNGATED**          | `GET /supervisor/today` — confirmed no inline check                                                                         |
| **supervisor-summary.ts**      | **UNGATED**          | `GET /supervisor/summary`                                                                                                   |
| **supervisor-context.ts**      | **UNGATED**          | `GET /supervisor/context`                                                                                                   |
| **supervisor-activity.ts**     | **UNGATED**          | `GET /supervisor/activity`                                                                                                  |
| **supervisor-updates.ts**      | **UNGATED**          | `GET /supervisor/updates`, POST                                                                                             |
| chat.ts                        | UNGATED              | `/chat/messages`, `/chat/apply`                                                                                             |
| chat-reload-context.ts         | UNGATED              | GET + POST                                                                                                                  |
| chat-transcribe.ts             | UNGATED              | `/chat/transcribe`, `/chat/transcribe-stream`                                                                               |
| assignments.ts                 | UNGATED              | `POST /assignments`                                                                                                         |
| calendar.ts                    | UNGATED              | POST/PATCH/GET calendar routes                                                                                              |
| complaints.ts                  | UNGATED              | All 5 complaints endpoints                                                                                                  |
| decisions.ts                   | UNGATED              | `/decisions/proposed-for-me`, `/decisions/:id/dismiss`                                                                      |
| sites.ts                       | UNGATED              | POST + GET site state                                                                                                       |
| workers.ts                     | UNGATED              | `POST /workers/:id/*`                                                                                                       |

## Risk per UNGATED route

Each UNGATED route's actual risk depends on the **service-layer query scoping**. If the query naturally filters by `userId` (or `supervisorId == userId`), a worker call returns empty — safe by accident. If the query filters by `companyId` alone, the worker sees all company data — actual leak.

### HIGH SUSPICION (likely leak — query may not filter by user)

| Route                      | Suspected leak                    | Why                                                                                                                                 |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `GET /supervisor/today`    | Today's visit roster company-wide | The supervisor's "today" view typically shows the whole company's day — if query is by `companyId`, workers see everyone's schedule |
| `GET /supervisor/summary`  | Company aggregate metrics         | Aggregate counts are almost certainly companyId-scoped, not supervisorId-scoped                                                     |
| `GET /supervisor/context`  | Company-active sites + workers    | Per the consumer code (`use-supervisor-context.ts`): `{ sitesActive, workersActive }` — sounds companyId-scoped                     |
| `GET /supervisor/updates`  | HR updates feed                   | If updates are tenant-wide, a worker sees them                                                                                      |
| `GET /supervisor/activity` | Activity ledger                   | If paginated companyId scope, leaks                                                                                                 |

### MEDIUM SUSPICION (likely safe — query scopes by user)

| Route                        | Why probably safe                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `GET /supervisor/decisions`  | Service confirmed `supervisorId == userId` scoping → empty for workers (B-02 in C1) |
| `/decisions/proposed-for-me` | Name strongly implies "for me" → userId-scoped                                      |
| `/decisions/:id/dismiss`     | Likely checks ownership before mutate                                               |

### NON-SUPERVISOR UNGATED ROUTES

| Route                   | Risk                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /chat/messages`   | If chat is supervisor-only by product intent, worker can post messages. If chat IS cross-role, OK. |
| `POST /chat/transcribe` | Voice transcription. May incur OpenAI cost when a worker triggers it. **Cost/abuse vector**.       |
| `POST /assignments`     | If a worker can create assignments, that's a CRITICAL bug. Need to verify the handler scope.       |
| `POST /complaints/...`  | If a worker can complain on behalf of supervisor → impersonation                                   |
| `POST /workers/:id/...` | Worker management — if a worker can mutate other workers' state, severe                            |

## Recommended fix order

1. **Verify the 5 HIGH SUSPICION routes** by reading each handler — confirm whether the query scopes by userId or just companyId. The matrix is currently inferred from route names; the actual queries are the truth.
2. **Add `requireRole` preHandlers** to all UNGATED routes that should be supervisor-only:
   - `supervisor-today.ts`, `supervisor-summary.ts`, `supervisor-context.ts`, `supervisor-activity.ts`, `supervisor-updates.ts`, `supervisor-decisions.ts`
3. **Convert inline checks to preHandler** for consistency:
   - `activity.ts`, `replacement-invites.ts`, `leave-requests.ts`, `swap-requests.ts`, `visits.ts`
4. **Decide policy** on cross-role routes:
   - `me.ts` — keep ungated (every user has a profile)
   - `chat-*` — confirm cross-role intent OR gate to supervisor
   - `complaints.ts` — confirm intended caller roles
5. **Add a CI guard** that fails the build if a `apps/backend/src/routes/(supervisor|admin)-*.ts` file declares an `app.get/post/...` without a role-gating preHandler. Encode the convention.

## Notes

- This audit is **structural** — based on `grep`s of `preHandler` and `auth.role` patterns. Some routes may have other defenses (a deeper `withTenantContext` ACL, a service-layer guard, etc.) that this audit missed. The matrix should be treated as "where to look first," not "ground truth."
- The HIGH SUSPICION items in particular need handler-level reads before any code change. Don't add a preHandler that breaks legitimate use.
