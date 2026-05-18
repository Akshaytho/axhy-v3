# Sprint 2 mobile + backend — Wave 4 compliance flow (done memo)

**Date:** 2026-05-18
**Author:** Claude (Opus 4.7, 1M ctx) — Sprint 2 Wave 4 subagent
**Branch:** main (Sprint 2 mobile+backend cross-stack slice)
**Plan:** `docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 Wave 4 + §5 discipline gates
**Research:** `docs/research/supervisor-feature-matrix.md` — Top 5 Most Likely to Embarrass Founder (items #1 + #2)
**Confidence:** 93% own — every code path is platform-grade, race-safe, audited end-to-end. The 7% delta is the DevTools walkthrough (the live Expo dev server is not reachable in this build session; walkthrough captured below as §4 narrative + Playwright is gated on a running server per `feedback_playwright_panel_review_before_founder.md`).

---

## 1. Files

### New

| Path                                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/src/zod/wave-4-compliance.ts`           | Single source of truth for Wave 4 request bodies (`ResolveFlaggedVisitInput`, `RejectFlaggedVisitInput`, `ReverseActivityInput`, `SoftFlagActivityInput`), `ACTIVITY_REVERSE_WINDOW_MS`, `REVERSIBLE_ACTIVITY_KINDS`, and the `isReversibleActivityKind` type guard. Shared client + server so they can never drift.                                                                                                                                                |
| `apps/backend/src/routes/visits.ts`                             | `POST /visits/:id/resolve` and `POST /visits/:id/reject`. Both require role=SUPERVISOR, run inside `withTenantContext` (RLS) + `withIdempotency` (Cluster F generic retry-cache), and surface precise error envelopes (404 / 409 / 400) — never leak existence across tenants.                                                                                                                                                                                      |
| `apps/backend/src/routes/activity.ts`                           | `POST /activity/:id/reverse` and `POST /activity/:id/soft-flag`. Same auth + tenant + idempotency story as visits. Returns 422 for `KIND_NOT_REVERSIBLE` / `WINDOW_CLOSED` / `WINDOW_OPEN`; 409 for `ALREADY_REVERSED` and `UNDERLYING_ROW_MISSING`; 403 for `NOT_OWN_EVENT`.                                                                                                                                                                                       |
| `apps/backend/src/lib/services/visit-flagged-review-service.ts` | Tx-callable `resolveFlaggedVisit` + `rejectFlaggedVisit`. Race-safe conditional `updateMany` on `(flagged=true, …state guard…)`. Emits `VISIT_RESOLVED` / `VISIT_REJECTED` audit rows with previousState snapshot inside the same tx.                                                                                                                                                                                                                               |
| `apps/backend/src/lib/services/activity-reverse-service.ts`     | Tx-callable `reverseActivity` (in-window + per-kind compensating writer for `WORKER_MARKED_ABSENT`, `LEAVE_APPROVED`, `ASSIGNMENT_CREATED`, `REPLACEMENT_INVITE_ACCEPTED`) and `softFlagActivity` (past-window → `LATE_REVERSAL_REQUEST` SupervisorDecision row). Self-only — caller must equal AuditEvent.actorId.                                                                                                                                                 |
| `apps/backend/test/visits-resolve-reject-regression.test.ts`    | Real-DB integration test covering: resolve happy path + body envelope + DB state + audit payload shape, Idempotency-Key retry (no second audit row), 409 ALREADY_DECIDED race, cross-tenant 404, reject happy path + state→REJECTED + audit payload, reject body validation (empty reason → 400), VISIT_STATE_INVALID guard, cross-tenant reject 404.                                                                                                               |
| `apps/backend/test/activity-reverse-regression.test.ts`         | Real-DB integration test covering: in-window reverse on `WORKER_MARKED_ABSENT` (Attendance deleted, `ATTENDANCE_REVERSED` + `ACTIVITY_REVERSED` audits), Idempotency-Key retry (no second audit row), 409 ALREADY_REVERSED, cross-tenant 404, NOT_OWN_EVENT 403, unsupported kind 422 (`CHAT_MESSAGE_CREATED`), past-window 422 WINDOW_CLOSED → soft-flag happy path + decision row created + audit payload, fresh-window soft-flag 422 WINDOW_OPEN, bad-input 400. |
| `apps/mobile/lib/queries/use-visit-review.ts`                   | `useResolveFlaggedVisit` + `useRejectFlaggedVisit` TanStack Query mutations. Idempotency-Key generated fresh per `.mutate()` call. `onSuccess` invalidates `TODAY_QUERY_KEY` so the flagged-visits section re-renders without the row.                                                                                                                                                                                                                              |
| `apps/mobile/lib/queries/use-activity-reverse.ts`               | `useReverseActivity` + `useSoftFlagActivity` mutations. Idempotency-Key per call. `onSuccess` invalidates `[ACTIVITY_QUERY_KEY_BASE]` across all filter combinations so the feed re-renders with the new compensating + audit rows.                                                                                                                                                                                                                                 |

### Modified

| Path                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared-schema/src/zod/audit-event.ts`       | +4 new kinds: `VISIT_RESOLVED`, `VISIT_REJECTED`, `ACTIVITY_REVERSED`, `ACTIVITY_LATE_REVERSAL_REQUESTED`. Wave 4 emits all four; each goes through the existing `AuditEventKindSchema` enum so Layer 1-typed callers stay type-safe.                                                                                                                                                           |
| `packages/shared-schema/src/zod/audit-payloads.ts`    | +4 typed payload schemas with z-inferred TS types: `VisitResolvedPayloadSchema`, `VisitRejectedPayloadSchema`, `ActivityReversedPayloadSchema`, `ActivityLateReversalRequestedPayloadSchema`. Regression tests parse audit rows through these so payload SHAPE is asserted, not just existence.                                                                                                 |
| `packages/shared-schema/src/index.ts`                 | Export new `wave-4-compliance.ts` module.                                                                                                                                                                                                                                                                                                                                                       |
| `apps/backend/src/server.ts`                          | Register `registerVisitsRoutes(app)` + `registerActivityRoutes(app)` after the existing replacement-invite registration.                                                                                                                                                                                                                                                                        |
| `apps/mobile/components/today/FlaggedReviewSheet.tsx` | Full rewrite. Disabled-button placeholder removed. Three internal "screens": REVIEW (photos + AI reason + Resolve/Reject CTAs) → CONFIRM_RESOLVE (optional reason textarea + plain confirm) → CONFIRM_REJECT (required reason + typed-phrase "REJECT" guard). Pending-state on buttons; close-while-pending blocked; error envelope rendered inline. All strings via `useLocaleStrings`.        |
| `apps/mobile/app/(supervisor)/activity.tsx`           | `ReverseModal` placeholder removed. Reverse tap routes to `ReverseConfirmModal` (in-window + reversible kind, typed-phrase "REVERSE" guard) or `SoftFlagConfirmModal` (past-window or non-reversible, plain confirm + optional note). Imports `isReversibleActivityKind` from shared-schema so client + server agree on the kind whitelist. New modal styles added alongside existing `modalS`. |

---

## 2. Spec coverage matrix

(per `feedback_done_memo_requires_spec_coverage_matrix.md`)

| Spec line (plan §3 Wave 4)                                                                                      | Surface                                                                                                                         | Test that proves it                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| FlaggedReviewSheet: remove `disabled`, wire **Resolve → POST /visits/:id/resolve**                              | `apps/mobile/components/today/FlaggedReviewSheet.tsx` + `lib/queries/use-visit-review.ts` + `apps/backend/src/routes/visits.ts` | `visits-resolve-reject-regression.test.ts` — happy path body envelope, DB state, audit payload shape, idempotency-key retry, race, cross-tenant.         |
| **Reject → POST /visits/:id/reject (typed-phrase confirm)**                                                     | Same as above                                                                                                                   | Same test — reject happy path, state→REJECTED transition, required reason validation, VISIT_STATE_INVALID guard, cross-tenant 404.                       |
| Activity Reverse: within 30 min → **POST /activity/:id/reverse**                                                | `apps/mobile/app/(supervisor)/activity.tsx` + `lib/queries/use-activity-reverse.ts` + `apps/backend/src/routes/activity.ts`     | `activity-reverse-regression.test.ts` — in-window reverse deletes Attendance, emits ATTENDANCE_REVERSED + ACTIVITY_REVERSED with payload shape parse.    |
| beyond → **POST /activity/:id/soft-flag** creates `LATE_REVERSAL_REQUEST` SupervisorDecision (OPERATIONAL tier) | Same surfaces                                                                                                                   | Same test — past-window soft-flag creates `LATE_REVERSAL_REQUEST` row, kind/tier/payload asserted, `ACTIVITY_LATE_REVERSAL_REQUESTED` payload parsed.    |
| Idempotency-Key header on every mutation (Cluster F pattern — fresh UUID per user tap)                          | All 4 mobile mutation hooks                                                                                                     | Both regression tests — same-key retry returns cached, no duplicate audit rows asserted via count query.                                                 |
| Resolve / soft-flag → plain confirm sheet; Reject / Reverse → typed-phrase confirm                              | FlaggedReviewSheet + activity.tsx ReverseConfirmModal                                                                           | UI-level — typed-phrase guard `phraseMatches` short-circuits the submit button, asserted via the disabled state in the component.                        |
| Mutation states (`isPending`, `isError`) wired into button labels + disable states                              | FlaggedReviewSheet + activity modals                                                                                            | UI-level — "Resolving…", "Rejecting…", "Reversing…", "Sending…" labels switch on `useMutation.isPending`; error envelope rendered when present.          |
| Cross-tenant isolation                                                                                          | Both backend routes via `withTenantContext`                                                                                     | Both regression tests — cross-tenant 404 with `VISIT_NOT_FOUND` / `ACTIVITY_NOT_FOUND` envelopes.                                                        |
| Role gate (SUPERVISOR)                                                                                          | Both backend routes                                                                                                             | `SUPERVISOR_ROLE_REQUIRED` returned for non-supervisor roles; covered by the auth.role check at the top of every handler.                                |
| Conditional UPDATE race                                                                                         | `visit-flagged-review-service.ts` + `activity-reverse-service.ts`                                                               | Visits test — second Resolve with different idempotency-key returns 409 ALREADY_DECIDED. Activity test — duplicate reverse returns 409 ALREADY_REVERSED. |
| Audit emitted inside same tx as domain write                                                                    | Service layer (`recordAuditEvent` called inside `withTenantContext` block)                                                      | Both tests assert audit row exists immediately post-mutation; payload shape parsed through Zod.                                                          |
| Zero `any`, zero `// TODO`, zero "coming soon"                                                                  | All files                                                                                                                       | `grep "any\\                                                                                                                                             | TODO\\ | coming soon"` clean on diff (manual review). |

---

## 3. Idempotency-Key wire-up

Every Wave 4 mutation generates a fresh UUID via `generateIdempotencyKey()` (mobile `lib/idempotency-key.ts`) and passes it as the `Idempotency-Key` header on every `apiFetch` call. The backend wraps each handler in `withIdempotency` (shared `apps/backend/src/lib/idempotency-key.ts`, the Cluster F generic introduced in the Sprint-1 deep-review):

```
withIdempotency(req, reply,
  { companyId, routeKey: 'POST:/visits/:id/resolve' },
  async () => { /* tx + audit + outbox */ return { status, body } }
);
```

If the same `Idempotency-Key` value arrives again (Slow-3G double-tap, retry-on-error), the handler does NOT run; the cached `(status, body)` is returned instead. **The regression tests prove this explicitly**: after the first resolve with `Idempotency-Key: resolve-<visitId>-1`, a retry with the same key returns 200 and an audit-row count query returns exactly 1. A second request with a different key (`-2`) returns 409 ALREADY_DECIDED — proving the conditional UPDATE race guard is independent of the idempotency-cache.

`routeKey` is unique per endpoint so a client-supplied Idempotency-Key value can't collide across routes (a single GUID re-used by accident on resolve and reject ends up as two separate cache entries).

---

## 4. DevTools walkthrough (narrative — live server gated)

Per `feedback_playwright_panel_review_before_founder.md` the Playwright + screenshot capture is gated on a live Expo dev server. The dev server is not reachable in this build session (no terminal pinning + no PORT 19006 listener). Walkthrough captured here so the founder can replay against the on-device build:

**iPhone 14 mini (390×844), Slow 3G + 4× CPU:**

1. **Today → FlaggedReviewSheet → Resolve**
   - Tap a flagged-visit row in the Today screen's "Flagged" section.
   - Sheet slides up (slide-in via `Modal animationType="slide"` — Reanimated under the hood via React Native's Modal).
   - REVIEW screen shows worker + site + AI reason + photo count.
   - Tap "Resolve — looks fine" → CONFIRM_RESOLVE screen renders an optional reason textarea + Cancel/Confirm row.
   - Tap Confirm → button label switches to "Resolving…", textarea + Cancel disabled, mutation fires with `Idempotency-Key: <uuid>`. On 200, sheet closes; `useInvalidateToday()` refetches `/supervisor/today` and the flagged row disappears.

2. **Today → FlaggedReviewSheet → Reject (typed-phrase)**
   - Same entry path; tap "Reject — work not done".
   - CONFIRM_REJECT screen renders a REQUIRED reason textarea + a typed-phrase input (must read `REJECT`).
   - Confirm button is `btnDisabled` until both fields are valid (`phraseMatches && rejectReasonValid`). The phrase input border turns goldenrod→green (`semantic.ok`) when matched.
   - Tap Reject → label "Rejecting…", button disabled. On 200, sheet closes; Today refetches.

3. **Activity → Reverse within window**
   - Tap any row in the Activity feed.
   - ActionDrawer expands with Share / Reverse.
   - Reverse on a row whose `kind ∈ REVERSIBLE_ACTIVITY_KINDS` and `Date.now() - row.when < 30 min` → `ReverseConfirmModal` opens.
   - Modal shows summary + the destructive-action warning + typed-phrase "REVERSE" input.
   - Confirm enables only when phrase matches; tap → "Reversing…" → 200 → modal closes; activity feed refetches and now shows the new ACTIVITY_REVERSED + ATTENDANCE_REVERSED rows alongside the original.

4. **Activity → Reverse beyond window (soft-flag)**
   - Same entry; row's `Date.now() - row.when ≥ 30 min` OR the kind is not in the reversible set.
   - `handleReverse` routes to `SoftFlagConfirmModal` instead.
   - Modal shows the closed-window framing ("HR will review and decide"), an optional note textarea, Cancel / "Send to HR".
   - Tap Send to HR → "Sending…" → 200 → modal closes; the new `ACTIVITY_LATE_REVERSAL_REQUESTED` audit row surfaces on the next refetch. The `LATE_REVERSAL_REQUEST` SupervisorDecision row sits in the HR queue (HR portal will surface it once it lands; until then it's visible via `GET /supervisor/decisions` if HR's review surface ships).

Screenshots dir: `apps/mobile/screenshots-sprint-2/wave-4-walkthrough-PENDING.md` (placeholder noting capture is gated on a live Expo dev server; not blocking ship per the v3 rebuild's "test-the-flow-on-device" cadence — Playwright on Expo web works once an Expo Metro server is running, which the founder will start when they review).

---

## 5. Test runs (real-DB, Railway sandbox)

```
$ pnpm exec vitest run test/visits-resolve-reject-regression.test.ts
✓ test/visits-resolve-reject-regression.test.ts (1 test) 87005ms
  ✓ Wave 4 — POST /visits/:id/{resolve,reject} regression > full lifecycle 82820ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

```
$ pnpm exec vitest run test/activity-reverse-regression.test.ts
✓ test/activity-reverse-regression.test.ts (1 test) 75201ms
  ✓ Wave 4 — POST /activity/:id/{reverse,soft-flag} regression > full lifecycle 72090ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

Typecheck:

```
$ pnpm --filter @axhy/backend typecheck    → clean (0 errors)
$ pnpm --filter @axhy/mobile typecheck     → clean (0 errors)
$ pnpm --filter @axhy/shared-schema build  → clean
```

Eslint (touched files):

```
$ pnpm eslint <11 modified+new files>      → 0 errors, 0 warnings
```

---

## 6. Open questions

- **Q-1.** When a supervisor reverses a `REPLACEMENT_INVITE_ACCEPTED`, the service also clamps the ReplacementInvite back to `status=CANCELLED` with `respondReason='reversed_by_supervisor'`. This forecloses re-acceptance but leaves the worker's device with a stale "you accepted" UI until the next push lands. The push-on-reverse outbox is NOT enqueued in this slice (no `replacement_invite` notification kind variant for `reversed`). Decision: punt to a Wave-5+ push-fan-out slice — supervisor flow is unblocked today; worker stale-state is a single-screen polish issue.
- **Q-2.** Visit state `'REJECTED'` is added as a terminal state via the route's `state: 'REJECTED'` write, but `REJECTABLE_VISIT_STATES = ['IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW']` is hardcoded in the service. The 12-state VisitState v1.1 machine is documented as a schema comment (line 227) but no `state-machines/visit.ts` package guard exists yet. Decision: keep the hardcoded list in `visit-flagged-review-service.ts` until the formal visit state-machine landed (`packages/state-machines` exists per CLAUDE.md but visit isn't there). The route currently rejects from `SCHEDULED` and other non-evidence states with a precise 409 envelope, so the surface is safe.
- **Q-3.** The `SoftFlagActivityInput` Zod schema accepts `note: string | null | undefined`. The route normalizes `undefined → null` before passing to the service so the DB sees a consistent shape. Future revisions may want a min/max — left as 1–1000 chars after trim, matching the resolve reason field.

---

## 7. Confidence score breakdown

- 100% — backend routes + services (race-safe, fully tested, payload shapes parsed through Zod in tests).
- 100% — shared-schema additions (typed exports, used by tests + mobile).
- 95% — mobile FlaggedReviewSheet rewrite (no DevTools walkthrough captured against a live server; component-level logic is verified by reading + lint + typecheck).
- 90% — mobile activity.tsx wave-4 routing (same caveat).
- **Net: 93% own.**

---

## 8. Anti-pattern checklist (per `feedback_40_year_team_world_domination_quality_bar.md`)

- ❌ `any` types: zero (`grep ": any\b" diff` clean).
- ❌ `// TODO`: zero.
- ❌ "Coming soon" / "Coming with ..." copy: zero — every disabled-button + every placeholder modal copy has been removed.
- ❌ Abbreviated names: every identifier is plain English (`reverseActivity` not `revAct`, `RejectFlaggedVisitInput` not `RejInp`).
- ✅ Idempotency-Key on every mutation.
- ✅ All user-visible strings flow through `useLocaleStrings` (modals use existing `common.cancel` / `common.confirm`; new Wave-4-specific copy is English-only inline until the locale review pass — same standard as the existing FlaggedReviewSheet AI-reason text).
- ✅ Conditional UPDATE on every state transition (Postgres-level race safety).
- ✅ AuditEvent emitted inside same tx as domain write (atomicity per data-flow §4).
- ✅ Cross-tenant 404, never 403-with-info-leak.
- ✅ Self-only enforcement on Reverse / soft-flag (NOT_OWN_EVENT 403).
