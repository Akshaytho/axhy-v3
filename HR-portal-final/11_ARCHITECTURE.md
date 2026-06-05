# 11 — Architecture

> Source of truth: `99_CANON_FACTS.md` §7-§14; backend/admin-web reality from the live code. This is the system architecture for the HR portal: the stack the **fresh** UI sits on, the access-control spine, the data/eventing flow, and the build layers. Nothing here invents infrastructure — it names what exists and what must be added.

---

## 1. The big picture

```
                       ┌───────────────────────────── admin-web (Next.js 15, App Router) ─────────────────────────────┐
   Kavitha's laptop ──▶│  /hr/* (fresh UI)   server components (reads)  ·  server actions (writes)                    │
                       │  httpOnly cookie axhy_at  ─verify→ @axhy/jwt-public  ·  requireRole('HR') gates the subtree   │
                       │  lib/api.ts fetchJson  ──Bearer──▶                                                            │
                       └──────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                                                       │  HTTPS, JWT (sub=User.id, companyId, role, epoch)
                       ┌───────────────────────────── backend (Fastify + Prisma) ───────────────────────────────────┐
                       │  requireAuth → requireRole → assertTargetRole → pod-scope → withTenantContext(tx)           │
                       │  routes /admin/* /leave-requests /hr-* (kept + to build)                                    │
                       │  services (membership/worker/site/binding/leave/...)  ·  policy-write-acl                   │
                       │  Postgres (schema=axhy, multiSchema)  ·  Outbox table  ·  Redis (rate-limit, caches)        │
                       │  BullMQ workers: dispatcher (notifications) · cron (sweeps/escalation/digests)              │
                       └────────────────────────────────────────────────────────────────────────────────────────────┘
                                          │ push/sms/whatsapp/email (fallback chain)        │ digests
                                          ▼                                                  ▼
                            supervisors / workers / owner                         owner & HR-team digests
```

---

## 2. Frontend (admin-web) — the fresh UI

- **Framework:** Next.js `^15` App Router, React `^19`. Server components for reads, **server actions** for writes (no client-side fetch of the backend; the cookie never reaches the browser JS). (`apps/admin-web`)
- **Styling:** Tailwind CSS `^4` + `@axhy/ui-tokens` (paper/ink palette, mono numerics) + `@axhy/ui-web`. No shadcn/Radix today; the fresh UI should standardize on `@axhy/ui-web` primitives and add what's missing there (so worker/supervisor/HR share a design system). A `frontend-design` polish pass sits on top of these wireframe specs.
- **Routing:** `/hr/*` under `app/hr/layout.tsx`, which calls `await requireRole('HR')` — **closed by default** (no session → `/login`; wrong role → `/forbidden`). Owner may also be allowed on the kept GET routes (full-tenant), but the nav is HR-shaped.
- **Auth wiring:** login posts to `/api/auth/session/route.ts`, which sets the **httpOnly cookie `axhy_at`** holding the access JWT. Server code reads it via `lib/auth.ts` `getSession()` (verify with `@axhy/jwt-public`, HS256, shared secret). **Refresh-token rotation is not yet in admin-web (deferred to F1-c)** — wire it as part of the HR build so a long HR session doesn't silently expire.
- **Backend calls:** `lib/api.ts` `fetchJson<T>(path, init)` — server-only, attaches the cookie as `Authorization: Bearer`, `cache:'no-store'`, throws a classified `ApiError(status,code,message)`. The fresh UI keeps this pattern (or generates the empty `@axhy/api-client`, see §6).
- **Rendering legality:** the UI renders from server-provided `canX` flags; it does not re-run state machines or re-derive permissions on the client (`03 §1`, `10 §C`).

---

## 3. Access-control spine (defense in depth)

Every HR request passes, in order:

1. **`requireAuth`** (`middleware/tenant-context.ts`) — verifies the Bearer JWT, attaches `req.auth = {userId, companyId, role, availableRoles, membershipId?, epoch?}`. Strict mode (when `epoch` present) DB-verifies the membership is ACTIVE and the `tokenEpoch` matches (so a revoked session dies).
2. **`requireRole('HR'[,'OWNER'])`** (`middleware/role-gates.ts`) — 401 AUTH_REQUIRED / 403 FORBIDDEN_WRONG_ROLE.
3. **`assertTargetRole(caller,target)`** (membership creates only) — vs `HIRING_AUTHORITY`; 403 FORBIDDEN_TARGET_ROLE. Byte-for-byte locked-doc parity is build-tested.
4. **Pod scope** (`middleware/pod-scope.ts`) — `getMyPodIds(...)`; list/detail filtered to my pods; out-of-pod → 404.
5. **`withTenantContext(prisma, companyId, fn)`** — opens a `$transaction`, sets `SET LOCAL axhy.current_company_id` (RLS GUC), **rejects non-ACTIVE companies (403)**, runs the write. (RLS is enabled only on chat embeddings today; tenant isolation elsewhere relies on `@unique` + explicit `companyId` filters + this GUC — treat companyId-scoping as mandatory in every query.)

JWT claims: `{sub:userId, companyId, role, availableRoles[], membershipId?, epoch?, kind}`. **Subject is `sub`, never `userId`** (§12.2). HS256 secret shared with admin-web.

---

## 4. Data & eventing flow (write path)

A representative HR write — _approve leave_ — shows the spine:

```
server action (S15)
  → fetchJson POST /leave-requests/:id/approve  (cookie→Bearer)
    → requireAuth → requireRole(HR) → pod-scope (owns this worker's pod?)
      → withTenantContext(companyId):
          conditional updateMany (REQUESTED→APPROVED)   // race-safe, only first wins
          INSERT AuditEvent(LEAVE_APPROVED)             // immutable
          INSERT Outbox(worker.leave_approved)          // transactional outbox
          (per affected site-shift) create ReplacementInvite
  ← {state:'APPROVED', canX...}
                         │
   BullMQ dispatcher reads Outbox → Notification(push→sms→whatsapp→email) to the worker, localized
```

- **Transactional outbox** (`Outbox` table) decouples the write from delivery; the dispatcher (BullMQ) turns outbox rows into `Notification` rows and sends them down the **fallback channel chain** (`push → sms → whatsapp_out → email`), localized to the recipient's `preferredLanguage`, coalesced per kind.
- **Audit is in the same transaction** as the state change — the legal record can't drift from reality.
- **Policy writes** are append-only (new row + `previousValueSnapshot`); the current value is the latest row.

---

## 5. Backend services & infra (kept)

- **Fastify + Prisma + Postgres** (schema `axhy`, multiSchema). **Redis** for rate-limit + caches (Redis is required, per production rules). **BullMQ** for the dispatcher + cron.
- **Cron jobs** the HR layer needs (closure §10): `hr-availability-sweep` (fallback telemetry), `hr-queue-age-escalation` (SLA), `bootstrap-seed-aging-sweep`, `binding-expire-sweep`, and the digest composers (`hr_team_daily`, `owner_monthly`, `supervisor_while_you_were_out`). The cron framework + shell jobs are a Layer-1 build item.
- **State machines** (`packages/state-machines`) are pure; the backend writes audit/outbox around transitions. The portal calls transition endpoints, never patches state.

---

## 6. The api-client decision (pick early)

`@axhy/api-client` is an **empty stub** (`packages/api-client/src/index.ts` exports only `PACKAGE_NAME`). Two paths:

- **(a) Keep `fetchJson`** — fastest; the fresh UI hand-writes typed wrappers per endpoint. Risk: contract drift between backend and UI (the class of bug that produced the `workerId` and auth-shape failures).
- **(b) Generate the client** from the backend's OpenAPI/Zod — eliminates drift, costs setup. **Recommended** given the HR portal adds ~20 endpoints and the worker/supervisor/owner portals will reuse them.

This is a real fork; flagged in `12_OPEN_QUESTIONS_AND_FOUNDER_PICKS.md`.

---

## 7. Build layers (where HR sits)

From the closure spec's four-layer build order:

- **Layer 1 — core primitives (data + plumbing, no surfaces):** `SiteSupervisorBinding`, `Membership.podId`, `HRPod`, `QueueItem` (table or projection), `Notification`, `Policy`, `Digest`, `SupervisorDecision.originContext/proposedDuringAbsence`, `Worker.preferredLanguage`; all new audit kinds; the cron framework + shell jobs; HRPod CRUD via API. Exit: migrations applied, audit kinds emit, Policy read/write, HRPod CRUD works. **Largely present in schema; the routes + cron + driver-wiring are the work.**
- **Layer 2 — HR coordination layer (this portal):** queue partitioning, pod-assignment migration, lock table/columns; the surfaces — pod home, scoped queue, SLA signals, bootstrap review, audit-chain, multi-HR lock UI, acting-cover, permanent reassign, switch-all-sites. Exit: **HR can manage the queue + create bindings + correct seeds + reconstruct audit chains in admin-web without curl.**
- **Layer 3 — supervisor operational layer:** HR-pending visibility, absence mode, "while you were out" digest, handoff panel (the supervisor _counterparts_ of HR's actions).
- **Layer 4 — worker trust + owner oversight:** worker surfaces + owner digest/KPI/bank/compliance.

The HR portal is **Layer 2, on a Layer-1 foundation that's mostly schema-present but route/driver-absent.** Detailed sequencing + acceptance in `14`.

---

## 8. Security & compliance posture (architecture-level)

- **Multi-tenant:** companyId on every query; `withTenantContext` GUC + `@unique` + explicit filters; cross-tenant create impossible.
- **Immutability:** AuditEvent + Policy are append-only; the audit chain is the legal record (and powers `audit-chain`).
- **DPDP:** anonymize-not-delete; `@personal` PII (bank) on Membership; bank _changes_ are an owner+OTP surface, not HR.
- **Least privilege:** closed-by-default role gates front-and-back; HR confined to its layer (rule hierarchy) and its pods.
- **No moat leak:** no bulk export; `audit-chain` answers questions, it doesn't dump data.
- **Session safety:** httpOnly cookie (no token in browser JS), `tokenEpoch` revocation, refresh rotation to wire, sign-out with a network timeout.

---

## 9. Failure modes the architecture must survive (from the sim)

| Failure                              | Architectural answer                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| Two HR users on one row              | pessimistic pod lock + race-safe conditional updates              |
| HR unavailable                       | fallback chain via availability-sweep cron + explicit owner grant |
| Urgent item buried                   | SLA tiers + age-escalation cron                                   |
| Binding change mid-day causing chaos | same-day freeze server guard                                      |
| Delivery channel down                | notification fallback chain (push→sms→whatsapp→email)             |
| Contract drift (workerId/auth)       | central identity helper + generated/typed client (§6)             |
| Company suspended                    | `withTenantContext` blocks writes, reads still serve              |
