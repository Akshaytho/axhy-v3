# Done memo — C-C + C-E supervisor-walk fixes (2026-06-12)

**Walk:** `docs/walks/supervisor-screens/2026-06-11-1030/` · **Roots closed:** C-C (undo-window authority), C-E (word-truth copy). C-D was already fixed (`b225a50`); C-A2 stays a founder placement decision.

## What changed

### C-C — the server is the sole authority on the 30-min reverse window

The walked BLOCKER (#6/#7): 8 minutes after a reject, REVERSE said "the 30-minute reversal window has closed" while the server disagreed, and the only path the client offered (HR review) was refused — a dead-end loop. Scouting found it was _worse_: a non-reversible kind inside the window had **no path at all** (`/reverse`→422 `KIND_NOT_REVERSIBLE`, `/soft-flag`→422 `WINDOW_OPEN`).

- **Backend** `apps/backend/src/lib/services/activity-reverse-service.ts` — `softFlagActivity` now rejects `WINDOW_OPEN` only when `isReversibleActivityKind(source.kind)`. A non-reversible kind is accepted at any time (HR is its only path). The contradictory doc-comment was replaced with the accurate kind-aware rule.
- **Backend** `apps/backend/src/routes/activity.ts` — de-jargoned copy: reverse `WINDOW_CLOSED` → "The 30-minute undo window has passed. Send it to HR for review instead."; soft-flag `WINDOW_OPEN` → "This can still be undone directly — use Reverse." Route doc-comment corrected to the kind-aware rule.
- **Mobile** `apps/mobile/app/(supervisor)/activity.tsx` — deleted `isWithinReverseWindow` (the timezone-naive `Date.now() - new Date(iso)` math that false-closed the window on IST devices). Reverse routes on KIND only; a reversible kind opens `ReverseConfirmModal` and, on a server `WINDOW_CLOSED`, auto-opens the HR sheet for the same row (via `ApiError.code`); a non-reversible kind opens the HR sheet directly. `SoftFlagConfirmModal` copy is parameterized by `reason` ('window-closed' vs 'needs-hr'). Drawer Reverse button is no longer time-greyed. Two stale doc-comments corrected; dead style keys removed.

**Decision check:** the 2026-05-18 sprint-2 audit (brain `0052c629`) classified the `WINDOW_OPEN` rejection as "intentional — keep the HR queue focused," but its reasoning explicitly assumed "the caller can detect this and call `/reverse` instead." That alternative exists only for reversible kinds. The fix preserves the intentional behavior for reversible kinds and only opens the path the audit never considered (non-reversible kinds, which never had a `/reverse` alternative). No locked decision is contradicted.

### C-E — word-truth pass on the walked supervisor copy

- `apps/mobile/components/today/FlaggedReviewSheet.tsx` — dropped the dev note "Inline thumbnails ship with the photo CDN slice." → "{n} photos captured / Not shown in the app yet — judge from the AI's reason below."; dropped the unbacked "and notifies HR" → "and records it in the audit trail" (grep-verified: the reject path writes only the `VISIT_REJECTED` audit, no outbox/Notification); `when` date now `toLocaleString('en-IN', …)` (was US `m/d/y`).
- `apps/backend/src/lib/services/audit-summary.ts` — added a `DWI_EXPIRED` case → "A proposed decision expired unanswered after 48 hours." (was the generic humanizer's jargon "Dwi expired."). Shared by both the Activity feed and the Summary timeline.
- `apps/mobile/components/Drawer.tsx` — "How to use Axhy" sub "60-sec video · examples" → "Quick guide" (the `/help` page has no video).

## Verification

- **Real DB (prod):** `apps/backend/test/activity-reverse-regression.test.ts` — TDD: the new non-reversible-in-window case FAILED before the backend fix (422), PASSES after (200); suite **1/1 green** against `DATABASE_PUBLIC_URL`, including the §8 reversible-in-window→`WINDOW_OPEN` no-regression assertion and the full reverse/soft-flag/auth/cross-tenant/idempotency lifecycle.
- **Typecheck:** `tsc --noEmit` EXIT 0 for both `apps/mobile` and `apps/backend`.
- **Live emulator re-walk** (2026-06-12, `eclean_test`, prod backend): `evidence/rewalk-2026-06-12/` — Reverse always-active (01), non-reversible kind → honest "can't be undone directly" HR sheet (02), Drawer "Quick guide" (03).

## Honest boundaries (NOT claimed done)

- **Deploy-gated:** the backend halves (soft-flag kind-gate, route copy, DWI humanizer) run on the deployed prod backend, which still has the old code. They are proven by the real-DB regression suite and activate at the founder's next backend deploy from this branch. (The mobile fix alone already kills the walked BLOCKER for the in-window case, because that bug was purely client-side.)
- **Live-verification deferred (data boundary, not a defect):** FlaggedReviewSheet copy (B3/B4/B5) — no flagged visit exists in current QA data (QA Launch Site is NO ROSTER, 0 of 0; the worker-walk flagged visit was already rejected); and the reversible-kind in-window `ReverseConfirmModal` + `WINDOW_CLOSED`→HR handoff path — the QA worker has no roster so a fresh `WORKER_MARKED_ABSENT` can't be created (bug #10). Both are code-complete + tsc-clean; live-screenshot when the data exists.

## Follow-ups for the founder

1. Deploy the backend from this branch → activates the C-C/C-E backend halves (plus the prior code-complete items in the handoff). Then a quick prod walk confirms the non-reversible-in-window→HR path and the humanized DWI line.
2. C-A2 (orphan `summary` + `updates` supervisor screens) — placement decision, recorded in `06-verdict`.

## Files touched

- `apps/backend/src/lib/services/activity-reverse-service.ts`
- `apps/backend/src/routes/activity.ts`
- `apps/backend/src/lib/services/audit-summary.ts`
- `apps/backend/test/activity-reverse-regression.test.ts`
- `apps/mobile/app/(supervisor)/activity.tsx`
- `apps/mobile/components/today/FlaggedReviewSheet.tsx`
- `apps/mobile/components/Drawer.tsx`
- Walk docs: `04-rca-and-fix.md` (RESOLUTION), `05-rewalk-proof.md`, `evidence/rewalk-2026-06-12/`; handoff `NEXT_SESSION.md`
