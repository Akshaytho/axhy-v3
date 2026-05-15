# Change History (append-only)

> Last ~10 slice transitions. Each entry: timestamp + slice name + from-state → to-state + commit hash.

---

## Recent

| When                 | Slice                          | Transition                     | Commit                          | Note                                                                    |
| -------------------- | ------------------------------ | ------------------------------ | ------------------------------- | ----------------------------------------------------------------------- |
| 2026-05-15 evening   | `handoff-control-loop`         | `PLANNED → WIP`                | _pending_                       | This slice builds owner-input + feature-queue + generator extension.    |
| 2026-05-15 evening   | `dashboard-embed-diagrams`     | `WIP → DONE`                   | `8f11d89`                       | Embedded 32 Mermaid diagrams into the HTML dashboard.                   |
| 2026-05-15 evening   | `dashboard-embed-diagrams`     | `AWAITING_APPROVAL → APPROVED` | `8f11d89`                       | Friend's verification: structural claims real; 2 corrections noted.     |
| 2026-05-15 afternoon | `tracker-3-layer-system`       | `WIP → DONE`                   | `03d33dd`, `e222a22`            | Built execution-state + workflow-maps + generated + folder move.        |
| 2026-05-15 afternoon | `tracker-3-layer-system`       | `AWAITING_APPROVAL → APPROVED` | n/a                             | Friend: "much better and directionally correct".                        |
| 2026-05-15 afternoon | `routing-foundation-read-apis` | `WIP → BLOCKED`                | `84ae39c`                       | Paused mid-flight to build tracker. 4th test + real-DB sweep remaining. |
| 2026-05-15           | `p1.5-future-dated-fix`        | `WIP → APPROVED → DONE`        | `44a453d`                       | Friend caught the endedAt-vs-effectiveUntil bug; fixed + verified.      |
| 2026-05-15           | `p1.5-site-supervisor-binding` | `WIP → APPROVED → DONE`        | `9c0b3d8`, `a8eed8b`, `fe0f6f4` | SiteSupervisorBinding table + helpers + 17 real-DB tests green.         |
| 2026-05-15           | `pr2-audit-emit-helpers`       | `WIP → APPROVED → DONE`        | `f609749`, `ec40813`, `4bb9b2a` | 3 typed audit helpers + 8 real-DB test files (29/29 green).             |
| 2026-05-15           | `pr1-layer-1-schema`           | `WIP → APPROVED → DONE`        | `095c766`, `0dca836`            | Layer 1 core primitives schema (HRPod, Policy, Notification, Digest).   |

---

## How to append

When a slice transitions, prepend a new row to the table above. Keep ~10 rows max; older rows graduate out (or are summarised in `done/`).

Format:

```
| <ISO date or 'YYYY-MM-DD time-of-day'> | `<slice-name>` | `<FROM_STATE> → <TO_STATE>` | `<commit>` | <one-line note> |
```
