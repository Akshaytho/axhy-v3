# Session 2026-05-27 1:36p–~3:00p IST — F1 design brainstorm IN PROGRESS

**Owner:** founder (Akshay) on standby; AI doing autonomous design work.
**Status:** F1 spec brainstorm complete through Section 5; spec doc not yet written due to guardrail blocker (below).

## New permanent rule from this session (founder direction 2026-05-27 ~2:50p IST)

**Rule:** Any medium-to-major refactor or new code change at the system level (auth, schema, state machines, multi-tenant boundaries, anything under `apps/backend/src/middleware/`, schema changes on active tables) requires **enterprise-grade QA** before "done" — NOT just unit tests + one happy-path integration test.

**Required for done on this tier:**

1. Unit tests (every branch).
2. Real-DB integration tests via `railway run -- pnpm --filter @axhy/backend test:integration`. No mocked Prisma.
3. Prod-grade QA walk against Railway production with each affected persona token. Inspect data shape, side-effect tables, latency, and audit trail per the 2026-05-27 four-layer learning.
4. Adversarial pass — explicitly attempt the failure modes the change is meant to prevent (each must 401/403/fail correctly).
5. Cross-persona panel review (worker, supervisor, HR, COMPANY_ADMIN, SUPER_ADMIN).
6. Findings doc `_QA_FINDINGS_<date>.md` in `axhy-v3/handoff/` (nil report acceptable).
7. `check_before_done` runs all of the above as a structural gate.

**Why:** Founder quote: "if there are big changes like this... need proper QA prod enterprise level testing." Scale of change demands proportional verification.

**Saved:** `axhy-cognitive-system/memory/base/feedback_major_changes_need_enterprise_qa.md` (commit `4f289db`). Will be embedded on next brain:build.

## F1 spec — decisions locked in this session

The F1 trust-model arc has been brainstormed through Sections 1-5. Founder approved each section. Spec doc not yet committed pending guardrail unblock.

**Locked architectural decisions:**

1. **Scope:** Full F1 arc (base + enterprise layer) planned as one spec, executed across 4 slices/sessions.
2. **Invalidation strategy:** `Membership.token_epoch` + `User.is_platform_admin` + 5-min access TTL + rotating refresh with Stripe-style family detection. Epoch bump on revoke/anonymize/fire = instant token death.
3. **SUPER_ADMIN bootstrap:** Migration backfills founder's User row (`UPDATE User SET is_platform_admin=true WHERE id='17285e17-9434-4522-9ac1-1cec1cbea31f'`). All future platform admins added via SUPER_ADMIN-only endpoint.
4. **mint-token.ts disposition:** Keep as dev tool, refuse if `NODE_ENV=production` OR target role is SUPER_ADMIN.
5. **KMS-backed signing:** Deferred to post-arc slice. HS256 with rotating `JWT_SECRET` is sufficient until first paid customer / external audit.
6. **Refresh family detection:** Postgres holds the family row, Redis holds `current_hash` per family (hot path, sub-ms reads, sliding TTL). At 2000 users + 100 supervisors: ~22k Redis SETs/day = 0.0005% of capacity. Cost negligible — founder confirmed approval.
7. **Cutover:** 30-day compatibility window. Old tokens (no epoch claim) accepted in legacy mode. Every refresh upgrades a user to the new format. Day 30: flip `AUTH_STRICT_MODE=true`, delete legacy code.

## F1 implementation map (locked)

| File                                                                  | Change                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/prisma/schema.prisma:93-157`                  | Add `User.is_platform_admin`, `Membership.token_epoch`, new `RefreshToken` model                                                                  |
| `packages/shared-schema/src/zod/jwt-claims.ts`                        | Extend JWTClaims with optional `membershipId`, `epoch`, `isPlatformAdmin`                                                                         |
| New migration `apps/backend/prisma/migrations/<date>_f1_trust_model/` | Schema additions + founder UUID backfill                                                                                                          |
| `apps/backend/src/lib/jwt.ts:35-56`                                   | `issueAccessToken` takes new params                                                                                                               |
| `apps/backend/src/middleware/tenant-context.ts:48-73`                 | `requireAuth` queries Membership (or User for SUPER_ADMIN), enforces status+role+epoch match; legacy mode if epoch missing                        |
| `apps/backend/src/middleware/role-gates.ts:80-94`                     | Unchanged; trust flows through `requireAuth`                                                                                                      |
| `apps/backend/src/routes/auth.ts`                                     | Login emits new-format slips + creates `RefreshToken` family; new `/auth/refresh` with rotation + family detection; new `/auth/logout-everywhere` |
| New `apps/backend/src/lib/services/refresh-token-store.ts`            | Postgres family CRUD + Redis `current_hash` per family                                                                                            |
| `apps/backend/src/lib/services/anonymize-worker-service.ts`           | Bump `Membership.token_epoch` + REVOKE RefreshToken families (closes Priya's 14-min zombie window)                                                |
| `apps/backend/src/lib/services/admin-membership-service.ts`           | Bump epoch on role revoke + (bonus) fix F4 `User.name` while in this file                                                                         |
| `apps/backend/scripts/mint-token.ts`                                  | Refuse if `NODE_ENV=production` OR target role is SUPER_ADMIN                                                                                     |

## F1 slice plan (4 sessions)

| Session | Slice                                | Lands                                                                                                                      | Risk                    |
| ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1       | `f1-a-schema-and-membership-backing` | Migration + `requireAuth` in compatibility mode + Membership/epoch checks for new-format tokens; old tokens still accepted | Low — additive only     |
| 2       | `f1-b-refresh-rotation`              | `RefreshToken` table + Redis store + `/auth/refresh` rewrite + family detection + tests                                    | Medium — new code paths |
| 3       | `f1-c-ttl-and-logout-everywhere`     | Access TTL 15→5 min, `/auth/logout-everywhere` route, anonymize-service wired to bump epoch + revoke families              | Low                     |
| 4       | `f1-d-strict-mode-flip`              | Flip `AUTH_STRICT_MODE=true`, delete legacy code paths, final test sweep                                                   | Low — deletion          |

Each slice must pass the new enterprise-QA bar (rule above) before "done."

## Blockers from prior session — RESOLVED

### ~~Blocker 1~~ — guardrail `reasoningEvidence` — FIXED

Not a marshalling bug. The prior session was likely passing `reasoning_evidence` with insufficient structure. Subsequent session passed all 4 HIGH-risk fields (invariants_preserved, risk_if_wrong, what_would_make_me_stop, files_read) with 10+ words each containing specific file references — guardrail approved. Key: each field needs a concrete file path or function reference matching the SPECIFIC_REFERENCE regex at evidence-validator.mjs:18.

### ~~Blocker 2~~ — `memory/v3/` not in brain ingestion — FIXED

Fixed in commit `e8e8504`: added `join('memory', 'v3')` to COG_SCAN_DIRS in brain-builder.ts:48. Next brain:build will embed all ~40 v3 feedback files. The enterprise QA rule was also written to `memory/base/feedback_major_changes_need_enterprise_qa.md` (commit `4f289db` in axhy-cognitive-system).

---

# Phase 7 Lean Token Discipline — ACTIVE (approved 2026-05-27)

**Spec:** `axhy-cognitive-system/docs/superpowers/specs/2026-05-27-axhy-lean-token-operating-discipline.md`

**These rules are ACTIVE in every session. Not optional.**

### 7C — Tool-output-to-file discipline (ALWAYS ON)

- If a tool output exceeds ~2,000 characters, save full output to `docs/evidence/YYYY-MM-DD/EVID-NNN.md`
- Keep only a one-line reference in chat: `EVID-NNN | type | conclusion | full: path`
- Short outputs (<2K chars), simple confirmations, single-line results: keep in chat
- Evidence files use the Write tool — no raw Bash redirects bypassing guardrails
- No YAML ceremony — one-line format is the default

### 7E — Short-session policy (ALWAYS ON)

- One session = one slice (or one coherent task)
- End session at any natural boundary: task complete, ~50 turns, cost_pressure hits Orange, context_pressure hits context_orange
- Session-end protocol: commit code → write evidence files → update this handoff → start fresh
- Short sessions win: 4 short sessions cost ~14,400t extra boot but keep each under Yellow. One long session saves 10,800t boot but accumulates 60M+ context growth.

### Token measurement (run every session)

- Run `pnpm --filter @axhy/ai-tools token:check` at session start (baseline) and mid-session (track)
- Cost thresholds: Green 0-2M, Yellow 2-4M, Orange 4-6M, Red 6-8M, Black 8M+
- Context thresholds: green <80K/turn, yellow 80-150K, orange 150-250K, red >250K
- If context grows fast for 10-15 consecutive turns, checkpoint even if cost is still Green

### Phase 7 status

| Phase      | Type                              | Status                                                          |
| ---------- | --------------------------------- | --------------------------------------------------------------- |
| 7A         | Spec                              | ✅ Approved (8.7/10), 5 corrections applied                     |
| 7B         | Token measurement tool            | ✅ 27/27 tests green, commit `3e24630`                          |
| 7C         | Behavioral — tool-output-to-file  | ✅ Active (rules above)                                         |
| 7D         | Code — guardrail compact mode     | 🔜 Build only if 7B data shows guardrail output >20% of context |
| 7E         | Behavioral — short-session policy | ✅ Active (rules above)                                         |
| Validation | F1 + F31 as targets               | 🔜 Next product work                                            |

### Prior session token snapshot (2026-05-27 01:00 IST)

- cost_pressure: 5.71M (orange) — session stopped per discipline
- context: 121K/turn (yellow), 217 large outputs in chat, 259 full file reads

---

# Next Session — Land F1 (trust model) + F31 (anonymize PII scrub) + F28 (Mumbai region)

> **🚨 READ FIRST:** [`WAVE_2_QA_FINDINGS_2026-05-26.md`](./WAVE_2_QA_FINDINGS_2026-05-26.md) — Wave 2 Phase A QA walk done 2026-05-26 against Railway production. **25 findings filed (4 🚨 critical, 7 🟠 medium). Do NOT re-do the walk.**
>
> **Founder-approved direction (2026-05-26 evening):**
>
> 1. **F1 trust-model fix** — go with option (b) Membership-backed `requireAuth` + `User.is_platform_admin` boolean for SUPER_ADMIN. Layer Stripe/Google-grade defenses: short token TTL (15min → 5min), rotating refresh tokens, token revocation table, eventually KMS-backed JWT signing. (~4-6h for base; full enterprise layer over 2-3 days before external launch.)
> 2. **F31 anonymize PII scrub** — redefined: scrub `Worker.phone`, `Worker.name`, `Worker.bankIfsc`, `Worker.bankAcct` on anonymize (one-way hash). **KEEP** Visit / Assignment / Attendance / behavioral data tied to the (now anonymized) worker ID. Founder wants the analytics gold (Stripe/Uber pattern: keep behavioral data, scrub PII). Plus backfill SQL for the 7 existing orphan Worker rows + the founder's own empty `User.name`. (~1h + backfill.)
> 3. **F11 X12 mobile submit** — rewrite [`apps/mobile/app/(worker)/capture/[visitId]/submit.tsx:99-104`](<../apps/mobile/app/(worker)/capture/[visitId]/submit.tsx#L99-L104>) state machine to verify actual `visitState` instead of declaring "done" on timeout or any non-AWAITING state. (~2h.)
> 4. **F28 latency region** — migrate backend + Postgres + Redis from Railway US-West to Mumbai region. 250ms → 50ms RTT for Indian users. (~2-4h coordinated migration, off-hours.)
> 5. **Other speed levers (queued after F1/F31):** Redis caching for `/worker/today`, pgvector index tuning, Postgres connection pool sizing, CDN for mobile assets.
> 6. **F4 + F6 + F22** quick wins — User.name fix + handoff doc-drift cleanup + sandbox seed Company cleanup.
>
> **New permanent learning embedded in brain via brain:build 2026-05-27:** [`docs/learnings/2026-05-27-all-qa-walks-must-inspect-data-shape-not-just-routes.md`](../docs/learnings/2026-05-27-all-qa-walks-must-inspect-data-shape-not-just-routes.md) — every future QA walk must inspect FOUR layers (route + data shape + side-effects + latency/query plans). impactCheck will surface this on the next QA pass.
>
> **Sub-slice 2c-1 (leaveRequestMachine + swapRequestMachine) stays paused** until F1+F31+F11 land.

---

# Original wave-2-QA priority (now superseded — preserved for context only)

> **Original resume command (replaced 2026-05-26):** "Read `axhy-v3/handoff/NEXT_SESSION.md` first, then resume wave 2 cross-persona QA — founder OWNER is now seated in QA Test Co."

## ⚡ SUPER-ADMIN-OWNER-BOOTSTRAP — DONE + LIVE (2026-05-25 evening)

The 5 wave-2 admin/HR routes all require OWNER or HR auth. Production had zero OWNER rows (verified via psql at session start), so wave-2 was structurally blocked. This slice added the SUPER_ADMIN-only endpoint that seats the first OWNER per tenant.

**Commit `b7a1cbb` — pushed + Railway-auto-deployed + smoke-tested live.**

### What shipped

- **`POST /super-admin/memberships`** — `requireRole('SUPER_ADMIN')`, companyId in body, target role implicitly OWNER. Verifies Company exists + ACTIVE, upserts User by phone, creates Membership with role=OWNER, writes MEMBERSHIP_CREATED audit. `// tenant-exempt` by design (cross-tenant bootstrap; `withTenantContext` would 0-row).
- **`assertTargetRole('SUPER_ADMIN', 'OWNER')`** reused — inherits the drift-detection coverage from `role-gates.test.ts`. If `HIRING_AUTHORITY` ever drops OWNER from SUPER_ADMIN, this route 403s before touching the DB.
- **5/5 integration tests** against Railway prod DB — 401, 403 wrong role, 200 happy path, 404 COMPANY_NOT_FOUND, 409 MEMBERSHIP_ALREADY_EXISTS.

### Founder OWNER live in QA Test Co

| Field      | Value                                                                               |
| ---------- | ----------------------------------------------------------------------------------- |
| Company    | `2d2f1ccb-7bf8-4890-ae59-c5cb14b00289` (QA Test Co 2026-05-25)                      |
| Membership | `fbb2da2f-0080-40eb-9113-fa6820caad57` (role=OWNER, status=ACTIVE)                  |
| User       | `17285e17-9434-4522-9ac1-1cec1cbea31f` (phone `+919381378257`, name "Akshay Thota") |
| Audit      | `MEMBERSHIP_CREATED` row recorded with `bootstrappedBy: SUPER_ADMIN`                |

### What wave 2 can now do

With a founder OWNER seated, the full cross-persona hierarchy chain is exercisable end-to-end via the deployed APIs:

1. Mint OWNER token: `tsx scripts/mint-token.ts --user-id 17285e17-9434-4522-9ac1-1cec1cbea31f --company-id 2d2f1ccb-7bf8-4890-ae59-c5cb14b00289 --role OWNER`
2. OWNER calls `POST /admin/memberships` → creates HR
3. HR calls `POST /admin/memberships` → creates SUPERVISOR
4. HR calls `POST /admin/workers` → creates Worker (PENDING_ACTIVATION)
5. HR calls `POST /admin/sites` → creates Site
6. OWNER or HR calls `POST /admin/sites/:id/bindings` → binds Supervisor
7. Worker OTP-verifies (WhatsApp) → state transitions to ACTIVE via `workerOtpVerifiedService`
8. From here, the Playwright + curl multi-persona walker per the WAVE-2-PREP section below

### Known gaps from this slice

- **`PATCH /super-admin/memberships/:id`** for OWNER role revocation/swap not built — only INSERT path. Add when a tenant needs an OWNER handoff.
- **`POST /super-admin/companies`** still missing. Founder bootstrap of additional tenants currently needs psql or a Company INSERT before calling /super-admin/memberships. Build for the first paid customer.
- **Co-OWNER (OWNER→OWNER)** intentionally not exposed in either /admin/memberships or /super-admin/memberships. `HIRING_AUTHORITY` allows it; add an explicit endpoint when a real co-owner scenario surfaces.

---

## ⚡ WAVE-2-PREP SLICE — DONE (2026-05-25 autonomous run)

The admin/HR backend that wave 2 was blocked on is now SHIPPED and pushed. Founder pushed the 7 commits earlier today; Railway redeployed; the locked doc `hiring-hierarchy.md` is committed at `4127bb0`. 21 integration tests pass against Railway production DB.

### What shipped

| #   | Commit    | Content                                                                                      |
| --- | --------- | -------------------------------------------------------------------------------------------- |
| 1   | `f0a7026` | Spec + impl plan + ADR-0025 + mint-token.ts                                                  |
| 2   | `f40bfb3` | Schema move: salary + bank from Worker → Membership (migration 20260525_019 applied to prod) |
| 3   | `b730ef4` | role-gates middleware + ADR-0026 hiring-hierarchy + drift-detection test                     |
| 4   | `f2b0b81` | 4 admin Zod schemas                                                                          |
| 5   | `8675c2b` | R1 POST /admin/memberships (5/5 tests)                                                       |
| 6   | `36ec049` | R2 POST /admin/workers + R3 anonymize + learning (5/5 tests)                                 |
| 7   | `d8edfe8` | R4 POST /admin/sites + R5 bindings (6/6 tests)                                               |

**5 new routes live on `main` (untested in production until founder pushes):**

- `POST /admin/memberships` — OWNER creates HR; HR creates SUPERVISOR
- `POST /admin/workers` — HR creates Worker in PENDING_ACTIVATION
- `POST /admin/workers/:id/anonymize` — HR resigns Worker (one-way phone hash + state→TERMINATED)
- `POST /admin/sites` — OWNER or HR creates Site
- `POST /admin/sites/:id/bindings` — OWNER or HR binds Supervisor to Site

**Authority enforcement:** every route runs `requireAuth + requireRole(...) + assertTargetRole(...)` per `docs/locked/hiring-hierarchy.md`. Drift-detection test fails CI if the const diverges from the locked doc.

**Schema migration:** `Worker.baseSalaryPaise`, `Worker.bankIfsc`, `Worker.bankAcct` removed. Same fields added to `Membership`. Applied to Railway prod with backfill verification (1 worker membership backfilled). `markAbsentService` updated to read via Membership join.

### ✅ FOUNDER ACTION ITEMS — all closed

1. ~~Commit `docs/locked/hiring-hierarchy.md`~~ → done at `4127bb0`.
2. ~~Push 7 commits to GitHub~~ → done; Railway redeployed; smoke-verified.
3. ~~Smoke-verify on prod~~ → done. `POST /admin/memberships` baseline returns 401 unauth. Plus `POST /super-admin/memberships` from the new slice is live and bootstrapped founder OWNER in QA Test Co.
4. **Truth-first learning** (`docs/learnings/2026-05-25-all-anonymize-service-was-aspirational.md`) — read once when revisiting. Pattern detector blocks aspirational claims at commit time.

### What's next — wave 2 QA proper

With the admin/HR backend live, the wave-2 seed + walker can now exercise REAL cross-persona flows instead of raw Prisma fakes:

1. **Rewrite `qa-seed-multi-persona.ts`** to call the 5 new routes for fixture creation. The seed becomes a smoke test of the create paths simultaneously.
2. **Cross-persona Playwright walker** scenarios that now work end-to-end:
   - HR creates Worker → Worker OTP-logs in → state ACTIVE (via existing `workerOtpVerifiedService`)
   - HR creates Site + binds Supervisor → Worker home shows the new supervisor's phone
   - HR creates Supervisor → Supervisor logs in via OTP → sees their bound sites
   - HR resigns Worker → User.phone hashed → User free for new Worker in another company
3. **Native-only surfaces** (camera, AI verification, push, deep-link, tap-to-call) still require real device via Expo LAN per the device-strategy decision earlier in this session.

### Known gaps for wave 2

- **OWNER→OWNER (co-owner) target role** intentionally deferred from R1 Zod. If you want to add a co-owner via API, widen the Zod enum + add the target-role allowance in the handler. The `HIRING_AUTHORITY` const already permits it.
- **`POST /super-admin/companies`** still missing. QA Test Co already exists, so wave 2 is unblocked. Build when needed for second tenant.
- **`PATCH /admin/memberships/:id/role`** (promote Worker → Supervisor) not built. Edge case.
- **Admin UI** is out of scope; admin-web is still marketing-only. Wave 2 hits the routes directly via curl/Playwright with minted tokens (use `apps/backend/scripts/mint-token.ts`).
- **Anonymize phone hash** is 11 hex chars (44 bits ≈ 17 trillion). Collision-safe for any realistic worker volume; if scale projections later exceed 100M anonymized workers per tenant, consider extending User.phone to VarChar(32).

---

## 🚨 PRIOR PRIORITY (preserved — multi-persona QA wave 2 context)

The 2026-05-25 worker QA pass (commit `f57eed3`, doc `handoff/WORKER_QA_FINDINGS_2026-05-25.md`) was **scope-incomplete**. It walked ~10 worker screens via Playwright + curl-tested every worker API endpoint, but did **not** test how worker connects to other personas, and did **not** test the camera/AI flow which is the worker's daily 90%.

**Before clicking anything next time, run the proper preflight:**

1. `mcp__axhy-guardrail__check_before_build` with `slice_name: "qa-multi-persona-wave-2"`, `affected_personas: "worker, supervisor, HR, COMPANY_ADMIN, SUPER_ADMIN"`, `affected_platforms: "mobile, web, backend"`, `required_tests` listing every cross-persona scenario below.
2. `mcp__axhy-guardrail__check_before_done` at the end with `flow_completeness` enumerating each scenario as `verified: true|false`.

This discipline is captured as a new permanent learning: `docs/learnings/2026-05-25-all-qa-pass-is-a-slice-needs-preflight.md` — `brain:build` embeds it so `impactCheck("qa pass plan")` surfaces it on Day 1.

### Worker-app gaps (single-persona, but still missed)

- ❌ **Camera capture flow** — qr-scan → before-photos → timer → after-photos → review → submit. Headless browser has no camera; needs **real device via USB/LAN Expo** OR **Maestro on a simulator**.
- ❌ **AI photo verification polling** — verify-status → VERIFIED or FLAGGED. Depends on the capture flow above + AI worker queue firing in prod.
- ❌ **Tap-to-call supervisor** — phone number rendered but tap never tested (P2.4 in old findings warned about Linking.openURL on web).
- ❌ **Resume capture banner deep-link tap** — the home screen had a `resumeCapture: {visitId, photosTakenSoFar: 3}` pointer for the PHOTOS_PENDING visit; never tested the tap.
- ❌ **Logout** → confirm re-login on next session works end-to-end.
- ❌ **Wrong OTP** typed → should show error not crash.
- ❌ **OTP rate limit** — hammer Get OTP repeatedly, expect 429 OTP_RATE_LIMITED after 3 in 15 min.
- ❌ **Offline mode** — airplane mode mid-capture; photos persist; queue rehydrates on reconnect.
- ❌ **Worker state edge cases** — manually update Worker.state via SQL to ON_LEAVE / BLOCKED / TERMINATED / ARCHIVED and observe home rendering.
- ❌ **Empty day** — a day with zero visits should render correctly.

### Cross-persona scenarios (the BIG miss)

The worker app is part of a multi-persona system. **Zero of these were tested** in wave 1:

- ❌ **HR creates the worker** — admin-web (`apps/admin-web/`) → HR form → POST creates Worker row → invite sent → worker OTP-verifies → state transitions PENDING_ACTIVATION → ACTIVE via `workerOtpVerifiedService`.
- ❌ **Supervisor verifies submitted photos** — worker submits → supervisor app (`apps/mobile/app/(supervisor)/`) shows verification queue card → supervisor taps OK/reject → visit transitions VERIFIED or FLAGGED → worker home reflects the change.
- ❌ **Supervisor changes site binding** — supervisor unbinds from a site → worker home's `supervisorPhone` should update (or go null).
- ❌ **Worker requests leave** — `leaveRequestMachine` (sub-slice 2c-1, **not yet built**). Worker → supervisor approves → worker sees ON_LEAVE.
- ❌ **Worker requests shift swap** — `swapRequestMachine` (sub-slice 2c-1, **not yet built**). Worker A asks B → B confirms → both schedules update.
- ❌ **HR resignation / anonymization** — worker resigns → HR triggers anonymize → Worker.userId set null → User free for new Worker row in different Company.
- ❌ **Supervisor → worker chat** — chat surface from supervisor opens in worker mobile.
- ❌ **Push notifications** — supervisor takes an action → OneSignal push → worker bell badge increments on home (web has no push; needs real device).
- ❌ **Decision card** — supervisor makes a decision → worker sees outcome reflected in their UI.
- ❌ **Complaint flow** — worker raises complaint (broken equipment, locked site) → supervisor sees → resolves.
- ❌ **Admin creates a company** — full admin-web onboarding flow never opened.
- ❌ **Admin role promotion** — worker promoted to supervisor.

### Toolchain gaps to fix BEFORE wave 2

- **JWT minting helper** — write `apps/backend/scripts/mint-token.ts` that takes `--role WORKER|SUPERVISOR|HR|COMPANY_ADMIN|SUPER_ADMIN --user-id X --company-id Y` and outputs a 15-min access token signed with `JWT_SECRET` from Railway. Wave 1 failed to mint a supervisor token because `jsonwebtoken` import failed from workspace root — fix path with `cd apps/backend && pnpm exec node` or write a proper script.
- **Multi-persona fixture bootstrap** — `apps/backend/scripts/qa-seed-rich-fixtures.sql` that creates: 1 Company, 2 Sites, 1 HR user + membership, 1 Supervisor + 2 SiteSupervisorBindings, 3 Workers in different states (ACTIVE, PENDING_ACTIVATION, ON_LEAVE), 2 Assignments per worker, a week of historical Visits in all 12 states, 1 active LeaveRequest, 1 pending SwapRequest, 1 open Complaint, a chat thread, a decision card. Plus a cleanup script that nukes all of it.
- **Cross-persona Playwright script** — `apps/mobile/scripts/qa-multi-persona-walk.ts` that logs in as each persona sequentially using minted tokens, walks each persona's primary screens, then runs scenario walks (Submit → Supervisor Verify → Worker sees Verified; Leave Request → Approve → Worker sees ON_LEAVE; etc.).

### Existing QA test-fixtures in prod (decide: keep OR clean)

From wave 1, still live in prod (see `handoff/WORKER_QA_FINDINGS_2026-05-25.md` for the cleanup SQL):

- Company `2d2f1ccb-7bf8-4890-ae59-c5cb14b00289` "QA Test Co 2026-05-25"
- Worker `64ba3df8-3b71-45ed-986f-75217836e0ff` (founder phone)
- Supervisor user, site, assignment, binding, 3 visits

Decision: probably **keep + extend** for wave 2 (cheaper than a fresh bootstrap, founder phone already allowlisted).

### Real findings from wave 1 still pending fix

- **Q1 🔴 CORS whitelist easy to overwrite** — restored, but consider regex pattern matching for preview URLs long-term.
- **Q2 🟠 `<StateBadge>` crashes on unknown state** — `apps/mobile/components/worker/StateBadge.tsx:57-58` needs `?? { label: state, tone: 'neutral' }` fallback. Two-line fix.
- **Q3 🔴 R2 key mismatch (User.id vs Worker.id)** — `apps/backend/src/routes/worker-captures.ts:67` passes `auth.userId` instead of resolved Worker.id. Every photo capture today orphans the R2 upload. **Highest-impact fix** — belongs to Cluster C.

---

## WhatsApp OTP — DONE (2026-05-25)

Production backend was refusing to boot because Railway had `AXHY_OTP_BYPASS=1` + `NODE_ENV=production` (security guard at server.ts:73-80 correctly refused). Root cause: founder set the bypass to test screens while DLT SMS registration was pending. Wrong fix would have been to weaken the guard; right fix was to remove the env var and pivot OTP delivery to WhatsApp Cloud API (workers all carry smartphones).

**Files changed:** `apps/backend/src/lib/whatsapp-otp.ts` (new — mirrors the deleted MSG91 module shape, no-op when env unset), `apps/backend/src/routes/auth.ts` (one-line import swap + docstring update), `apps/backend/src/lib/msg91.ts` (DELETED — no other callers), `apps/backend/test/whatsapp-otp.test.ts` (new — 4 unit tests, all green, mocks global.fetch), `apps/backend/.env.example` (MSG91 + Gupshup + AXHY_OTP_BYPASS sections removed, Meta WhatsApp Cloud API section added). Railway env var `AXHY_OTP_BYPASS=1` deleted via `railway variable delete`; backend redeployed and is healthy (`[axhy-backend] listening on :8080`, `/health` → 200, `/worker/today` → 401 on unauth as expected).

### Required env vars to enable real WhatsApp delivery

When all THREE of TOKEN / PHONE_NUMBER_ID / TEMPLATE_NAME are unset the module is a no-op (dev / pilot mode — OTP still lives in Redis OTP store, tests read it directly). Set all three on Railway backend service to flip on real delivery:

| Env var                      | Value source                                                                                                                                                               | Notes                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `WHATSAPP_ACCESS_TOKEN`      | developers.facebook.com → your App → WhatsApp → API Setup → Temporary access token (24h) OR Meta Business Settings → System Users → Generate Token (no expiry, production) | Must be rotated before 24h test token expires. Permanent token requires business verification. |
| `WHATSAPP_PHONE_NUMBER_ID`   | Same API Setup page, "From" section, the numeric Phone Number ID                                                                                                           | Constant once chosen; not strictly secret but treat as one                                     |
| `WHATSAPP_OTP_TEMPLATE_NAME` | Name of the approved Authentication-category template                                                                                                                      | Default in code: `axhy_login_otp`. Must match the template name approved by Meta exactly.      |
| `WHATSAPP_OTP_TEMPLATE_LANG` | Template language code                                                                                                                                                     | Defaults to `en` if unset; use `en_US` if that's what Meta has on file                         |

### Founder-side Meta steps (parallel — does NOT block code)

1. Create Meta Business Account at business.facebook.com (5 min)
2. Create Meta App at developers.facebook.com, type "Business" (5 min)
3. Add WhatsApp product to the App (2 min)
4. Copy Phone Number ID + Temporary access token from the API Setup page
5. Add personal WhatsApp number as test recipient (one-time opt-in)
6. Submit `axhy_login_otp` template (Authentication category, English, body: `*{{1}}* is your Axhy verification code. For your security, do not share this code.`) — typically auto-approves in 24-48h
7. Paste the 4 env vars into Railway backend service → redeploy. Founder phone now receives real OTPs.
8. **Separate, 1-2 weeks**: submit Meta Business verification (legal docs) to unlock delivery to any opted-in phone

### Known gaps from WhatsApp OTP slice

1. **ADR-0007 amendment pending** — the ADR still describes MSG91 as the OTP delivery channel. Needs a constitutional session with founder approval to record the SMS→WhatsApp pivot. NOT blocking production; the code + handoff already reflect the new reality.
2. **Permanent System User token swap** — the 24h temporary token from Meta will need to be rotated to a permanent System User token after business verification clears. Pure env-var swap, no code change. File a calendar reminder once verification submitted.
3. **No SMS fallback** — explicitly out of scope per founder direction (workers all have smartphones). If adoption data ever surfaces users without WhatsApp, add an SMS fallback then behind an env-gated channel selector. Do NOT pre-build the abstraction.
4. **No integration test for the real Meta API call** — only unit test with mocked fetch. Smoke verification = founder receives OTP on personal WhatsApp after step 7. Could later add a real-API test gated on `WHATSAPP_ACCESS_TOKEN` being present, similar to the Redis-gated pattern in redis-primitives.test.ts.

---

## CLUSTER B — DONE (2026-05-25)

Cluster B — worker route consistency — landed. All 5 /worker/\* routes now share one shape: `requireWorkerRole` preHandler (X5), inline per-user Redis rate limit via `consumeWorkerRateLimit` (X2 non-deferrable per E3), corrected tenant-safety comments (X7), and the codified `resolveWorkerFromAuth` helper in middleware/tenant-context.ts for any future worker route that needs a Worker lookup (X6).

**Files changed:** `apps/backend/src/lib/worker-rate-limits.ts` (new — per-route limit config + helper), `apps/backend/src/middleware/tenant-context.ts` (added `resolveWorkerFromAuth` helper), `apps/backend/src/routes/worker-today.ts`, `apps/backend/src/routes/worker-visit.ts`, `apps/backend/src/routes/worker-captures.ts`, `apps/backend/src/routes/worker-consent.ts`, `apps/backend/src/routes/worker-submit.ts` (rate limit added to both submit + verify-status handlers). 5 new 429 integration tests appended (gated on `REDIS_URL`).

**Default per-user rate limits (env-tunable):** today=60/min, visit=60/min, captures=120/min, submit=20/min, verify-status=60/min, consent=10/min.

### X6 decision recap (founder-confirmed 2026-05-25)

The X6 finding asked: should worker reads switch to `withTenantContext`? After re-checking the schema, the answer was NO. Three facts pivoted it: (1) `Worker.userId` is `String? @unique` at the column level so cross-tenant reads are structurally impossible — at most one active Worker per User globally because anonymization on leave sets `userId` to null; (2) only `axhy_chat.turn_embeddings` has RLS enabled today (per migration 20260527_017), so `withTenantContext` would add NO database-level isolation for Worker/Visit/Site reads — only a `Company.status === 'ACTIVE'` check; (3) that ACTIVE check would conflict with the product UX of "no assignments today" when a customer's contract ends (founder direction — workers don't get suspended at the worker level, they just have no work to do). So the codification is: keep direct prisma for reads + use `resolveWorkerFromAuth` to make the pattern explicit + name the safety mechanism in route comments. `withTenantContext` stays for worker WRITES (worker-submit).

### Known gaps / next-session debt from Cluster B

1. **🆕 Architectural follow-up — RLS on Worker / Visit / VisitPhoto tables?** Today only `axhy_chat.turn_embeddings` has Postgres Row Level Security. App-level companyId filtering is the only isolation for worker tables. The founder asked specifically about "no leaks, ever" — RLS would provide database-enforced isolation as a safety net for any future code that forgets to filter. This is a multi-session migration + perf check + audit-rule update. Surface as a brainstorm topic next session before sub-slice 2c-1.
2. **🆕 session-audit.ts case-incomplete regex** — CHECK 10's pattern `prisma\.[a-z]*\.create|update|delete` matches lowercase table names only. `prisma.consentLog.create` (mixed case) is NOT flagged today. So the Cluster B claim that the audit would "stop flagging the worker routes" was based on a wrong premise (the routes weren't being flagged in the first place — only auth.ts:80 + notifications.ts:293 are). Real fix: switch the regex to `[a-zA-Z]*` and decide whether worker-consent.ts (which legitimately writes without companyId) needs an explicit `// raw-ok` marker. MEDIUM severity, separable.
3. **MCP guardrail nit (still present from Cluster A)** — `check_before_edit` requires re-Read after the pre-edit-guard hook ages out the file; even unchanged files force an interaction.
4. **Pre-commit challenge-response timing (still present from Cluster A)** — `CHALLENGE_EXPIRY_MS = 120s` is too tight for chat round-trip when a locked-doc edit lands.

### Cluster A carry-forward (still pending)

1. **Audit CHECK 4 comment-padded variant** — current regex catches `catch (err) { throw err; }` but NOT `catch (err) { // comment\n throw err; }`. Cluster A removed all comment-padded sites; the audit can't prevent regressions of that form. Fix: add a comment-skip group to the regex.
2. **Audit Phase 3 false-positive** — the Cluster A learning's `check_pattern: 'no-op-rethrow'` returns 0 matches via Phase 3's grep helper, but manual `grep -rn 'no-op-rethrow' packages/ --include=*.ts` finds it at `packages/ai-tools/src/session-audit.ts:405`. MEDIUM severity.

### Remaining clusters (C/D/E) — founder sequencing still needed

- **Cluster C — Submit + verify trust gaps:** X12 (polling success on timeout), X13 (setInterval async), X14 (silent catch), P4.1 (queue-empty-after-rehydration), P4.7 (no submit idempotency), P5.5 (uploading→idle on restore = duplicate uploads), P3.2 (Worker.id vs User.id in R2 presign path). 🚨 X12 remains non-deferrable.
- **Cluster D — Timezone correctness:** P2.1, P2.2, P1.6, P1.7. Needs `date-fns-tz` + `Company.tz` migration.
- **Cluster E — Test coverage:** X9 across all 5 worker test files. Single shared auth/role/ownership test utility.

Sub-slice 2c-1 (`leaveRequestMachine` + `swapRequestMachine`) still paused pending C-E sequencing decision.

## CLUSTER A — DONE (2026-05-24, commit `7ed1e80`)

Cluster A — anti-gaming + state-machine discipline — landed. 8 no-op `catch (err) { throw err; }` wrappers deleted across 5 files. CHEAT 3 in `docs/locked/development-anti-cheating.md` tightened. `session-audit.ts` CHECK 4 extended to flag the bare-throw form. Learning written: `docs/learnings/2026-05-24-all-no-op-rethrow-is-gaming.md`. X1 resolved.

**Sites fixed:** worker-today-service.ts (2), worker-submit-service.ts (1), worker-otp-verified-service.ts (1), api-submit.ts (2), identity-lifecycle.ts (2).
**Sites preserved (legitimate context-adding catches mis-classified by findings doc):** per-user-partition.ts:122-138, complaint-service.ts:318-327, chat-api.ts:142-150, photo-upload.ts:181-186.

---

## TOP PRIORITY — Worker code review findings (2026-05-24)

The 2026-05-24 session did a full read-only audit of the worker stack (43 files: mobile screens, mobile libs, backend routes, services, shared schemas, state machines). **No code was changed.** The findings live in `axhy-v3/handoff/WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md`.

**Counts:** 14 cross-cutting findings (X1-X14) + 50+ pipeline-specific findings + 4 state-machine findings. 3 🚨 non-deferrable items: X1 (audit-gaming try/catch in ~12 files), X2 (no per-user rate limit on any `/worker/*` route), X12 (polling-success-on-timeout trust violation in submit.tsx).

**Founder's plan for next session:** cluster the findings by root cause, decide per-cluster which to fix-now / defer / discard, then implement in batches. Each cluster fix runs through `impactCheck` + `check_before_edit` + TDD.

**Suggested cluster groups** (next session refines):

- **Cluster A — Anti-gaming + state-machine discipline:** X1, X3, X4, X8. Root cause: audit rules that incentivize gaming + missing parse-at-boundary pattern. Fix template lives in `worker-otp-verified-service.ts:88-117`.
- **Cluster B — Worker route consistency:** X2 (rate limit), X5 (role gating), X6 (tenant-context), X7 (citing debt). Likely one shared Fastify plugin handles 3 of 4.
- **Cluster C — Submit + verify trust gaps:** X12 (polling success on timeout), X13 (setInterval async), X14 (silent catch), P4.1 (queue-empty-after-rehydration), P4.7 (no submit idempotency), P5.5 (uploading→idle on restore = duplicate uploads). All interact.
- **Cluster D — Timezone correctness:** P2.1, P2.2 (visit/[id].tsx device-tz bug), P1.6, P1.7 (DEFAULT_TZ hardcoded). Likely needs `date-fns-tz` and a `Company.tz` migration.
- **Cluster E — Test coverage:** X9 across all 5 worker test files. Single shared "auth/role/ownership" test utility.

**Open before sub-slice 2c-1:** founder may want some/all of these fixed before adding `leaveRequestMachine` + `swapRequestMachine`. Confirm sequencing at session start.

---

## Previous baseline (sub-slice 2b-4 complete, commit `08c65a5` — 2026-05-23)

> The original 2b-4 handoff content remains below for reference. Sub-slice 2c-1 (leaveRequestMachine + swapRequestMachine) is paused pending the code-review cluster work above.

# Next Session — Worker MVP Sub-slice 2b-4 (30-day sweep + reinstall rehydration)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

Sub-slices `worker-d1-s2b-3-timer-submit` and `worker-d1-s2b-4-photo-sweep-queue-persistence` both shipped 2026-05-23 (commit `08c65a5`). The full cold-start durability layer is now in place: upload queue persists across app kills, orphaned photos from reinstalls auto-re-enqueue, and local photos older than 30 days are swept nightly.

## What's shipped in 2b-3

- **Backend:**
  - `apps/backend/src/lib/r2-presign.ts` — `buildObjectKey` parameter widened from `UploadUrlFile` to `Pick<UploadUrlFile, 'phase' | 'index' | 'contentType'>` so the submit service can reconstruct keys without `fileSize`. Resolves deferred item #3 from 2b-2 (server-side key reconstruction).
  - `apps/backend/src/lib/services/worker-submit-service.ts` — validates worker ownership + PHOTOS_PENDING guard, creates `VisitPhoto` rows (translating Zod lowercase `'before'/'after'` → Prisma `'BEFORE'/'AFTER'`), updates visit to `AWAITING_VERIFICATION`. Returns discriminated union `{ kind: 'OK' | 'NOT_FOUND' | 'WRONG_WORKER' | 'WRONG_STATE' }`. Resolves deferred item #5 from 2b-2 (phase case mismatch).
  - `apps/backend/src/routes/worker-submit.ts` — `POST /worker/visits/:visitId/submit` (WORKER-only, `withTenantContext` wrapper, maps result kinds to 200/403/404/409/400) + `GET /worker/visits/:visitId/verify-status` (WORKER-only, returns visitState + photos array with aiVerifyStatus).
  - `apps/backend/src/server.ts` — registered `registerWorkerSubmitRoutes(app)`.
  - `apps/backend/test/worker-submit.test.ts` — 7 real-DB integration tests (unauthenticated/wrong-role/wrong-worker/wrong-state/empty-photos/happy-path/verify-status). Requires `AXHY_DB_URL` / `DATABASE_PUBLIC_URL` / `DATABASE_URL` — run via `railway run -- pnpm --filter @axhy/backend test:integration`.
- **Mobile:**
  - `apps/mobile/lib/api-routes.ts` — added `workerSubmit` + `workerVerifyStatus` entries to `API_ROUTES`.
  - `apps/mobile/lib/api-submit.ts` — `submitVisit()` + `fetchVerifyStatus()` typed against shared Zod schemas.
  - `apps/mobile/app/(worker)/capture/[visitId]/timer.tsx` — real count-up MM:SS timer (setInterval, 1 s tick). `KeepAwake` inner component conditionally mounts on native (expo-keep-awake, tag `'axhy-timer'`). GPS sampled at mount and on "Done cleaning" tap via expo-location (Platform.OS guard, console.log only — no backend column yet, deferred to 2b-4+).
  - `apps/mobile/app/(worker)/capture/[visitId]/submit.tsx` — state machine `idle → submitting → polling → done | error`. Reads `r2UploadQueue.snapshot()` filtered to visitId + status='done'. Polls `fetchVerifyStatus` every 3 s (max 40 polls). `mountedRef` guards state updates on unmount.
- **Shared:**
  - `packages/shared-schema/src/zod/worker-submit.ts` — `WorkerSubmitPhotoSchema`, `WorkerSubmitRequestSchema`, `WorkerSubmitResponseSchema`, `VerifyStatusPhotoSchema`, `VerifyStatusResponseSchema`.
  - `packages/shared-schema/src/index.ts` — re-exports `./zod/worker-submit.js`.
- **QA:** `apps/mobile/scripts/qa-worker-d1-s2b-3-timer-submit.ts` — Playwright script (gitignored). SPA-nav fix: navigates between capture steps via button clicks (`page.getByRole('button', { name: ... }).click()`) instead of `page.goto()`, keeping the in-memory `r2UploadQueue` alive. Intercepts: `upload-urls` → fake presign, `mock-r2.dev PUT` → 200 OK, `submit` → fake AWAITING_VERIFICATION, `verify-status` → AWAITING_VERIFICATION on first call / VERIFIED on second. 10 screenshots.

## Deferred — carry forward to 2c and beyond

1. **Batch presigns** — carried from 2b-2. Mobile still sends single-file requests; backend supports up to 20/batch.
2. **`FileSystem.uploadAsync` streaming PUT** — carried from 2b-2. Current path loads full file into JS heap.
3. **GPS persist + motion guard** — timer.tsx logs GPS at start/end, no backend column yet. Motion check (accelerometer) deferred.
4. **`MAX_PHOTO_BYTES` collision** — shared-schema exports 20MB; mobile 8MB. No consumer imports both today.
5. **Upload-queue `emit()` churn on retry path** — cosmetic, deferred.
6. **No debounce on onChange** — queue persistence fires on every mutation; acceptable for MVP queue sizes (~40 photos/visit max).

## What's shipped in 2b-4

- **`apps/mobile/lib/storage/local-kv.ts`** — file-backed KV store using `Paths.document.uri`; no AsyncStorage dependency
- **`apps/mobile/lib/storage/photo-sweep.ts`** — `maybeSweepOldPhotos(workerId)` sweeps dirs >30 days old, throttled once/24 h via `axhy-sweep-lastRun` KV key
- **`apps/mobile/lib/storage/queue-persistence.ts`** — `saveQueueState`/`loadQueueState`; excludes done items; resets uploading→idle on restore; key `axhy-queue-v1`
- **`apps/mobile/lib/storage/reinstall-rehydration.ts`** — `rehydrateFromPartition(workerId)` scans partition for orphaned photos not in queue and re-enqueues
- **`apps/mobile/lib/r2-upload-queue.ts`** — added `hydrate(items)`: merges persisted items without overwriting live state, then triggers pump
- **`apps/mobile/lib/storage/per-user-partition.ts`** — added `listVisitDirs(workerId)`; `writePhoto` gained try/catch+rethrow
- **`apps/mobile/app/(worker)/_layout.tsx`** — useEffect wires cold-start init + onChange queue persistence + AppState foreground sweep (no JSX changes)
- **16 unit tests** across photo-sweep.test.ts, queue-persistence.test.ts, reinstall-rehydration.test.ts

## Decisions still in force (don't re-debate)

| Decision                                                                                                      | Source                                                          |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 3-tab canonical (Home / History / Profile); capture surfaces as Home banner                                   | `DELTA.html` divergence #1 resolved 2026-05-21                  |
| Theme picker cut at MVP                                                                                       | `DO_NOT_BUILD_MVP.md` M14                                       |
| Photo storage: app-internal only, no gallery, per-user partition, R2 incremental upload, 30-day local cleanup | Founder direction 2026-05-21 — pipeline landed 2b-2, sweep 2b-4 |
| Location permission asked upfront on (auth)/permissions screen alongside Camera                               | Founder lock 2026-05-22 (Option B)                              |
| Sprint mode ON — no per-rev friend review, batch panel review at end of sprint                                | `feedback_supervisor_sprint_mode.md` (carried)                  |
| All commits sign with `Co-Authored-By: Claude Opus 4.7 (1M context)`                                          | Convention from existing log                                    |

## Discipline gates active

- `check_before_edit` on every code Write/Edit (Layer 1 pre-commit hook enforces).
- `check_before_plan` on every plan/persona/handoff Write/Edit (architecture evidence + source hierarchy required).
- `check_before_done` on every done-memo write (quality gate L3+ required to pass).
- Pre-commit eslint rule `axhy/require-derives` blocks exports without `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)` JSDoc.
- Pre-commit `docs/personas/` changes need `AXHY_FOUNDER_APPROVED=1`.

## Known caveats carried forward

- **Brain build works locally via `.env.local`.** `axhy-v3/.env.local` (gitignored, repo root) holds `DATABASE_PUBLIC_URL` + `OPENAI_API_KEY`. Run: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`. Confirmed working 2026-05-23.
- **Expo Web duplicate-tab quirk:** the Tabs navigator renders a faint duplicate tab row in the body area of step screens. Not present on real device; ignore for scaffold work.
- **Backend integration tests require Railway DB.** Run via `railway run -- pnpm --filter @axhy/backend test:integration` or with `.env.local` exported.

## What starts next: sub-slice 2c-1 (leaveRequestMachine + swapRequestMachine)

**Scope:**

1. `leaveRequestMachine` in `packages/state-machines/src/` — IDLE → PENDING → APPROVED / REJECTED / CANCELLED
2. `swapRequestMachine` in `packages/state-machines/src/` — IDLE → PENDING → CONFIRMED / REJECTED / CANCELLED
3. Unit tests for both machines (XState, no DB)
4. Backend: `POST /worker/leave-requests`, `POST /worker/swap-requests` + mobile Leave sheet + Swap sheet screens

## First thing to do in next session

1. **Run `load axhy system`** — full boot per CLAUDE.md (audit + brain:build + memory + handoff).
2. **Confirm Cluster B baseline:** `pnpm --filter @axhy/backend exec tsc --noEmit` should be clean. If `REDIS_URL` is set, the 5 new 429 integration tests should pass via `railway run -- pnpm --filter @axhy/backend test:integration`.
3. **Decide Cluster C/D/E sequencing** with founder. Cluster C has the one remaining 🚨 non-deferrable (X12 polling-success-on-timeout); Cluster D needs a `Company.tz` schema migration; Cluster E is test-coverage consolidation.
4. **Surface the RLS architectural question** to founder (item #1 in "Known gaps from Cluster B"). This is the strongest data-isolation lever the codebase isn't currently using.
5. **Sub-slice 2c-1** (`leaveRequestMachine` + `swapRequestMachine`) stays paused until C-E sequencing is decided.
