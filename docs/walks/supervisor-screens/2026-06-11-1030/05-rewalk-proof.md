# 05 — Re-walk proof

**Re-walk started:** 2026-06-12 10:15 IST · **Finished:** 2026-06-12 10:26 IST
**Build under test:** mobile served via local Metro (:8081) = the edited branch source; backend = DEPLOYED prod (OLD code — my backend fixes activate at the founder's next deploy).

Same path, same persona (QA Supervisor Prod, role SUPERVISOR), after the C-C + C-E root fixes. A fix is proven HERE (screens + DB rows + screenshots), never by the diff looking right.

## Split: what is provable live now vs. deploy-gated

- **Mobile changes** (C-C reverse routing + HR-sheet reason copy; C-E FlaggedReviewSheet/Drawer copy) → served by local Metro → provable live now.
- **Backend changes** (softFlagActivity kind-gate; reverse/soft-flag route copy; DWI_EXPIRED humanizer) → run on prod, which has the OLD code → proven instead by the real-DB regression suite (`test/activity-reverse-regression.test.ts` 1/1 green against DATABASE_PUBLIC_URL incl. the non-reversible-in-window→200 case + the reversible-in-window→422 no-regression case). They activate on deploy.

| Bug #                              | Re-walk result                                                                                                                                                                                                                                                                                                             | Proof                                                           | Screenshot                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| 6/7 (C-C) reverse drawer button    | Reverse is now ALWAYS active — no time-greying, no "Window closed · soft-flag for HR" subtext; a11y label is "Reverse this action" (not "…window closed"). The timezone-naive client math is deleted.                                                                                                                      | client no longer computes the window — server is sole authority | evidence/rewalk-2026-06-12/01-reverse-button-always-active.png   |
| 6/7 (C-C) non-reversible kind path | Tapping Reverse on a non-reversible kind (CHAT_MESSAGE_CREATED) opens the HR sheet reading **"HR REVIEW"** + **"This kind of action can't be undone directly. HR will see this in their queue and decide what to do."** Pre-fix this same tap LIED "WINDOW CLOSED · HR REVIEW / The 30-minute reversal window has closed." | reason='needs-hr'; routing keyed on kind only                   | evidence/rewalk-2026-06-12/02-non-reversible-honest-hr-sheet.png |
| O2 (C-E) Drawer "How to use Axhy"  | Sub now reads **"Quick guide"** (was the phantom "60-sec video · examples"; the /help page has no video).                                                                                                                                                                                                                  | —                                                               | evidence/rewalk-2026-06-12/03-drawer-quick-guide.png             |

## Live-verification deferred (honest gaps)

| Bug #                                                                                   | Why not live this session                                                                                                                                         | State                                                                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 3/4/5 (C-E) FlaggedReviewSheet copy (photo hint, "notifies HR"→audit-trail, en-IN date) | No flagged visit in current QA data (QA Launch Site is NO ROSTER, 0 of 0; the worker-walk flagged visit was already rejected). Cannot open the sheet without one. | Code-complete + tsc-clean; strings are deterministic. Live-screenshot when a flagged visit next exists. |
| 6/7 reversible-kind in-window → ReverseConfirmModal; WINDOW_CLOSED→HR auto-handoff      | No recent reversible-kind row in QA data; the QA worker has no roster so a fresh WORKER_MARKED_ABSENT can't be created (bug #10).                                 | Same code path as the proven non-reversible routing + the verified ApiError.code WINDOW_CLOSED branch.  |
| 5 (C-E) DWI_EXPIRED "Dwi expired."→human copy                                           | Backend (prod-gated) + no DWI_EXPIRED row this week.                                                                                                              | Proven by code; activates on deploy.                                                                    |

## Regression sweep

Did the root fixes break anything that PASSED before? Steps re-checked:

| Step                                                                                                                                    | Still PASS?                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Activity feed loads (Today=0 events, This week=11 events) with real prod rows                                                           | YES — evidence 05/06/07                                                    |
| Reverse drawer "Share to WhatsApp" button                                                                                               | YES — still present + active alongside Reverse                             |
| Backend reverse/soft-flag full lifecycle (reverse, idempotency, cross-tenant, NOT_OWN, KIND_NOT_REVERSIBLE, WINDOW_CLOSED, WINDOW_OPEN) | YES — `activity-reverse-regression.test.ts` 1/1 incl. all prior assertions |
| Both apps typecheck                                                                                                                     | YES — `tsc --noEmit` EXIT 0 (mobile + backend)                             |
