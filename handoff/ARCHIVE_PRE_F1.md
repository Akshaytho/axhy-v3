# Handoff Archive — Pre-F1 Historical Context

> **Archived 2026-05-28.** Moved from NEXT_SESSION.md to cut boot-read bloat (~378 lines, ~15K tokens per session). Read only when working on pre-F1 items (Cluster C/D/E, wave-2 QA, WhatsApp OTP, sub-slice 2c-1).

---

## Founder-approved direction (2026-05-26 evening)

1. **F1 trust-model fix** — Membership-backed requireAuth + is_platform_admin. Short TTL, rotating refresh, revocation, eventually KMS.
2. **F31 anonymize PII scrub** — scrub Worker PII, keep behavioral data. Backfill 7 orphan rows.
3. **F11 X12 mobile submit** — rewrite submit.tsx to verify actual visitState.
4. **F28 latency region** — migrate to Mumbai. 250ms → 50ms RTT.
5. **Speed levers:** Redis caching, pgvector tuning, connection pool, CDN.
6. **F4 + F6 + F22** quick wins.

## Wave 2 QA Findings (2026-05-26)

Full doc: `WAVE_2_QA_FINDINGS_2026-05-26.md` — 25 findings (4 critical, 7 medium). Do NOT re-do.

Pending fixes: Q1 CORS regex, Q2 StateBadge crash (2-line), Q3 R2 key mismatch User.id vs Worker.id (Cluster C).

## SUPER-ADMIN-OWNER-BOOTSTRAP — DONE (2026-05-25)

Commit `b7a1cbb`. POST /super-admin/memberships. 5/5 tests. Founder OWNER `fbb2da2f` in QA Test Co `2d2f1ccb`.

Gaps: PATCH for OWNER revocation, POST /super-admin/companies, co-OWNER endpoint.

## WAVE-2-PREP SLICE — DONE (2026-05-25)

Commits `f0a7026..d8edfe8`. 5 admin/HR routes + role-gates + schema migration + 21 tests.

Routes: POST /admin/memberships, /admin/workers, /admin/workers/:id/anonymize, /admin/sites, /admin/sites/:id/bindings.

## WhatsApp OTP — DONE (2026-05-25)

MSG91 → WhatsApp Cloud API. 4 env vars for real delivery. ADR-0007 amendment pending.

## Cluster B — DONE (2026-05-25)

Worker route consistency. requireWorkerRole + Redis rate limits + resolveWorkerFromAuth. X6: direct prisma for reads, withTenantContext for writes.

Gaps: RLS follow-up, audit regex case, check_before_edit re-Read friction, pre-commit 120s timing.

## Cluster A — DONE (2026-05-24)

8 no-op catch/throw deleted. CHEAT 3 tightened. Carry-forward: comment-padded regex, Phase 3 false-positive.

## Remaining Clusters (C/D/E)

- **C — Submit + verify:** X12 non-deferrable, X13, X14, P4.1, P4.7, P5.5, P3.2
- **D — Timezone:** needs date-fns-tz + Company.tz migration
- **E — Test coverage:** shared auth/role/ownership test utility

Sub-slice 2c-1 paused until C-E sequencing.

## Worker code review (2026-05-24)

Full doc: `WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md`. Cluster A+B done; C/D/E pending.

## Sub-slice 2b-4 baseline (2026-05-23)

Commit `08c65a5`. Queue persistence, photo sweep, reinstall rehydration. 16 tests.

Deferred: batch presigns, streaming PUT, GPS persist, MAX_PHOTO_BYTES collision.

## Decisions still in force

| Decision                                                  | Source                             |
| --------------------------------------------------------- | ---------------------------------- |
| 3-tab canonical (Home/History/Profile)                    | DELTA.html 2026-05-21              |
| Theme picker cut at MVP                                   | DO_NOT_BUILD_MVP.md M14            |
| Photo storage: app-internal, per-user, R2, 30-day cleanup | Founder 2026-05-21                 |
| Location permission upfront                               | Founder lock 2026-05-22            |
| Sprint mode ON                                            | feedback_supervisor_sprint_mode.md |

## Known caveats

- Brain build: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`
- Expo Web duplicate-tab quirk (not on real device)
- Backend integration tests: `railway run -- pnpm --filter @axhy/backend test:integration`
