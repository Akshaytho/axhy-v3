# 00 — Scope

| Field                | Value                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Feature              | <feature-slug>                                                                                                  |
| Walk started         | YYYY-MM-DD HH:MM IST                                                                                            |
| Walk closed          | YYYY-MM-DD HH:MM IST (fill at close)                                                                            |
| State                | IN_PROGRESS → BUGS_OPEN → ROOTS_FIXED → REWALK_PASSED → INGESTED → SUPERSEDED (move with timestamp each change) |
| Walker               | <session/founder>                                                                                               |
| Git commit walked    | <hash>                                                                                                          |
| App version (mobile) | <version/build>                                                                                                 |
| Backend deploy       | <commit/deploy id>                                                                                              |
| Environment          | Android emulator + PROD backend/DB/Redis (per standing rules)                                                   |
| Previous walk        | <link to prior walk folder, or NONE (first walk)>                                                               |
| Brain status         | not-ingested → ingested YYYY-MM-DD HH:MM IST → superseded YYYY-MM-DD HH:MM IST                                  |

## State change log

- YYYY-MM-DD HH:MM IST — IN_PROGRESS (walk started)

## Step 0 — Open loopholes from LOOPHOLES.md this walk MUST check

| Loophole | Checked in this walk? | Where (file/section) |
| -------- | --------------------- | -------------------- |
| LH-\_    | yes/no                | 02-walk-log §\_      |
