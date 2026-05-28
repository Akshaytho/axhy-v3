# Next Session — Resume F1-b at Task 4

**Last updated:** 2026-05-28 (F1-b Tasks 1-3 shipped, branch pushed)
**Branch:** `feat/f1-b-refresh-rotation` (pushed to origin)
**Plan doc:** `axhy-v3/docs/plans/2026-05-28-f1-b-refresh-rotation.md`

## What shipped 2026-05-28

### Cognitive system: Compact-aware read-cache reflex (commit `8e4dbcd` on axhy-cognitive-system main)

- `wasFileReadRecently()` now checks compaction events instead of 10-min timer
- PostCompact hook writes `last_compact_at` marker; pre-edit-guard consumes it
- 37 tests green. Architectural doc: `axhy-cognitive-system/docs/THREE_LOOP_MODEL.md`

### F1-a: Trust model schema + requireAuth (PR #6 merged to main)

- Migration 020: `User.is_platform_admin`, `Membership.token_epoch`
- `requireAuth` dual-mode: new-format validated against DB; legacy accepted in compat mode
- 39/39 tests across 10 files. Enterprise QA findings committed.

### F1-b Tasks 1-3: RefreshToken store + unit tests (branch, NOT merged)

- **`e435c0f`:** Migration 021 (RefreshToken table, 14 cols, 5 indexes, 2 FKs cascade) + Prisma model
- **`96bdf78`:** `refresh-token-store.ts` — create/validate/rotate/revokeForCompromise/revokeForLogout + 12/12 unit tests green

## Resume at Task 4

| Task  | Description                             | Status      |
| ----- | --------------------------------------- | ----------- |
| 1     | Migration + Prisma RefreshToken model   | ✅          |
| 2     | refresh-token-store.ts implementation   | ✅          |
| 3     | 12/12 unit tests for store              | ✅          |
| **4** | **POST /auth/refresh route + register** | 🔜 Next     |
| 5-6   | 7 integration tests                     | Not started |
| 7     | Swap /auth/otp/verify to opaque tokens  | Not started |
| 8     | Mobile interceptor + tests              | Not started |
| 9     | Audit pattern                           | Not started |
| 10    | Enterprise QA + PR                      | Not started |

## First thing next session

1. `git checkout feat/f1-b-refresh-rotation`
2. Read plan: `docs/plans/2026-05-28-f1-b-refresh-rotation.md` Task 4
3. Verify: `pnpm --filter @axhy/backend vitest run src/lib/services/refresh-token-store.test.ts`
4. Implement Task 4: `POST /auth/refresh` in `apps/backend/src/routes/auth-refresh.ts`

## Session token snapshot (2026-05-28 F1-b session)

- cost: 1.10M 🟢 | context: 217.4K/turn 🟠 context_orange (stop trigger)
- 169 turns, 102 tool calls

---

## Permanent enterprise-QA rule (founder direction 2026-05-27)

**Rule:** Any medium-to-major refactor or new code change at the system level requires **enterprise-grade QA** before "done."

**Required:** (1) Unit tests, (2) Real-DB integration tests, (3) Prod-grade QA walk per persona, (4) Adversarial pass, (5) Cross-persona panel, (6) Findings doc, (7) `check_before_done` gate.

**Saved:** `axhy-cognitive-system/memory/base/feedback_major_changes_need_enterprise_qa.md` (commit `4f289db`).

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

---

## Pre-F1 historical context (archived)

> **Moved to [`ARCHIVE_PRE_F1.md`](./ARCHIVE_PRE_F1.md)** on 2026-05-28 to cut boot-read bloat (~378 lines → ~15K tokens saved per session). Contains: wave-2 QA findings, Cluster A/B/C/D/E status, WhatsApp OTP, super-admin bootstrap, sub-slice 2b-4 baseline, decisions still in force, known caveats.
>
> Read the archive only when working on pre-F1 items. Brain has it embedded via impactCheck.
