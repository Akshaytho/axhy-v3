# Walks — Lens 2 feature walks, structured and comparable

**Created:** 2026-06-10 16:55 IST · **Owner:** founder · **Method:** `docs/protocols/dual-lens-review.md`

This folder is the single home for every Lens 2 feature walk. The rules below are STRUCTURE, not behavior — they hold even when sessions change, because the files enforce them.

---

## Timestamp rule (read first — founder-mandated)

Every folder, file header, bug entry, loophole entry, and status change carries a **date AND time** in ONE fixed format:

```
YYYY-MM-DD HH:MM IST
```

Never date-only where an event happened at a moment. Never any other timezone. This is so neither the founder nor the brain can ever confuse which walk, which fix, or which finding came first.

---

## Folder structure

```
docs/walks/
  README.md                 ← this file: rules + the scoreboard below
  LOOPHOLES.md              ← always-editable AI-blind-spot log (see its header rules)
  _TEMPLATE/                ← copy this folder to start ANY walk; never edit _TEMPLATE during a walk
  <feature-slug>/           ← one folder per FEATURE  (e.g. capture-to-submission/)
    MAP.md                  ← LIVING feature map: footprint, routes, services, tables, data flow
    2026-06-12-0930/        ← one folder per WALK, named by start date+time (IST, 24h)
      00-scope.md … 07-compare-to-previous.md
    2026-06-19-1400/        ← the next walk of the same feature, days later
```

- **Feature slug:** kebab-case, stable across walks (`capture-to-submission`, `leave-request`, `complaint-thread`).
- **Walk folder name:** `YYYY-MM-DD-HHMM` = the moment the walk STARTED. Two walks can never collide or be confused.
- A walk folder is edited **only during that walk**. After the walk closes it is frozen history. Exactly TWO living (always-editable) file kinds exist here: `LOOPHOLES.md` and each feature's `MAP.md`.
- **SINGLE-HOME RULE (founder-mandated, 2026-06-10):** `docs/walks/` is the ONLY place walk artifacts may exist. No session may create walk files, walk notes, or walk folders anywhere else in the repo — not in docs/findings/, not next to code, nowhere. If it belongs to a walk, it lives here.
- **MAP.md (living feature map):** copied from `_TEMPLATE/MAP.md` at a feature's first walk. Holds the feature's footprint (files), API surface, services, DB tables/models, data flow, personas, connected features, and known sharp edges — so the NEXT walk reads this one small file instead of re-reading the whole codebase. Each walk's Step 1 starts from MAP.md, diffs it against current code, updates it (timestamped change log), and freezes a snapshot into that walk's `01-map.md`.

## Walk lifecycle (states live in 00-scope.md, each with a timestamp)

```
IN_PROGRESS → BUGS_OPEN → ROOTS_FIXED → REWALK_PASSED → INGESTED → (later) SUPERSEDED
```

0. **PRE-WALK GATE (founder-mandated 2026-06-10 23:30 IST — a walk may NOT start until BOTH pass, results recorded with timestamps in 00-scope.md):**
   - **Everything pushed:** working tree clean, all commits pushed to the branch's upstream (`git status` clean + `git log @{u}..HEAD` empty). Main merges remain founder-owned per v3 rules — the gate requires branch-upstream push, never a main merge. Why: the walked-commit anchor must be a real, shared commit, or staleness checks and comparisons mean nothing.
   - **Everything connected is alive:** prod backend `GET /health` returns 200 with `postgres: ok` AND `redis: ok` (server.ts returns 503 with the failing dependency otherwise); then one real login (OTP bypass phone) proves the auth path end-to-end. R2/external services verified if the feature under walk uses them. Walking on a half-dead stack produces fake bugs and wasted hours.
1. **Start:** copy `_TEMPLATE/` → `<feature>/<YYYY-MM-DD-HHMM>/`. Fill `00-scope.md` (commit hash, app/backend versions, walker, start time). **Step 0: read `LOOPHOLES.md` and list every OPEN loophole in 00-scope.md as mandatory checks for this walk.**
2. **Walk** per the protocol: map (01) → screen-by-screen log with 4-layer DB proof (02) → bugs collected, never fixed mid-walk (03).
3. **Fix:** RCA clusters + batch root fixes (04). Then **re-walk the same path** and prove it (05). Verdict per persona (06). If a previous walk exists, complete the comparison (07).
4. **Ingest into brain:** only when state = REWALK_PASSED. The brain entry points at this walk folder.
5. **Supersede:** when a NEWER walk of the same feature reaches REWALK_PASSED and its 07-compare confirms it beats the old one → **delete the OLD walk from the brain entirely** and ingest the new one. The brain holds exactly ONE walk per feature — the latest passing one — never stale memories. The old FOLDER stays in git as frozen history (so future comparisons and audits remain possible); only its brain copy is removed.
6. **Scoreboard:** update the table below + its timestamp at every state change.

## Staleness & re-walk triggers — "how do we know when to scan again?"

A walk is **FRESH** only while no commit since its walked-commit (recorded in `00-scope.md`) touches the feature's footprint (section 1 of its `MAP.md`). The check is mechanical, never a guess:

```
git diff --name-only <walked-commit>..HEAD   ∩   MAP.md footprint paths
  → empty   = walk still FRESH
  → non-empty = walk is STALE → mark scoreboard, re-walk needed
```

Re-walk/scan triggers (any one is enough):

1. **STALE** — commits touched the footprint (the rule above). This includes the founder's case: "a feature in worker screens is being changed → the walk system knows this feature has a walk → new changes hit its footprint → re-walk."
2. **NEW FEATURE** — Step 1b inventory finds screens/routes that belong to NO feature's MAP.md footprint → create `<feature>/MAP.md` + first walk.
3. **NEW LOOPHOLE** — an OPEN entry in LOOPHOLES.md applies to the feature → checked at the next walk regardless of staleness.

Rollout stages (Stage 1 active now; 2-3 are future work, not yet built):

- **Stage 1 (manual, now):** at session boot or on founder request, run the git-diff-vs-footprint check for each feature with a walk; mark STALE rows in the scoreboard with a timestamp.
- **Stage 2 (script):** a small `walk-staleness-check` script does Stage 1 automatically (runnable in CI / session audit) and updates the scoreboard.
- **Stage 3 (auto-trigger, founder's vision):** the guardrail hook detects mid-session that edited files fall inside a walked feature's footprint and announces "this change makes walk <X> stale — re-walk after landing." Builds on the existing pre-edit-guard infrastructure.

`STALE` is also a lifecycle state: `… → INGESTED → STALE (footprint changed) → (new walk) → SUPERSEDED`.

## Why this structure exists (founder, 2026-06-10)

So that scanning THIS folder — without asking anyone — answers: what has been walked, what bugs exist, what is fixed and proven, how much of the product is genuinely market-ready, and what the AI was missing last time that the next walk must check. Behavior forgets; structure doesn't.

---

## SCOREBOARD — product readiness at a glance

**Last updated: 2026-06-11 01:10 IST**

| Feature                                                                            | Last walk (start time)                                                    | State                                                                                                             | Bugs found                                                                                                                                                                                                               | Roots fixed | Re-walk | In brain | Market-ready verdict |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------- | -------- | -------------------- |
| **worker-screens** (umbrella: onboarding+home+capture+visit+history+profile+leave) | [2026-06-10-2345](worker-screens/2026-06-10-2345/) (2026-06-10 23:45 IST) | IN_PROGRESS (live vs prod: steps 1-6,19-20 + 4 bad-day scenarios DONE; capture 7-17 awaits founder visit-seed OK) | 5 (orphan history; leave→profile broken promise; help→admin-login wall; keep-awake rejection; wrong-OTP silent reset) — PRELIM RCA: 5 bugs → 2 roots (unwired secondary surfaces; over-broad 401 interceptor api.ts:283) | —           | —       | no       | BROKEN (bugs open)   |

| Feature                              | Last walk (start time) | State | Bugs found | Roots fixed | Re-walk | In brain | Market-ready verdict |
| ------------------------------------ | ---------------------- | ----- | ---------- | ----------- | ------- | -------- | -------------------- |
| capture-to-submission                | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| leave-request                        | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| swap-request                         | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| complaint-thread                     | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| supervisor-chat (AI)                 | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| supervisor-decisions                 | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| worker-onboarding (OTP→consent→home) | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| hr-portal (workers/sites/leave)      | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |
| owner-dashboard                      | — none yet —           | —     | —          | —           | —       | no       | NOT WALKED           |

Verdict values: `NOT WALKED` / `BROKEN (bugs open)` / `FIXED-UNPROVEN (no re-walk)` / `READY (re-walk passed <timestamp>)`.
A feature may be called market-ready ONLY from this table, only with state REWALK_PASSED or later.
