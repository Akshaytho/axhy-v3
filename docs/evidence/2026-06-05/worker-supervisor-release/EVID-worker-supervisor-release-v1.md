# EVID-worker-supervisor-release-v1 — Worker + Supervisor Production-Release QA

**Date:** 2026-06-05
**Target env:** emulator app (`app.axhy.mobile` dev client) → local Fastify backend on host `192.168.1.6:4000` → **Railway prod DB** (`switchback.proxy.rlwy.net`, real data). `OTP_BYPASS=1`.
**Method:** QA Enterprise Walk SOP — four-layer verification (UI + Route + DB + side-effects/audit), capture-don't-fix, RCA cluster + batch fix, real-DB tests.
**Demo supervisor:** `+919900112233` / OTP `123456` ("Emulator Demo Co").
**Honest scope note:** host RAM is constrained (qemu ~3.6 GB, ~56 MB free) so **multi-device is sequential, not a device farm**, and the demo company has thin data (0 sites/workers today) so the device walk exercises UI/empty/error/crash states while populated business-logic is covered by the prod-DB test suite + code audits.

---

## 1. Pending items from prior handoff — CLOSED (4-layer verified on device)

| Item                                          | Result                                                                                                                                                                                                                                                                                                                     | Evidence                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Notification prefs persistence** (`me.tsx`) | **PASS** — UI showed persisted `{push:false}`; toggled Push ON → optimistic; `GET /me` returned `{push:true,...}` (DB write confirmed); full `am force-stop` + relaunch → Push still ON (server is the only post-kill source). Audit event `MEMBERSHIP_NOTIFICATION_PREFS_UPDATED` visible in the Activity feed (live L4). | `02-current`, `03-push-toggled`, `04-reload-profile` |
| **Supervisor Memory & rules** (`memory.tsx`)  | **PASS** — renders the real living-doc exactly matching `GET /supervisor/living-doc` (2 site rules, 1 worker note, 1 recurring task; empty sections hidden), Company/Private chips correct, honest loading→loaded, no fabricated counts.                                                                                   | `06-memory-loaded-3`                                 |

## 2. Supervisor UI walk — all surfaces, no crashes

| Screen                           | Result                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today                            | Honest "No sites yet" empty + FLOOR PULSE 0/0/0; date header correct (Fri); pull-to-refresh.                                                                                                               |
| Decisions                        | Honest "All caught up" empty.                                                                                                                                                                              |
| Activity                         | Real audit log with WHEN/WHERE/WHAT filters — showed the **live AUTH_LOGIN + notif-prefs-update events** I generated (L4 proof).                                                                           |
| Chat                             | Honest "Namaste · 0 sites · 0 workers active" intro + example prompts + input bar.                                                                                                                         |
| Memory / Profile                 | Verified (section 1).                                                                                                                                                                                      |
| Network OFF (airplane) → refresh | Graceful: cached state retained, **no crash**; honest "COULD NOT LOAD TODAY / Network request failed" banner; recovers on reconnect.                                                                       |
| Hardware-back from root tab      | Correctly backgrounds to launcher (standard Android). _(Initial false-positive "back exits from Memory" was retracted after screenshot proved the nav tap had missed — back was from the Today root tab.)_ |

**No crash, white-screen, or fabricated data observed on any supervisor screen.**

## 3. Code audits (3 parallel subagents, re-verified by orchestrator) — RCA clusters

| Cluster                      | Severity              | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                                 |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **A — role-gate backfill**   | high (security/cost)  | `/chat/messages`, `/chat/apply`, `/decisions/proposed-for-me`, `/decisions/:id/dismiss`, GET+POST `/supervisor/updates` gated on `requireAuth` only — a WORKER token could drive the AI proposal engine and burn company budget.                                                                                                                                                                                                                                                                                    | **FIXED + TESTED**                     |
| **B — Worker.id vs User.id** | high (broken feature) | `replacement-picker` sent `Worker.id` as `candidateUserId`; backend resolves it as `User.id` → every "find replacement" invite 404s.                                                                                                                                                                                                                                                                                                                                                                                | **FIXED + TYPECHECK/today-test green** |
| **C — doc-truth drift**      | high→low              | (1) `tenant-context.ts` docstring overstates RLS (RLS only on 3 vector/audit/chat tables; relational tenant isolation is app-layer `companyId` filters — verified present); (2) `visits.ts` stale reject docstring; (3) supervisor `me.tsx` describes a **Resign feature that isn't implemented** (dead styles, no `/me/resign`); (4) `@derives(ENTERPRISE_PRODUCTION_STANDARD.md)` references a locked doc that **does not exist** in `docs/locked/`; (5) hardcoded `BUILD 2026.05.18` + drawer `v0.0.1` mismatch. | PARTIAL (see §4)                       |
| **D — FLAGGED reason**       | medium                | worker `submit.tsx:208` reads the AI flag reason from `verificationText`, which the verify-status schema never returns → worker never sees why a visit was flagged.                                                                                                                                                                                                                                                                                                                                                 | OPEN (see §4)                          |
| **orphans**                  | medium/low            | `clockInVisit` + flagged-review write state directly (machine-bypass, possibly intentional race-safe pattern); failed-upload shows "Synced" on Home (known tradeoff, retry exists); 0-byte capture not asserted; rate-limit fails-open on Redis outage (documented).                                                                                                                                                                                                                                                | FLAG for founder                       |

**Positive confirmations (verified):** worker horizontal-privilege solid (`resolveWorkerFromAuth` + `visit.workerId===worker.workerId` 403s); lifecycle through guarded transitions; **StateBadge RCA-F crash-fallback present**; photo-capture data-loss path solid (queue persisted+rehydrated, AbortController timeouts); api.ts refresh mutex/retry/force-logout correct; auth-refresh re-derives tenant from DB (not caller); honesty-grep clean (only intentional documented `[ORCHESTRATOR_EXCEPTION]` markers in leave-requests).

## 4. Fixes landed this session

### CLUSTER-A — SUPERVISOR role gates (security)

Added `requireRole('SUPERVISOR')` to the 6 routes in `chat.ts`, `decisions.ts`, `supervisor-updates.ts`. New test `apps/backend/test/supervisor-route-role-gates.test.ts`: **13/13 green vs prod DB** — WORKER → 403 `FORBIDDEN_WRONG_ROLE` on every route, SUPERVISOR → not blocked, unauth → 401. Backend typecheck green. (No worker-app callers exist, so no legitimate flow breaks.)

### CLUSTER-B — replacement-invite id contract (broken feature)

Added nullable `userId` to the `TodayWorker` schema (`packages/shared-schema`), populated it in `today-service.ts`, and changed `replacement-picker.tsx` to send the worker's real `User.id` (skipping unlinked workers). shared-schema + backend + **mobile typecheck green**; `supervisor-today.test.ts` green (no regression); wave-1 invite **creation returns 201** with a User.id. **Honest residual:** full on-device invite _acceptance_ not exercised (demo company has no 2nd linked worker); covered at the route layer by wave-1.

## 5. Open / founder-decision items (NOT silently dropped)

- **C3 Resign feature:** supervisor `me.tsx` docstring + `@derives(project_single_tenant_model_resign_anonymise locked 2026-05-18)` describe a Resign flow that isn't built. **Decision needed:** does the locked doc mandate supervisor resign (→ build it) or was it deferred (→ remove the docstring + dead styles)?
- **C4 Missing locked doc:** `docs/locked/ENTERPRISE_PRODUCTION_STANDARD.md` is referenced by `@derives` annotations and the guardrail tool but does not exist as a file. Founder owns locked docs — create it or correct the references.
- **D FLAGGED reason:** surfacing `verificationText` on the verify-status route+schema so the worker sees why a visit was flagged.
- **Orphans:** clockInVisit / flagged-review machine-bypass — confirm the broadened legal-from set + direct state writes are sanctioned vs. routing through the visit machine.
- **Pre-existing test failure (unrelated to this work):** `wave-1-replacement-invite-routes.test.ts` expiry-simulation sets `expiresAt` into the past, violating the DB CHECK `replacement_invite_expiry_after_sent_check`. The test needs to simulate expiry differently (raw SQL / short TTL). Not caused by the CLUSTER-B fix.

## 6. Honest residual risk

- Device walk saw mostly empty states (thin demo data); populated/edge business states rest on the prod-DB test suite + audits, not on-device screenshots.
- Multi-device coverage is sequential (host RAM); not all form factors exercised simultaneously.
- CLUSTER-B acceptance flow verified at route layer, not end-to-end on device.

## 7. Recommendation

**Ship the two landed fixes** (role gates + replacement-invite id) — both verified. Resolve the §5 founder-decision items before calling the full surface production-final. Deploy precondition: set `AXHY_REDIS_NAMESPACE` per prod Railway env (RCA-G boot guard) before deploying.
