# Next Session — 5 PRs open, F1-b verified, persona-graph methodology shipped to brain

**Last updated:** 2026-05-31 morning IST (HR A1 + Wave-3 + Slice 2/3 brainstorms + F1-b 5-persona QA all shipped as PRs)
**Branch state:** `main` is at `1347dbc` (PR #8 merged). 5 feature branches open as PRs awaiting founder review.
**Active phase:** End-of-session housekeeping. Founder reviews + merges queue tomorrow.

---

## What shipped today (2026-05-30 evening + 2026-05-31 morning IST)

5 PRs open against `main`. Order they should be reviewed/merged:

### PR #9 — HR A1 thin admin-web portal (READY TO MERGE)

- Branch: `feat/hr-a1-thin-portal`, 30 commits ahead of main
- URL: https://github.com/Akshaytho/axhy-v3/pull/9
- 7 HR ops live: invite HR/SUPERVISOR, invite WORKER, anonymize, create site, bind supervisor, leave inbox + leave decide
- Backend `test:hr` 77/77 green standalone (when run alongside Wave-3 = 112/112)
- Playwright 1/1 green + 14 screen screenshots at `docs/evidence/2026-05-30/`
- 2 pre-existing bugs fixed in passing: admin-web login destructure + jwt-public sub-vs-userId
- First application of `feedback_persona_graph_route_audit.md` (founder's persona-graph methodology, committed to brain at axhy-cognitive-system `bcc754e`)

### PR #10 — Wave-3 HR hardening matrix (READY TO MERGE after #9)

- Branch: `feat/hr-wave-3-hardening`, 4 commits
- URL: https://github.com/Akshaytho/axhy-v3/pull/10
- 35 new tests filling 5 coverage gaps: expired-token, idempotency, concurrent, malformed, empty-list
- 1 production fix: `User.phone` parallel race in `admin-membership-service` + `admin-worker-service` — raw SQL `INSERT ... ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id` (Prisma upsert is NOT atomic at SQL level; raw is)
- Architectural finding surfaced (see Open architectural questions below): `adminCreateWorkerService` doesn't auto-assign `Membership.podId` → HR pod-scoped `GET /admin/workers` can't see workers they themselves created
- `test:hr` 112/112 green

### PR #11 — Slice 2 OWNER brainstorm + persona-graph audit (DOCS-ONLY)

- Branch: `feat/slice-2-owner-brainstorm`
- URL: https://github.com/Akshaytho/axhy-v3/pull/11
- `EVID-OWNER-PERSONA-MAP.md` + Slice 2 design spec
- 10 GAP candidates surfaced
- 5 founder questions inline in PR body (Decision-10 scope, AI cap override, bank edit OTP, co-OWNER invite, tenant-wide reads)

### PR #12 — Slice 3 SUPER_ADMIN brainstorm + persona-graph audit (DOCS-ONLY)

- Branch: `feat/slice-3-super-admin-brainstorm`
- URL: https://github.com/Akshaytho/axhy-v3/pull/12
- `EVID-SUPER-ADMIN-PERSONA-MAP.md` + Slice 3 design spec
- 11 GAP candidates surfaced
- 5 founder questions inline (`intent_reason` enforcement, hard-delete allowlist, tenant-not-found semantics, AI cap-raise authority, platform-admin sign-in flow)

### PR #13 — F1-b 5-persona enterprise QA walk findings (DOCS-ONLY)

- Branch: `feat/f1b-5-persona-qa`
- URL: https://github.com/Akshaytho/axhy-v3/pull/13
- `EVID-F1B-5-PERSONA-QA.md`
- 5 personas × ~9 scenarios + 6 adversarial = 51 scenarios, ALL PASS
- 11 contracts confirmed, 0 production bugs found
- 3 recommendations for follow-up (GET listing surfaces, lock 10s grace window, schema-aware anonymization)

### Other work this session

- Persona-graph rule authored + brain-embedded (`axhy-cognitive-system` commit `bcc754e`)
- Test infra fixed: RC-1 (helpers.ts scoped deletes) + RC-4 (DATABASE_PUBLIC_URL routing)
- Cross-route water-flow test (persona-graph rule's keystone) at `apps/backend/test/hr-water-flow.test.ts`
- RC-A leave-decision pre-existing failures RESOLVED via seed expansion (commit `3232aef`)

---

## First actions next session

1. **Founder reviews + merges PRs in order:**
   - PR #9 first (HR A1 thin portal) — code+tests, biggest surface
   - PR #10 next (Wave-3 hardening) — depends on #9 merging first
   - PR #13 (F1-b QA findings) — docs-only, mergeable any time
2. **Founder answers founder-questions:**
   - 5 questions inline in PR #11 (OWNER scope)
   - 5 questions inline in PR #12 (SUPER_ADMIN scope)
   - Slice 2 + Slice 3 BUILD work is blocked until these are answered.
3. **Once PR #9 merges → unblock Q3 rename slice:**
   - Q3 rename (`Membership.status` INACTIVE → ANONYMIZED) is blocked on HR A1 merge — it conflicts with `anonymize-worker-service`.
   - First action post-merge: rebase Q3 rename branch onto main, re-run `test:hr` matrix, ship.
4. **F1-c TTL + logout-everywhere** — separate slice, not blocked but not started. Pick up after Slice 2/3 questions answered or in parallel if founder prioritizes.

---

## Open architectural questions

### From Wave-3 (PR #10)

- **`Membership.podId` auto-assignment on worker create:** `adminCreateWorkerService` does not auto-bind newly-created workers to the HR creator's pod. Effect: HR creates a worker, then their own pod-scoped `GET /admin/workers` listing doesn't include that worker. Two valid resolutions — (a) auto-bind to creator's pod on create, (b) make HR listing tenant-wide. Founder decision needed.

### From F1-b 5-persona QA (PR #13)

- **GET listing surfaces:** Several admin/HR routes have POST/PATCH but no symmetric GET listing — surfaces a UX gap once frontends mature. Recommendation file lists which routes.
- **Lock 10s refresh-token grace window:** Hardcoded constant should be promoted to env var + locked-doc constant so it can't drift in future refactors.
- **Schema-aware anonymization:** Anonymize routine relies on hand-maintained column list; if a future migration adds a PII column, the routine won't know. Recommendation: derive from Prisma metadata or annotation.

### Carried from prior session (still open)

- **`as Role` casts in `apps/backend/src/routes/auth.ts:133-146`** — tracked separately per founder.
- **`prisma.user.findFirst` + `prisma.membership.findMany` (intentional pre-tenant)** at `auth.ts:76-87` — tracked separately.
- **`unhandled_async` on bootstrap + shutdown** at `server.ts:63,186` — tracked separately.
- **Chat per-supervisor message rate limit + 50-concurrent semaphore not enforced** — tracked in `chat-abuse-prevention.md`.
- **Raw prisma outside transaction** at `notifications.ts:293` — tracked separately.
- **Worker / Visit / VisitPhoto tables: no RLS** — app-level companyId filter only. Filed by Cluster B 2026-05-25.

---

## What's blocked or queued

- **Q3 rename** (`Membership.status` INACTIVE → ANONYMIZED) — blocked on PR #9 merge; conflicts with `anonymize-worker-service`.
- **Slice 2 BUILD** — blocked on founder answering 5 questions in PR #11.
- **Slice 3 BUILD** — blocked on founder answering 5 questions in PR #12.
- **F1-c TTL + logout-everywhere** — separate slice, not blocked but not started.

---

## Pre-existing debt unchanged

| File:line                                                   | Item                                                                             | Status                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/backend/src/routes/auth.ts:133-146`                   | `as Role` cast x3 on `m.role`                                                    | tracked separately per founder        |
| `apps/backend/src/routes/auth.ts:76-87`                     | `prisma.user.findFirst` + `prisma.membership.findMany` (intentional pre-tenant)  | tracked separately                    |
| `apps/backend/src/server.ts:63,186`                         | `unhandled_async` on bootstrap + shutdown handlers                               | tracked separately                    |
| `apps/backend/src/routes/chat.ts`                           | per-supervisor message rate limit + 50-concurrent semaphore not enforced         | tracked in `chat-abuse-prevention.md` |
| `apps/backend/src/dispatcher/handlers/notifications.ts:293` | raw prisma outside transaction                                                   | tracked separately                    |
| `packages/ai-tools/src/session-audit.ts` CHECK 10           | regex `prisma\.[a-z]*\.create` misses mixed-case table names (e.g. `consentLog`) | filed by Cluster B 2026-05-25         |
| Worker / Visit / VisitPhoto tables                          | No RLS enabled — companyId filtering is app-level only                           | filed by Cluster B 2026-05-25 (RLS Q) |

(All items verified still pending — no fixes shipped today on this list.)

---

## Recent prior session context (F1-b code-complete, 2026-05-28)

The F1-b code (refresh-rotation backend + mobile interceptor + audit guard) was code-complete on 2026-05-28 via PR #7 (merged to main 2026-05-29). The 5-persona enterprise QA walk that the rule required ran today and is captured in PR #13 — that closes F1-b.

### Permanent enterprise-QA rule (founder direction 2026-05-27)

**Rule:** Any medium-to-major refactor or new code change at the system level requires **enterprise-grade QA** before "done."

**Required:** (1) Unit tests, (2) Real-DB integration tests, (3) Prod-grade QA walk per persona, (4) Adversarial pass, (5) Cross-persona panel, (6) Findings doc, (7) `check_before_done` gate.

**Saved:** `axhy-cognitive-system/memory/base/feedback_major_changes_need_enterprise_qa.md` (commit `4f289db`).

### F1 spec — decisions locked

The F1 trust-model arc has been brainstormed through Sections 1-5. Founder approved each section.

**Locked architectural decisions:**

1. **Scope:** Full F1 arc (base + enterprise layer) planned as one spec, executed across 4 slices/sessions.
2. **Invalidation strategy:** `Membership.token_epoch` + `User.is_platform_admin` + 5-min access TTL + rotating refresh with Stripe-style family detection. Epoch bump on revoke/anonymize/fire = instant token death.
3. **SUPER_ADMIN bootstrap:** Migration backfills founder's User row (`UPDATE User SET is_platform_admin=true WHERE id='17285e17-9434-4522-9ac1-1cec1cbea31f'`). All future platform admins added via SUPER_ADMIN-only endpoint.
4. **mint-token.ts disposition:** Keep as dev tool, refuse if `NODE_ENV=production` OR target role is SUPER_ADMIN.
5. **KMS-backed signing:** Deferred to post-arc slice. HS256 with rotating `JWT_SECRET` is sufficient until first paid customer / external audit.
6. **Refresh family detection:** Postgres holds the family row, Redis holds `current_hash` per family (hot path, sub-ms reads, sliding TTL). At 2000 users + 100 supervisors: ~22k Redis SETs/day = 0.0005% of capacity. Cost negligible — founder confirmed approval.
7. **Cutover:** 30-day compatibility window. Old tokens (no epoch claim) accepted in legacy mode. Every refresh upgrades a user to the new format. Day 30: flip `AUTH_STRICT_MODE=true`, delete legacy code.

### F1 slice plan (4 sessions)

| Session | Slice                                | Lands                                                                                                          | Status                                |
| ------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1       | `f1-a-schema-and-membership-backing` | Migration + `requireAuth` compatibility mode + Membership/epoch checks                                         | DONE (PR #6)                          |
| 2       | `f1-b-refresh-rotation`              | `RefreshToken` table + Redis store + `/auth/refresh` rewrite + family detection + tests + 5-persona QA         | DONE (PR #7 merged + #13 QA findings) |
| 3       | `f1-c-ttl-and-logout-everywhere`     | Access TTL 15->5 min, `/auth/logout-everywhere` route, anonymize-service wired to bump epoch + revoke families | not started, not blocked              |
| 4       | `f1-d-strict-mode-flip`              | Flip `AUTH_STRICT_MODE=true`, delete legacy code paths, final test sweep                                       | after F1-c                            |

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

| Phase      | Type                              | Status                                                       |
| ---------- | --------------------------------- | ------------------------------------------------------------ |
| 7A         | Spec                              | Approved (8.7/10), 5 corrections applied                     |
| 7B         | Token measurement tool            | 27/27 tests green, commit `3e24630`                          |
| 7C         | Behavioral — tool-output-to-file  | Active (rules above)                                         |
| 7D         | Code — guardrail compact mode     | Build only if 7B data shows guardrail output >20% of context |
| 7E         | Behavioral — short-session policy | Active (rules above)                                         |
| Validation | F1 + F31 as targets               | F1-a + F1-b validated; F31 ahead                             |

---

## Pre-F1 historical context (archived)

> **Moved to [`ARCHIVE_PRE_F1.md`](./ARCHIVE_PRE_F1.md)** on 2026-05-28 to cut boot-read bloat (~378 lines → ~15K tokens saved per session). Contains: wave-2 QA findings, Cluster A/B/C/D/E status, WhatsApp OTP, super-admin bootstrap, sub-slice 2b-4 baseline, decisions still in force, known caveats.
>
> Read the archive only when working on pre-F1 items. Brain has it embedded via impactCheck.
