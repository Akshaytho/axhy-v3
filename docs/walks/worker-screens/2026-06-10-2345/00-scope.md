# 00 — Scope

| Field                | Value                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Feature              | worker-screens (full worker persona surface: onboarding → home → capture → visit detail → history → profile → leave-request) |
| Walk started         | 2026-06-10 23:45 IST                                                                                                         |
| Walk closed          | (open)                                                                                                                       |
| State                | IN_PROGRESS                                                                                                                  |
| Walker               | session (founder-ordered: "now take worker screens and with it")                                                             |
| Git commit walked    | `02eae2f` (pushed to origin/chore/handoff-late-2026-05-31)                                                                   |
| App version (mobile) | dev build from 02eae2f (no release APK yet)                                                                                  |
| Backend deploy       | prod at backend-production-344e1.up.railway.app (version 0.0.1 per /health)                                                  |
| Environment          | Android emulator + PROD backend/DB/Redis (per standing rules)                                                                |
| Previous walk        | NONE (first walk of this feature)                                                                                            |
| Brain status         | not-ingested                                                                                                                 |

## PRE-WALK GATE results (founder rule 2026-06-10)

| Check                | Result                                                                           | At (IST)             |
| -------------------- | -------------------------------------------------------------------------------- | -------------------- |
| Working tree clean   | ✅ `git status` empty                                                            | 2026-06-10 23:42 IST |
| All commits pushed   | ✅ `a7b961b..02eae2f` → origin; `git log @{u}..HEAD` = 0                         | 2026-06-10 23:42 IST |
| Backend /health      | ✅ HTTP 200 in 1.15s                                                             | 2026-06-10 23:37 IST |
| Postgres             | ✅ `ok`                                                                          | 2026-06-10 23:37 IST |
| Redis                | ✅ `ok`                                                                          | 2026-06-10 23:37 IST |
| Real login proof     | ⏳ pending — runs as the first step of the live emulator walk (OTP bypass phone) |
| R2 (feature uses it) | ⏳ pending — proven implicitly by first photo upload in live walk                |

Gate note: push was initially BLOCKED (invalid GitHub token, 23:35 IST) — founder re-authenticated, push landed 23:42 IST. The gate caught real unpushed work on its first use.

## State change log

- 2026-06-10 23:45 IST — IN_PROGRESS (walk started; code-traced phase)

## Step 0 — Open loopholes from LOOPHOLES.md this walk MUST check

| Loophole                                                                                                    | Checked in this walk? | Where |
| ----------------------------------------------------------------------------------------------------------- | --------------------- | ----- |
| (none OPEN — LH-1…LH-5 all FOLDED into the protocol; their rules are enforced by the walk steps themselves) | —                     | —     |
