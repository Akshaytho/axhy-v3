# Wave 1 backend — ReplacementInvite (F28) — DONE (single-recipient)

**Date:** 2026-05-18
**Author:** Claude (Opus 4.7) executing in main session
**Status:** Shipped to `main` across `de0cacf` (initial) → `bca387c` (simplified) → root-level fix commit (this commit, Sprint-1 deep-review pass)
**Plan:** `docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 Wave 1
**Closes:** Sprint 1 backend trilogy. Wave 2 = `1ed25ed`, Wave 3 = `2d16919`, Wave 1 final shape = this commit.
**Founder lock:** `feedback_replacement_invite_single_recipient.md` (2026-05-18)
**Deep review:** `docs/findings/2026-05-18-sprint-1-deep-review.md`

## Final shipped design — single-recipient

A `ReplacementInvite` is a 1:1 contract between supervisor and ONE candidate worker:

- 2-minute default TTL (configurable 30s–30min via `expiresInSec`).
- On terminal state (ACCEPTED / DECLINED / EXPIRED / CANCELLED), supervisor may
  send a fresh invite to the same worker or a different worker.
- NOT a multi-worker broadcast. The original Wave 1 implementation built a
  PUBG-squad-style broadcast (groupId + advisory lock + partial unique index +
  sibling expire). The founder revised the product to single-recipient on
  2026-05-18 (after the initial commit) — see the feedback memory above for
  the reasoning ("if all accept it will create problem").

## Files shipped

### Schema + migrations

- `packages/shared-schema/prisma/schema.prisma` — `model ReplacementInvite` (lines ~1196–1252)
- `packages/shared-schema/prisma/migrations/20260522_010_replacement_invite/migration.sql` — table + 3 CHECK constraints + 4 indexes (original broadcast machinery NOW removed by 011; see migration 010's HISTORICAL NOTE)
- `packages/shared-schema/prisma/migrations/20260523_011_replacement_invite_drop_group/migration.sql` — drops `groupId` column + partial unique index + groupId index (simplification commit)
- `packages/shared-schema/prisma/migrations/README.md` — explains the 009/010/011 date offset (Cluster C of the deep review)

### Backend

- `apps/backend/src/lib/services/replacement-invite-service.ts` — 5 service functions:
  - `createReplacementInvite` — single-recipient send, validates site + visit + candidate, emits audit + push.
  - `acceptReplacementInvite` — atomic conditional UPDATE on `status='PENDING'`. Auto-creates one-day ACTIVE Assignment for the accepting worker. UTC time-zone math throughout (Cluster D single-symptom fix).
  - `declineReplacementInvite` — conditional UPDATE; pushes supervisor.
  - `cancelReplacementInvite` — supervisor recalls a PENDING invite; pushes worker.
  - `sweepExpiredReplacementInvites` — cron sweep. Per-invite `$transaction` (Cluster D fix): UPDATE + outcome SupervisorDecision + Notification commit atomically per row. Batched at 100 rows/tick; 10s tx timeout. Multi-replica safe via the conditional UPDATE on `status='PENDING'`.
- `apps/backend/src/routes/replacement-invites.ts` — 5 routes:
  - `POST /supervisor/replacement-invites` (single `candidateUserId`, not array)
  - `POST /worker/replacement-invites/:id/accept`
  - `POST /worker/replacement-invites/:id/decline`
  - `GET /supervisor/replacement-invites?status=&limit=&cursor=`
  - `POST /supervisor/replacement-invites/:id/cancel`
- `apps/backend/src/jobs/replacement-invite-expiry-sweep.ts` — cadence-gated dispatcher hook (30s); first-boot behaviour matches `binding-expire-sweep`.
- `apps/backend/src/dispatcher/index.ts` — wires `maybeRunReplacementInviteExpirySweep` into the dispatcher tick.
- `apps/backend/src/server.ts` — `registerReplacementInviteRoutes(app)`.

### Shared schema

- `packages/shared-schema/src/zod/replacement-invite.ts` — single-recipient Zod surface (status enum, row, route bodies + responses, timing constants).
- `packages/shared-schema/src/zod/supervisor-decision-kinds.ts` — `REPLACEMENT_INVITE_OUTCOME` kind added (Wave 2 integration plug-in lands in Sprint 2 mobile).
- `packages/shared-schema/src/index.ts` — re-exports.

### Tests

- `apps/backend/test/wave-1-replacement-invite-routes.test.ts` — comprehensive single-recipient E2E. Covers: full lifecycle, re-send after decline / expiry / cancel, cross-tenant isolation (supervisor + worker), idempotent re-accept (409 ALREADY_DECIDED), assignment auto-create, expiry sweep + outcome decision, cadence-gate first-boot, audit chain. Passes in ~74s on Railway sandbox.

## Discipline gates passed

- ✅ `pnpm --filter @axhy/shared-schema typecheck` clean
- ✅ `pnpm --filter @axhy/backend typecheck` clean
- ✅ `pnpm eslint` clean on every new file (`axhy/require-derives` rule passes)
- ✅ Real-DB integration tests pass on Railway sandbox (`wave-1-replacement-invite-routes.test.ts` 74s)
- ✅ Cross-tenant isolation enforced + tested on every route
- ✅ Zero new `any`, zero TODO, zero "coming soon", zero abbreviated names
- ✅ All Zod parsed at route boundary + defensively re-parsed in service

## Spec coverage matrix

| Plan §3 Wave 1 requirement                                                              | Status                                                                                                                              | Evidence                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma model `ReplacementInvite` per master plan §P.4                                   | DONE                                                                                                                                | schema.prisma model + 4 indexes + 3 CHECK constraints                                                                                                                     |
| Migration `20260522_010_replacement_invite`                                             | DONE                                                                                                                                | applied to Railway sandbox                                                                                                                                                |
| Routes: POST send, POST accept, POST decline, GET list, POST cancel                     | DONE                                                                                                                                | 5 routes registered                                                                                                                                                       |
| Race-safe accept                                                                        | DONE — single-row conditional UPDATE is the only safety needed for 1:1 contract (`feedback_replacement_invite_single_recipient.md`) |
| Cron expiry sweep every 30s                                                             | DONE                                                                                                                                | `maybeRunReplacementInviteExpirySweep` wired into dispatcher tick                                                                                                         |
| AuditEvent emissions: SENT / ACCEPTED / DECLINED / CANCELLED / OUTCOME_DECISION_EMITTED | DONE                                                                                                                                | recordAuditEvent calls in service layer                                                                                                                                   |
| Cross-tenant isolation tested                                                           | DONE                                                                                                                                | test asserts Tenant B sup cannot list/cancel Tenant A's invite; Tenant B worker cannot accept                                                                             |
| Outcome SupervisorDecision row when group resolves with no winner                       | DONE                                                                                                                                | per-invite outcome via `emitInviteOutcomeDecision` with idempotent skip-if-exists                                                                                         |
| OneSignal push fanout                                                                   | DONE                                                                                                                                | Notification rows created at send / accept / decline / cancel / sweep; existing dispatcher fans to OneSignal                                                              |
| Standalone state machine in `@axhy/state-machines`                                      | N/A — DEFERRED-INLINE                                                                                                               | Wave 3 set the precedent of service-layer state transitions instead of a standalone state-machine file; followed that pattern. Conditional UPDATEs enforce the lifecycle. |
| Atomic per-row sweep (audit + decision + notification together)                         | DONE                                                                                                                                | Cluster D fix in this commit — `$transaction` per row, 10s timeout, 100-row batch                                                                                         |
| UTC time-zone math throughout dayMask / shift-hours computation                         | DONE                                                                                                                                | Cluster D single-symptom fix — `getUTCDay()` + `Date.UTC()`                                                                                                               |

## Single-recipient simplification confidence

| Design choice                                              | Confidence | Basis                                                                                                                                                                                             |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-recipient invite (1:1, not broadcast)               | 99%        | Founder lock 2026-05-18 (`feedback_replacement_invite_single_recipient.md`). Matches real Hyderabad supervisor behaviour (chaos calendar #39–46: supervisor calls Lakshmi → waits → calls Saira). |
| 2-minute TTL default + 30s–30min range                     | 95%        | Master plan §G:976 + R6 prototype; range guards against test-mode accidents.                                                                                                                      |
| Auto-create ACTIVE Assignment on accept (8h default shift) | 80%        | Sensible default; supervisor refines via existing assignment view if needed. Backlog: derive from portfolio config.                                                                               |
| Per-row tx in sweep (Cluster D fix)                        | 95%        | Mirrors `binding-expire-sweep` gold-standard pattern; verified atomic via test.                                                                                                                   |
| UTC throughout shift / dayMask computation                 | 98%        | Standard practice for scheduled work that crosses time-zones; eliminates the mixed-TZ bug-magnet flagged by review.                                                                               |

## Open panel questions (for Sprint 2 integration)

1. **Wave 2 Decisions plug-in** — Sprint 2 mobile wires `additionalDecisionSources` for `ReplacementInvite` so the outcome card surfaces in the supervisor's Decisions queue. Backend contract is ready.
2. **Worker mobile receiving end** — Phase D. Invites currently land as Notification rows; the worker mobile app needs to consume them + provide the accept/decline UI.
3. **8h default shift on auto-Assignment** — backlog refinement; derive from portfolio config or worker's existing assignment template.
4. **Large-batch alert threshold** — 500-row threshold calibrated from `binding-expire-sweep`; revisit after first production usage.

## Sprint 1 backend status

✅ Wave 1 — ReplacementInvite (this memo, final single-recipient shape)
✅ Wave 2 — Decisions UNION ALL (`docs/done-memos/2026-05-18-wave-2-decisions-union-all-backend.md`)
✅ Wave 3 — Chat intent classifier + Complaint threading (`docs/done-memos/2026-05-18-wave-3-chat-intent-classifier-and-complaints-backend.md`)
✅ Sprint 1 deep review + root-level fix (this commit): `docs/findings/2026-05-18-sprint-1-deep-review.md`

Sprint 1 is **CLOSED**. Sprint 2 mobile waves unblocked, pending founder review of the deep-review-driven fix-PR.

## Rollback notes

For Wave 1's full undo:

```bash
prisma migrate resolve --rolled-back 20260523_011_replacement_invite_drop_group
prisma migrate resolve --rolled-back 20260522_010_replacement_invite
psql $DATABASE_URL -c 'DROP TABLE "axhy"."ReplacementInvite";'
```

No data loss for any other table — purely additive.
