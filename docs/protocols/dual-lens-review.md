# Dual-Lens Review Protocol

**Written:** 2026-06-10, from a direct conversation with the founder.
**Why this exists:** So the founder never has to re-explain how he wants reviews done. Any session can read this doc and run the review his way.
**How to invoke:** The founder says something like _"run a dual-lens review on [feature]"_ or _"do a Lens 2 walk on [feature]"_ or just points at this doc. That is the full instruction — everything else is in here.

---

## The core idea (read this first)

There are two completely different ways to check a product, and BOTH are required. Doing only one gives false confidence.

- **Lens 1 — the Machine Lens:** look at the code the way an engineer does. Is it built well? Is it secure? Will it break under load? This finds broken _code_.
- **Lens 2 — the Human Lens:** live the product the way a real person does. Become the worker, the supervisor, the HR person, the owner — walk every screen of a feature as them, on a bad day, and prove at every step that the system actually did what the screen claims. This finds broken _experiences_ — which broken code reviews never see.

Lens 1 was run in full on 2026-06-10 — method and output are in
[`docs/findings/2026-06-10-full-codebase-deep-review-and-recommendations.md`](../findings/2026-06-10-full-codebase-deep-review-and-recommendations.md).
Lens 2 is the founder's method, defined below. It builds on two standing playbooks that already exist and stay authoritative:

- `axhy-cognitive-system/memory/base/sop_qa_enterprise_walk.md` (four-layer verification, root-cause-first)
- memory: `feedback_qa_strict_production_standard.md` (the 10-section strict QA bar)

---

## LENS 1 — The Machine Lens (engineering review)

What it checks, in order:

1. **Auth & identity** — every route gated; tokens verified against the DB (membership status, role, epoch); refresh rotation + compromise detection; no legacy bypasses.
2. **Tenant isolation** — every query scoped by companyId; GUC/RLS wrappers actually used on the path (read the _service_, not just the route — bare prisma on FORCE-RLS tables is the classic trap found 2026-06-10).
3. **Input validation** — Zod at every boundary; path params validated; no `any`.
4. **Transactions & atomicity** — multi-step writes in one tx; throw-to-rollback, never early-return-commits-partial.
5. **Races & idempotency** — conditional `updateMany` single-winner guards; idempotency keys on anything a mobile client retries; first-writer-wins on async outcomes.
6. **Error handling** — no swallowed errors, no stack traces to clients, no silent no-ops (a function that silently does nothing when env is missing is a bug).
7. **Rate limits & abuse** — per-user Redis limits on hot paths; OTP/auth brute-force caps; AI cost ceilings and budgets.
8. **Background work** — outbox enqueued inside the domain tx; retry/backoff/quarantine; multi-replica claim safety; cascade depth.
9. **Schema** — indexes on hot paths; unique constraints backing idempotency; onDelete behavior vs retention rules; missing columns.
10. **Infra/ops** — health checks wired to the platform; replicas; graceful shutdown; secrets hygiene; backups AND a tested restore; error tracking (Sentry) actually imported in source, not just env vars; CI gates.
11. **Performance** — N+1 loops, unbounded lists, payload sizes on poor networks.

**Evidence rules (non-negotiable, both lenses):**

- Every finding cites a file:line that was personally opened. No claims from summaries.
- Sub-agent outputs are treated as leads, not facts, until verified firsthand (a sub-agent once reported complaints.ts "empty" when it was 455 lines).
- After writing findings, run an adversarial verification pass that tries to REFUTE every citation. Correct the doc, don't defend it (the 2026-06-10 review: 94 citations checked, 2 corrected).
- Report what got BETTER too, not just what's broken (e.g. backups existed when the review claimed they didn't).

---

## LENS 2 — The Human Lens (the founder's method)

> One feature at a time. Become each person who touches it. Walk every screen like real life. Prove every step in the database. Collect bugs without fixing. Then find the common roots and fix THOSE.

### Step 1 — Pick ONE feature and trace its full path

Not "review the app." One feature, end to end. Example: **capture-to-submission** = launcher → QR scan → before photos → clock-in → timer → clock-out → after photos → review → submit → upload queue → AI verification → supervisor sees outcome → worker sees outcome.
Write the path down BEFORE walking it: every screen, every API route, every DB table, every background job it touches. (This is Step 0 of `sop_qa_enterprise_walk.md` — the persona-graph route audit: fetch ALL routes the personas touch in one pass, build the map from code, then diff against expectations. Cross-route contract drift — like the workerId User.id-vs-Worker.id bug fixed in 1edbbfd — is invisible if you audit per-route.)

### Step 1b — Orphan and dead-wiring check (find what is built but NOT connected)

Added 2026-06-10 after the founder asked: _"what if screens are not linked, or code is written but not shown at all?"_ A screen-walk can only find what is reachable — so before walking, hunt for what ISN'T:

Build three lists **from code**, then connect them into one map starting at app-open/login:

1. **All screens** that exist in the app code (for expo-router: every file under `app/` is a screen, whether or not anything links to it).
2. **All navigation actions** — every button/link/router.push and where it points.
3. **All backend routes** and every API call each screen makes.

Then read the gaps out of the map — each gap is a finding, not a footnote:

- **Orphan screen:** exists in code, works fine, but NO button/link anywhere navigates to it → the user can never see it. The founder may believe the feature is live; in reality it doesn't exist for users.
- **Dead route:** backend route no screen ever calls → half-built feature or rotting code (verify it isn't an external/webhook/admin-tool route first).
- **Broken link:** a button navigates to a screen that doesn't exist, or a screen calls an API route that doesn't exist → user-visible error waiting to happen.
- **Ghost UI:** a component/section written but never rendered anywhere, or hidden behind a flag that is never enabled → confirm it's intentional or kill it.

### Step 2 — Map every persona it touches, and when

For each feature list: which of the six roles (WORKER, SUPERVISOR, HR, OWNER, SUPER_ADMIN, and the developer/founder ops view) get involved, at which step, and what each one sees, does, waits for, and feels. A feature is not "worker-only" just because the worker triggers it — submission touches the worker (submits), the AI (verifies), the supervisor (reviews flags), the owner (pays for the AI call), and payroll (the visit is billable).

### Step 3 — Map the connections

How does this feature feed other features? What breaks downstream if this one lies? (Example: if submit writes a wrong state, supervisor Today, history, payroll, and billing are all silently wrong.) Never judge a screen in isolation — one broken shared function means its siblings are broken too, even if nobody noticed yet. **If one thing is broken, actively go check the things that share its data or code.**

### Step 4 — On every screen: everything shown must be REAL

This is a hard rule. For every screen in the path:

- **Every button** must do exactly what it promises. No dead buttons, no buttons that "will work later" while looking live.
- **Every word and number** shown must come from real data and be true. No fake indicators (the codebase already follows this — the camera screen deliberately has no fabricated "GPS LOCKED" badge), no placeholder text shipped as real, no "Sent!" when nothing was sent.
- **Every state** must be handled and honest: loading, empty, error, offline, retry. A spinner that can spin forever is a lie.
- If something is shown, it must be executed or present. If it can't be real yet, it must not be shown.

### Step 5 — Prove every step in the database (four-layer proof)

The screen can lie; the database can't. At every step of the walk, verify all four layers from `sop_qa_enterprise_walk.md`:

1. **UI** — screen shows the right thing.
2. **Route** — API returned the right response.
3. **Primary DB rows** — the tables this step should touch are filled correctly: right values, no missing/null columns that should be set, right state transitions, right timestamps.
4. **Side-effects** — audit row written, outbox row enqueued, queue/cache updated, notification row created.
   A step passes only when all four agree. Per standing rules: real prod backend/DB/Redis, never local mocks (`feedback_real_prod_services_only`), on the Android emulator with real dev tools (`feedback_emulator_only_testing`), with screenshots before any "done" claim (`feedback_visual_verification_before_done`).

### Step 6 — Walk it as real life, BY BECOMING the person

**HARD RULE — no shortcuts while walking.** Start from app open / login and reach every screen ONLY by real taps, exactly as the user would. No deep links, no dev menus, no direct URL jumps, no pre-seeded navigation state. A real worker cannot teleport — if the tester teleports, broken or missing navigation passes silently. (Past QA drove screens via deep-link + uiautomator per `reference_emulator_qa_env_quirks.md` — that proves screens WORK, it never proves a human can REACH them.) If a shortcut is ever _needed_ to get to a screen, that is itself a bug finding: **"screen unreachable by normal navigation."** The only time deep links are allowed in a walk is when the deep link IS the feature being tested (e.g. notification taps) — and then the deep link is tested as a real user would trigger it.

Not "a worker might find this confusing." Become him:

> I am Suresh. It's 5:50 AM, my bus was late, my supervisor already called once, my phone has 8% battery and one bar of signal, and if this submission doesn't go through I'm scared today won't count toward my salary.

Only from inside that head can you feel which step is scary, which wait is unfair, which message is confusing, which tap is too small for wet hands. For each persona ask:

- Can they do it fast, one-handed, tired, semi-literate, in their language?
- What do they FEAR here? (Workers: pay not counting, being accused of faking. Supervisors: missing something and being blamed. Owners: being cheated, wasting money.) Does the screen make the fear better or worse?
- Does it look good enough that they trust it and feel respected by it?
- What happens to their day if this step fails right now?

Walk the bad days, not just the happy path. Minimum scenario set per feature (extend per feature):

- no signal / signal dies mid-step
- app killed mid-flow (battery died, call came in)
- double-tap / retry storm on a slow network
- wrong tap, then trying to go back
- two people acting on the same thing at the same time
- the person doing the step is not the person expected (worker swap, supervisor on leave)
- end-of-month / first-day-of-month boundaries; early-morning IST boundaries (UTC-date bugs live here)
- the angry-client day: everything is urgent, the user is panicking
- the brand-new user who has never seen the screen before

### Step 7 — Collect bugs; do NOT fix as you go

Every bug, every lie on a screen, every missing DB value, every bad feeling goes into a numbered list with evidence (screenshot + DB query result + file:line). Keep walking. Fixing mid-walk hides the pattern.

### Step 8 — Cluster by ROOT CAUSE, then fix the roots

After the full walk, group the bugs: which ones share a function, a line, a wrong assumption, a data contract? **Common bugs have common roots.** Fix the root once and several bugs die together — and the fix is durable. Patch each symptom separately and you get fragile patches that break with the next change. (This is the SOP's "full pass → RCA cluster → batch minimal fix → no refactor" rule. Real example: leave lists, HR scoping, and uploads all failed from ONE identity assumption — workerId being User.id instead of Worker.id — fixed once.)

### Step 9 — Re-walk to prove it

After the batch fix, walk the same path again with the same scenarios. A fix is proven by the re-walk and the DB rows, not by the diff looking right. Screenshots again.

---

## Output structure + walk lifecycle (founder-designed, 2026-06-10 — supersedes the earlier single-doc format)

Every walk lives in its own folder under **`docs/walks/<feature-slug>/<YYYY-MM-DD-HHMM>/`**, created by copying **`docs/walks/_TEMPLATE/`** (8 files: 00-scope, 01-map, 02-walk-log, 03-bugs, 04-rca-and-fix, 05-rewalk-proof, 06-verdict, 07-compare-to-previous). Identical structure every time is what makes walks comparable. Full rules in `docs/walks/README.md`.

**Timestamp rule:** every folder, file header, bug entry, loophole entry, and state change carries date AND time in one fixed format — `YYYY-MM-DD HH:MM IST` — so neither the founder nor the brain can ever confuse ordering.

**Lifecycle:** `IN_PROGRESS → BUGS_OPEN → ROOTS_FIXED → REWALK_PASSED → INGESTED → SUPERSEDED`

1. **Step 0 of every walk:** read `docs/walks/LOOPHOLES.md` and list every OPEN loophole in 00-scope.md as mandatory checks for this walk.
2. Walk → collect bugs → RCA clusters → root fixes → re-walk proof (the protocol steps above).
3. Only at REWALK_PASSED: **ingest the walk into the brain.**
4. **Next walk of the same feature** (days later, after changes): must complete 07-compare-to-previous — step-by-step diff vs the old walk, what silently broke, what improved, old bugs still fixed.
5. **Supersede:** when the new walk beats the old → delete the OLD walk from the brain entirely and ingest the new one. The brain holds exactly ONE walk per feature (the latest passing one); the old folder stays in git as frozen history.
6. Update the **scoreboard** in `docs/walks/README.md` at every state change — that table is the only place a feature may be called market-ready.

**The loophole loop:** `docs/walks/LOOPHOLES.md` is always editable — any session, any moment the founder or the AI catches a blind spot ("the AI is not considering X"), it goes there with a timestamp. Walk folders freeze when their walk closes; the loophole file never freezes. Every next walk is forced to check the open entries, and entries close only as FOLDED (became a permanent rule in this protocol) or CHECKED (verified in a linked walk). Never deleted.

**The living feature map (added 2026-06-10 ~17:20 IST):** each feature keeps ONE editable `docs/walks/<feature>/MAP.md` (template: `_TEMPLATE/MAP.md`) — its footprint files, API surface, services, DB tables/models, data flow, personas, connected features, known sharp edges. Next walks read this small file instead of re-reading the codebase; each walk diffs it against current code, updates it (timestamped change log), and freezes a snapshot into its own 01-map.md. LOOPHOLES.md and the MAP.md files are the only living files in docs/walks/.

**Staleness — when to scan again:** mechanical rule, never a guess: a walk is FRESH only while `git diff --name-only <walked-commit>..HEAD` touches NOTHING in the feature's MAP.md footprint. Footprint touched → STALE → re-walk. New screens/routes belonging to no footprint → new feature → new MAP + first walk. Stage 1 = manual check at session boot; Stage 2 = `walk-staleness-check` script; Stage 3 (future, founder's vision) = guardrail hook flags mid-session when edited files sit inside a walked footprint. Full spec in `docs/walks/README.md`.

**Single-home rule:** `docs/walks/` is the ONLY home for walk artifacts. No walk files or folders anywhere else in the repo, ever.

**PRE-WALK GATE (founder-mandated 2026-06-10 23:30 IST):** no walk starts until (1) the working tree is clean and ALL commits are pushed to the branch upstream (`git log @{u}..HEAD` empty; main merges stay founder-owned), and (2) the connected stack is verified alive — prod backend `/health` = 200 with postgres ok + redis ok, plus one real login proving the auth path; external services (R2 etc.) checked if the feature uses them. Gate results + timestamps go in 00-scope.md. Pushed code makes the walked-commit anchor real; a live stack prevents fake bugs.

---

## Session-start defaults (so the founder doesn't have to answer every time)

- **Scope:** ONE feature per walk, done completely, before starting the next.
- **First feature when unspecified:** capture-to-submission (the core worker value loop).
- **Scenarios:** start from the minimum set in Step 6; the founder may add Hyderabad-specific ones at any time; fold them back into this doc.
- **Mode:** code-traced walk first (map + screens-from-code + DB schema expectations), then the live emulator walk against prod for the same path. The live walk is the one that counts (`feedback_emulator_only_testing`).
- **Bugs found:** collected → clustered → batch-fixed at roots → re-walked. Never patch-as-you-go.
- **Both lenses:** a feature is "reviewed" only when Lens 1 findings for its code AND a Lens 2 walk both exist.

---

## One-line summary

**Lens 1 asks: is the machine built right? Lens 2 asks: when a real, tired human uses it on their worst day, does every screen tell the truth, does every table fill correctly, and does every person walk away trusting it — and when it breaks, do we fix the root, not the symptom?**
