# 02 — Walk log (real taps only, no shortcuts — needing one = bug)

Live phase walked 2026-06-11 19:23–20:20 IST on the Android emulator against PROD
(backend + DB + Redis). Persona: **QA Supervisor Prod** (+919778087087, userId
`6ce853b5-8d06-43ab-9f53-c17002eb5f7e`, company `dc8b7586` "QA Worker Prod
2026-06-03"). OTP bypass for this phone was added to `AXHY_OTP_BYPASS_PHONES`
via Railway this session (env-set + redeploy, login curl-proven before the walk).

## Step 1 — Sign in — as the supervisor

- At: 2026-06-11 19:23–19:26 IST
- Becoming them: new phone, first login of the evening shift.
- UI: Sign in → phone → Get OTP (button disabled until 10 digits — good) →
  Enter OTP "Sent to +91 ····7087" with resend countdown → 123456 → Verify.
  Evidence: `evidence/01-otp-entry.png`.
- Route: POST /auth/otp/request 200 → POST /auth/otp/verify 200 (bypass).
- DB proof: 1 fresh `RefreshToken` row for userId 6ce853b5 within the window.
- Side-effects: AUTH_LOGIN AuditEvent (seen later in Activity at 19:26).
- Verdict: **PASS**. Landed on Profile tab: REAL name "QA Supervisor Prod",
  real company, SUPERVISOR role (`evidence/02-login-landed-profile.png`).

## Step 2 — Today — as the supervisor starting the day

- At: 2026-06-11 19:28 IST
- Becoming them: "what needs me right now?"
- UI: "THURSDAY · 19:28 / Today's plan" — red **NEEDS YOU NOW: 1 flagged
  visit**; FLOOR PULSE 0/0/0; site card "QA Launch Site · FLAG · NO ROSTER ·
  0 of 0 here"; FLAGGED VISITS · NEEDS REVIEW card with the AI's words.
  Evidence: `evidence/03-today-flagged-banner.png`.
- Route: GET /supervisor/today.
- DB proof: company has SIX flagged visits, but `today-service.ts` scopes
  `scheduledFor` to today → exactly **c4fee06b** (scheduled 2026-06-11) — the
  worker walk's black-photo visit. UI count "1" is CORRECT. The card's text
  matches `Visit.verificationText` verbatim ("All provided images appear
  essentially black/blank…"). Roster honest: 0 assignments at the site.
- Cross-persona: this is the SAME visit the worker walk flagged — the fraud
  moat hands off worker → AI → supervisor exactly as designed.
- Verdict: **PASS** (screen truth verified four-layer).

## Step 3 — Flagged review sheet — as the supervisor judging the work

- At: 2026-06-11 19:32 IST
- UI: "FLAGGED VISIT · REVIEW / QA Worker Prod at QA Launch Site /
  6/11/2026, 3:02:04 AM / **6 photos — 'Inline thumbnails ship with the photo
  CDN slice.'** / AI reason (full verificationText) / Reject — work not done /
  Resolve — looks fine / Cancel". Evidence: `evidence/04-flagged-review-sheet.png`.
- **Bug #3**: the "6 photos" card shows an internal dev roadmap note instead of
  the photos. The supervisor must judge flagged work they CANNOT SEE.
- **Bug (obs) #5b**: US date format "6/11/2026, 3:02 AM" — ambiguous D/M vs M/D
  for Indian users.
- Verdict: FAIL → bugs #3, #5b.

## Step 4 — Reject the visit (honest action: the photos really were garbage)

- At: 2026-06-11 19:34–19:39 IST
- UI: two-step friction sheet — required reason + type-REJECT + warning
  "moves the visit to REJECTED **and notifies HR**. This cannot be undone from
  this screen." Filled reason "Photos are black - no cleaning visible - QA
  reject", typed REJECT, button armed, tapped.
  Evidence: `evidence/05-reject-confirm-filled.png`, `evidence/06-today-after-reject.png`.
- Route: POST /visits/c4fee06b/reject (withIdempotency + withTenantContext).
- DB proof (four layers):
  1. Visit c4fee06b → `state=REJECTED, flagged=false` ✓
  2. AuditEvent `VISIT_REJECTED` at 14:09:19Z with supervisorReason payload ✓
  3. UI updated instantly (banner + review section + FLAG chip gone) ✓
  4. **Side-effects: NO Notification row, NO outbox event — nothing "notifies
     HR"** (code-confirmed: visits.ts:126-210 + visit-flagged-review-service.ts
     write Visit + AuditEvent only). → **Bug #4 (false promise)**.
- Verdict: state machine + audit PASS; word-truth FAIL → bug #4.

## Step 5 — Site card "TAP TO VIEW WORKERS →"

- At: 2026-06-11 19:42 IST
- UI: expands inline → "No active workers on this site today." Honest (0
  assignments in DB). Verdict: **PASS**.

## Step 6 — Decisions tab (pre-decision)

- At: 2026-06-11 19:43 IST
- UI: "All caught up" empty state. Evidence: `evidence/07-decisions-all-caught-up.png`.
- DB proof: both old SupervisorDecision rows are `dismissedAt` set (the 48h
  auto-sweep) → empty is TRUE. Verdict: **PASS**.

## Step 7 — Activity log — as the supervisor reviewing the day

- At: 2026-06-11 19:45 IST
- UI: filters (Today/Yesterday/This week · All sites · All actions/Absences/
  Lates/Leaves) + 5 events: "Visit rejected." 19:39 (my Step 4 — cross-screen
  consistent), "**Dwi expired.**" ×2 19:26, "Auth login." 19:26 + 18:50 (the
  pre-walk curl login!). Evidence: `evidence/08-activity-log.png`.
- DB proof: DWI_EXPIRED audit rows = the two old decisions auto-dismissed
  ("no action for 48h") — consistent with Step 6.
- **Bug #5**: raw internal kinds as user text — "Dwi expired." means nothing
  to a supervisor; titles carry no actor/site context.
- Verdict: data PASS, wording FAIL → bug #5.

## Step 8 — REVERSE the rejection — bad-day: "I rejected by mistake"

- At: 2026-06-11 19:46–19:48 IST
- UI: "Visit rejected." row expands → SHARE TO WHATSAPP + **REVERSE**. Tapped
  REVERSE **8 minutes after rejecting** → dialog: "WINDOW CLOSED · HR REVIEW —
  The 30-minute reversal window has closed. HR will see this request in their
  queue…" (`evidence/09-reverse-window-closed-dialog.png`). Filled optional
  note, tapped **Send to HR** → inline error: **"Reversal window is still
  open; use Reverse instead of soft-flag."**
  (`evidence/10-soft-flag-contradiction.png`).
- Diagnosis: the SERVER computes the window correctly (open); the CLIENT
  computes it wrong (timezone-naive math reads the UTC timestamp as local →
  everything looks 5.5h old to an IST device) and only offers the HR path,
  which the server then refuses. **The supervisor cannot reverse at all.**
  Plus "soft-flag" is developer jargon in user-facing copy.
- Verdict: FAIL → **bugs #6 (client window math) + #7 (dead-end loop + jargon)**.

## Step 9 — Chat (AI) — the paid surface

- At: 2026-06-11 19:50–19:57 IST
- UI: "VOICE · MESSY INPUT / Namaste, QA. / 1 site · 0 workers active" + try-
  saying examples + input. Sent: "Mark QA Worker Prod absent today" (typed via
  adb; final bubble clipped to "…absent toda" — driving artifact, noted).
- AI reply: "Marked QA Worker Prod absent for today." + decision card
  (mark_absent / QA Worker Prod / **2026-06-11** correct IST date / reason
  honest "unknown") + banner "**1 decision added — review in Decisions**".
  Evidence: `evidence/11-chat-mark-absent-decision.png`.
- DB proof: SupervisorDecision `dcf0845c` MARK_ABSENT, OPERATIONAL, pending,
  payload FLAT `{date 2026-06-11, workerId b0be64f7, reason, reasonDetail}`;
  the `{fields,…}` envelope lives in `originContext` (with sourceChatThreadId
  - sourceChatMessageId referencing real ChatThread/ChatMessage rows). ✓
- Verdict: AI extraction **PASS** — model parsed messy input correctly.

## Step 10 — Decisions after chat — THE BROKEN PROMISE

- At: 2026-06-11 19:58–20:03 IST
- UI: Decisions tab still "**All caught up**" — after pull-to-refresh AND
  tab-away-tab-back. The promised decision is INVISIBLE.
- Route proof: `GET /supervisor/decisions` via curl with a fresh supervisor
  token returns **rows=1, total=1** (the MARK_ABSENT card with apply/dismiss
  actions). The server is right; the client is stale.
- Backend access-log proof (railway): app fetched the endpoint at 13:56 and
  14:13 UTC (both rows=0, pre-decision) and **NEVER AGAIN** after the decision
  was created at 14:26 UTC. The only rows=1 hit is my curl at 14:31.
- Code RCA: expo-router tabs keep screens mounted (no remount-refetch);
  `useInvalidateDecisions` is called ONLY by use-decision-action.ts
  (apply/dismiss) — the chat extraction success path never invalidates;
  no focus-driven refetch exists.
- Verdict: FAIL → **bug #8 (HIGH)**.

## Step 11 — App restart → decision appears → APPLY → 400

- At: 2026-06-11 20:08–20:14 IST
- UI: after force-stop + relaunch (fresh mount): Decisions badge (1), card
  "ROUTINE / OPERATIONAL / PENDING 17 MIN AGO / **Mark worker absent**" —
  correct relative time, but **no worker name** (server sends workerName:null)
  → **bug #9**. Evidence: `evidence/12-decision-card-after-restart.png`.
- Tapped **Mark absent** → card error: "**Request failed with status 400**" →
  **bug #10 (CRITICAL)**.
- Route proof (railway): POST /decisions/dcf0845c/apply → adapter inject →
  POST /chat/apply → **400** (both logged 14:45 UTC).
- Code RCA — CORRECTED after curl repro (first theory was payload-envelope
  drift; DISPROVEN — supervisor-decision-writer.ts:170 stores `payload =
input.fields` FLAT, the envelope lives in `originContext` only):
  repro returned **`{"error":"NOT_SUPERVISOR"}`**. Chain:
  markAbsentService → `assertCallerSupervisesWorker` → the QA worker has
  **zero Assignment rows** (the site honestly showed "0 of 0") →
  `NO_PRIMARY_SITE` → `NOT_SUPERVISOR` → 400 (attendance-service.ts:87-97).
  The authz integrity is CORRECT. The product bugs are:
  (a) **propose/apply asymmetry** — chat.ts's propose_mark_absent branch runs
  NO roster precheck, so the AI replies "Marked QA Worker Prod absent for
  today." (a DONE claim for something only proposed AND destined to be
  refused) and writes a decision that can never be applied;
  (b) **raw error surfacing** — the card shows "Request failed with status
  400", hiding the server's reason; the supervisor gets no path forward
  (the real fix for THEM: assign the worker to the site roster first).
- Verdict: FAIL → bugs #9, #10 (re-rooted).

## Step 12 — Drawer + Memory & rules + My sites

- At: 2026-06-11 20:16–20:19 IST
- Drawer: all 9 items match the code-traced map; "How to use Axhy — **60-sec
  video** · examples" promises a video the /help page doesn't have (obs).
- Memory & rules: honest empty state ("No rules yet… capture them via chat").
- My sites: "1 site — QA Launch Site, 0/0 workers on site" — matches the
  SiteSupervisorBinding + 0 assignments. **PASS**.

## Step 13 — Orphans (summary / updates) — live confirm attempt

- At: 2026-06-11 20:20 IST
- Deep-link via the dev-client scheme doesn't route to inner screens; the
  code-trace evidence stands (zero nav references; `href:null` only).
  Bugs #1/#2 remain confirmed-by-code.

## Not walked (recorded honestly)

- **Replacement-picker**: unreachable today — needs a worker action sheet and
  the site has 0 rostered workers. Next walk seeds an assignment first.
- **Temporary mode** (pause modal): mutates supervisor availability; deferred
  to the next walk to keep this one's state clean for the re-walk.
- **Sign out**: deliberately kept the session for the post-fix re-walk.
- **Voice input / attach / search / bell**: not exercised this walk.

## Bad-day scenarios run

| Scenario                                    | At (IST)    | Result                                           | Bug #   |
| ------------------------------------------- | ----------- | ------------------------------------------------ | ------- |
| Wrong-decision regret (reverse a rejection) | 19:46–19:48 | DEAD END — client/server window contradiction    | #6, #7  |
| Decision created in chat, reviewed in queue | 19:56–20:14 | Invisible until restart; apply 400               | #8, #10 |
| Judge flagged work without seeing photos    | 19:32       | Forced to decide blind                           | #3      |
| Old pending decisions left >48h             | (historic)  | Auto-dismissed correctly + audited (DWI_EXPIRED) | —       |
