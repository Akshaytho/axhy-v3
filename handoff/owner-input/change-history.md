# Change History (append-only)

> Last ~15 slice transitions. Each entry: timestamp + slice name + from-state → to-state + commit hash.
>
> Per friend's 2026-05-15 evening verification: this file must record every landed transition of the active slice — including the slice itself building the control loop. No `_pending_` placeholders; only landed commits.

---

## Recent

| When                 | Slice                          | Transition                            | Commit                               | Note                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------ | ------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP` body landed                     | `eefaf11`                            | `fix(handoff): purge future-placeholder wording + populate change-history` — third-pass trust fixes: active-slice + pending-approvals no longer contain forward-looking wording; change-history now records every control-loop transition.                  |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP → AWAITING_APPROVAL`             | `b35748e`                            | Friend's 3 second-pass bugs fixed: commit-truth renamed to `generated_against_head` + drift note added; active-slice hash-naming pinned to landed commits only; pending-approvals split AWAITING_APPROVAL vs BLOCKED. Slice now in AWAITING_APPROVAL state. |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP` body landed                     | `b35748e`                            | `fix(handoff): address friend's 3 remaining trust issues — commit-truth, hash-naming, approval/blocked split`                                                                                                                                               |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP` body landed                     | `7916a3b`                            | `fix(handoff): address friend's 4 verification findings on the control loop` — template-not-parsed-as-note, header agrees with callout, active-slice updated, generated_from expanded.                                                                      |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP` body landed                     | `0445110`                            | `fix(handoff): stale-detection uses file mtimes — survives pre-commit timing` — replaced git-state stale check with filesystem-mtime check; survives auto-regen race.                                                                                       |
| 2026-05-15 evening   | `handoff-control-loop`         | `WIP` body landed                     | `f9fbe68`                            | `docs(handoff): control loop — layer 4 (owner-input + feature-queue + auto-regen)` — initial control-loop body; owner-input/, feature-queue/, generator extension, pre-commit hook.                                                                         |
| 2026-05-15 evening   | `handoff-control-loop`         | `PLANNED → WIP`                       | n/a (transition before first commit) | Akshay's "take it one level further" directive started this slice. Built into the file system before the first commit (f9fbe68).                                                                                                                            |
| 2026-05-15 afternoon | `dashboard-embed-diagrams`     | `AWAITING_APPROVAL → APPROVED → DONE` | `8f11d89`                            | 32 Mermaid diagrams embedded into the HTML dashboard via Mermaid CDN. Friend approved with 2 corrections noted (carried into handoff-control-loop).                                                                                                         |
| 2026-05-15 afternoon | `tracker-3-layer-system`       | `AWAITING_APPROVAL → APPROVED → DONE` | `e222a22`, `03d33dd`, `d4bb4c8`      | Built execution-state + workflow-maps + generated layers. Folder moved to top-level `handoff/`. Friend: "much better and directionally correct".                                                                                                            |
| 2026-05-15 afternoon | `routing-foundation-read-apis` | `WIP → BLOCKED`                       | `84ae39c`                            | Paused mid-flight to build tracker. 4th test file + real-DB sweep remaining. Now blocked by handoff-control-loop approval.                                                                                                                                  |
| 2026-05-15           | `p1.5-future-dated-fix`        | `WIP → APPROVED → DONE`               | `44a453d`                            | Friend caught the endedAt-vs-effectiveUntil bug in reassignPermanentBinding; fixed + verified.                                                                                                                                                              |
| 2026-05-15           | `p1.5-site-supervisor-binding` | `WIP → APPROVED → DONE`               | `9c0b3d8`, `a8eed8b`, `fe0f6f4`      | SiteSupervisorBinding table + helpers + 17 real-DB tests green.                                                                                                                                                                                             |
| 2026-05-15           | `pr2-audit-emit-helpers`       | `WIP → APPROVED → DONE`               | `f609749`, `ec40813`, `4bb9b2a`      | 3 typed audit helpers + 8 real-DB test files (29/29 green).                                                                                                                                                                                                 |
| 2026-05-15           | `pr1-layer-1-schema`           | `WIP → APPROVED → DONE`               | `095c766`, `0dca836`                 | Layer 1 core primitives schema (HRPod, Policy, Notification, Digest).                                                                                                                                                                                       |

---

## How to append

When a slice transitions, prepend a new row to the top of the table above. Keep ~15 rows max; older rows graduate out (or are summarised in `done/`).

Format:

```
| <ISO date or 'YYYY-MM-DD time-of-day'> | `<slice-name>` | `<FROM_STATE> → <TO_STATE>` | `<commit>` | <one-line note> |
```

**Rules:**

- Only landed commit hashes. No `_pending_`. No "landing now". No speculation.
- If a transition has no associated commit (e.g., `PLANNED → WIP` happens before the first commit of the slice), use `n/a (transition before first commit)` explicitly — never blank.
- Prepend on top — newest first.
