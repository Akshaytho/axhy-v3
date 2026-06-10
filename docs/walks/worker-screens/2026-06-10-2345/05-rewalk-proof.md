# 05 — Re-walk proof

**FULL.** C-B re-walk 2026-06-11 01:36-01:39 IST · fix-batch re-walk 2026-06-11 03:26-03:29 IST · emulator vs PROD.

| Step                                  | Previously failed bug # | Re-walk result                                                                                                                                                                                                                                                                                                                                 | DB proof                                         | Screenshot                        |
| ------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------- |
| Wrong OTP (999999)                    | #5                      | **FIXED** — stays on OTP screen, inline "Wrong code. Check the SMS and try again.", resend countdown intact                                                                                                                                                                                                                                    | negative path, no rows                           | evidence/walk_42.png              |
| Correct OTP after wrong attempt       | — regression            | **PASS** — login proceeds to permissions                                                                                                                                                                                                                                                                                                       | RefreshToken family created                      | evidence/walk_44.png              |
| History reachable (You → Past visits) | #1                      | **FIXED** — "MY RECORD → Past visits" row opens the history screen with REAL prod data: 1 Verified / 6 Flagged / 7 Total (30 days), today's flagged visit on top                                                                                                                                                                               | screen matches /worker/history over prod         | evidence/walk_64.png, walk_65.png |
| Profile identity                      | O1/O2                   | **FIXED** — "Akshay / +919381378257" from GET /me (was "Worker / masked")                                                                                                                                                                                                                                                                      | /me returns User.name+phone (routes/me.ts:51)    | evidence/walk_64.png              |
| My leave on profile                   | #2                      | **Route proven in-process vs PROD DB: HTTP 200, 4 items** (Offline test 14 Jun, Temple visit 13 Jun, Family functiony 12 Jun, Uu 9 Jun — exactly the walk's rows). Live profile shows the graceful fallback ("Couldn't load leave right now") until the backend deploys — no crash, honest copy. **Activates at next founder backend deploy.** | in-process buildServer inject + psql cross-check | evidence/walk_64.png              |
| Help page                             | #3                      | Code-complete: /help page builds (admin-web tsc 0), content uses only verified-real channels. **Activates at next admin-web deploy** — drawer URL then resolves instead of redirecting to /login                                                                                                                                               | curl baseline recorded pre-fix                   | —                                 |
| Keep-awake hygiene                    | #4                      | PhasePhotoCapture guarded like timer.tsx; vitest 109/109; no toast during the entire capture phase                                                                                                                                                                                                                                             | —                                                | —                                 |

Unit/typecheck gauntlet: backend tsc 0 · mobile tsc 0 · admin-web tsc 0 · mobile vitest **109/109** (incl. all api 401/refresh contracts).

## Regression sweep

| Step                                      | Still PASS?                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| Login (correct code)                      | ✅ walk_44 + fix-batch session login                      |
| Home with visit card                      | ✅ walk_63 (NEEDS ATTENTION intact)                       |
| Profile TODAY/Sync/Support cards          | ✅ walk_64 (all present alongside the new MY RECORD card) |
| Full capture loop (pre-fix run)           | ✅ steps 7-17 proofs in 02-walk-log                       |
| api.test.ts refresh-interceptor contracts | ✅ 11/11 within the 109                                   |

**Deploy dependencies (founder):** next backend deploy activates GET /worker/leave-requests (profile "My leave" goes live); next admin-web deploy activates /help. Both code-complete and verified on the branch.

**Evidence:** 23 screenshots in `evidence/` (durable).
