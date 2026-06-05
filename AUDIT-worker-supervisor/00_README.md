# Worker + Supervisor Implementation Audit

**Date:** 2026-06-04 · **Method:** fresh end-to-end code reads (16 vertical slices) + adversarial bug verification · **Why:** verify the real implementation before rewriting the HR docs onto the same foundation.

This audit read the **actual code** — UI → mobile `lib/api*.ts` → backend route → service → state machine → Prisma DB → outbox → dispatcher — slice by slice, **not** from memory, docs, or prior summaries. Every bug was handed to a second skeptic agent that tried to refute it. Of 99 verdicts: **63 confirmed, 35 refuted, 1 uncertain** (the skeptic killed ~35% as false positives — which is the point).

## Read in this order

| #   | Doc                         | What it gives you                                                                      |
| --- | --------------------------- | -------------------------------------------------------------------------------------- |
| 00  | **README** (this)           | what's here + how it was made                                                          |
| 01  | `01_HOW_IT_REALLY_WORKS.md` | the mental-world map: how each flow actually works in code, per slice, with file:line  |
| 02  | `02_BUG_LEDGER.md`          | every candidate bug (109), severity-sorted, each with where/what/fix + skeptic verdict |
| 03  | `03_DONE_vs_STUBBED.md`     | honest built-vs-stub inventory per slice                                               |
| 04  | `04_DOC_vs_CODE_DRIFT.md`   | every place a doc claims something the code doesn't do (the dangerous list)            |
| 05  | `05_VERDICT.md`             | **the answer: is the HR foundation safe to build on, and what to fix first**           |

## Coverage

16 slices, all read fresh:

- **Worker:** W1 auth/identity · W2 Today · W3 capture · W4 history/profile · W5 leave/notifications
- **Supervisor:** S1 Today · S2 Decisions · S3 Chat/AI/living-doc · S4 Activity · S5 coverage/people-ops · S6 Updates · S7 Summary/Memory
- **Cross-cutting:** X1 connections/plumbing · X2 DB + state machines · X3 doc-vs-reality

## Honesty notes (so you can trust this)

1. **The bug verdict→bug join is best-effort.** The read agents reused ids like "BUG-1" across slices, so the per-bug `[CONFIRMED]/[REFUTED]` tag in `02` is an approximate title match. The bugs themselves cite exact file:line and the important ones (P0/P1) were spot-confirmed by hand. **Open the cited file before fixing** — standard practice anyway.
2. **The audit was cut off near the end.** The verification workflow over-ran (a too-wide fan-out), so it was stopped after 15–16 reads + 99 verdicts. The 2 completeness critics didn't run; that sweep was done by hand in `05_VERDICT.md`. ~10 of the 109 candidate bugs weren't skeptic-verified before the cut — they're marked `[unmatched]`.
3. **This is a point-in-time read** of the working tree on 2026-06-04 (branch `chore/handoff-late-2026-05-31`, with uncommitted changes in `worker-history.ts`, `server.ts`, admin-web, and the new `HR-portal-final/`).
