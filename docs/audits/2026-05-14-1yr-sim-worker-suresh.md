---
Status: Audit draft
Type: 1-year persona simulation audit (Round 2 of 5)
Persona: WORKER — Suresh Kumar (master plan §O.4)
Scale: One worker among ~5,000 at Surya Cleaning; single-site (Lakeview Tower) on Ravi's portfolio
Primary lens: docs/specs/2026-05-14-supervisor-responsibility-model.md (Active 2026-05-14)
Secondary lenses: 2026-05-14-operations-workflow-model.md, 2026-05-12-decision-entity-lock.md (D.1), 2026-05-12-hr-updates-spec.md, 2026-05-13-product-framing.md
Round 1 (Ravi) cross-reference: docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md
Not added to: docs/index/canonical-truth.md (audit, not a governing spec)
Plan: /Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md
Revisions: 2026-05-14 afternoon — v1 draft. 2026-05-15 — methodology v2 (workflow-design first, implementation status secondary; [MISSING] = design gap not code gap) + explicit worker-side switching coverage (W-1 through W-8).
---

# Suresh — 1-Year Simulation Audit (Worker)

## Persona setup

- **Suresh Kumar**, 32, Bihar migrant. Hindi reader, basic Telugu. ₹14K/month from Surya. Sends ₹8K home to wife + 5 kids.
- **Phone:** ₹6K Realme, 80% storage full, shared with roommate sometimes. Patchy 4G at room, full bars at Lakeview.
- **Shift:** Lakeview Tower, Mon–Sat 7am–5pm. Single-site.
- **Trust map:** Ravi (his supervisor) — high. Kavitha (HR) — name heard, never met. Lakshmi / Anjali — strangers until they appear.
- **Fears (master plan §O.4):** late pay, false accusation, firing without notice.

## Audit method (v2 — workflow-design first)

A workflow = a real operational situation from trigger to real-world outcome, measured from the human side, over time, under pressure, with overlaps. Every scene addresses 8 elements in order: **Workflow** name · **Trigger** · **Actors + authority** · **Lived experience** · **Pressure / overlap / failure** · **Outcome judgment** (tag) · **Implementation status** (one line) · **Takeaway** (one line).

`[MISSING]` means the **workflow design itself doesn't cover this real-life case**, not "code is unbuilt." If the design is good but unimplemented → `[WORKS]` with implementation status: absent. If the design produces a wrong real-world outcome regardless of build state → `[BROKEN]` or `[CONFUSING]`.

Order rule: judge the workflow design as if fully implemented; implementation status is a one-line footnote.

## Audit orientation — worker surface classification (secondary annotation)

This table preserves the v1 classification of _implementation shape_ per workflow. It's an orientation device, not a verdict. Each scene below leads with the workflow-design verdict; the classification tag (`[route-shaped-supervisor]` / `[no-route]` / `[no-ui]` / `[offline-only]`) follows as an implementation-status note.

| Workflow                                  | Backend route                                                                                              | Worker UI                  | Worker-completable alone?                              | Current fallback               | Classification                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------ | ------------------------------ | --------------------------------------- |
| A1 OTP login                              | `/auth/otp/*` exists                                                                                       | shared with supervisor app | Yes                                                    | —                              | `[WORKS]`                               |
| A3 Worker invitation receipt              | HR creates Worker row                                                                                      | none                       | No                                                     | Kavitha or Ravi verbally       | `[no-ui]`                               |
| A4 Doc collection                         | not located                                                                                                | none                       | No                                                     | WhatsApp photo to Ravi         | `[no-route]` + `[no-ui]`                |
| C11 Marked absent (subject)               | supervisor route                                                                                           | no worker dispute UI       | No                                                     | tells next-shift worker → Ravi | `[no-ui]`                               |
| C12 Visit lifecycle (clock-in/out)        | no worker route                                                                                            | none                       | No                                                     | unclear mechanism              | `[no-route]` + `[no-ui]`                |
| C14 Visit photo verification              | supervisor side                                                                                            | none                       | No                                                     | doesn't know it happened       | `[no-ui]`                               |
| C15 Audit reversal                        | supervisor-driven                                                                                          | none                       | No                                                     | Ravi may WhatsApp              | `[no-ui]`                               |
| D17 Decision applied (about him)          | supervisor route                                                                                           | none                       | No                                                     | learns by consequence          | `[no-ui]`                               |
| D20 EMPLOYMENT-tier (subject)             | supervisor + HR                                                                                            | none                       | No                                                     | phone call from Kavitha        | `[no-ui]`                               |
| E21 Leave request submit                  | POST /leave-requests at `leave-requests.ts:44` — supervisor-shaped (`workerId` in body)                    | none                       | No                                                     | phones Ravi; Ravi submits      | `[route-shaped-supervisor]` + `[no-ui]` |
| E22 Swap counterparty                     | POST /swap-requests at `swap-requests.ts:38` — stores `supervisorId = auth.userId`; no worker accept route | none                       | No                                                     | WhatsApp + supervisor logs     | `[route-shaped-supervisor]` + `[no-ui]` |
| E24 Termination (subject)                 | supervisor proposes + HR acks                                                                              | none                       | No                                                     | phone call from Kavitha        | `[no-ui]`                               |
| E25 Suspension (subject)                  | supervisor proposes + HR acks                                                                              | none                       | No                                                     | Ravi verbally                  | `[no-ui]`                               |
| F26 Acting coverage (his supervisor sick) | binding routes                                                                                             | no worker surface          | N/A — passive                                          | meets Lakshmi cold             | `[no-ui]`                               |
| F27 Reassignment (supervisor changes)     | binding routes                                                                                             | no worker surface          | N/A — passive                                          | meets new supervisor cold      | `[no-ui]`                               |
| F28 Replacement invite (candidate)        | no accept/reject route                                                                                     | none                       | **No** — 2-min TTL exists in design, no worker surface | Ravi phones                    | `[no-route]` + `[no-ui]`                |

## Worker-side switching scope (W-1 through W-8)

These 8 cases are the worker-side dimensions of supervisor switching. Each one is judged from Suresh's lived perspective against what the actual specs say (or don't say). Cross-referenced from Ravi's switching coverage appendix as "primary in Suresh's audit."

| Tag     | Question                                                                                          | Spec answer / silence                                                                                                                                                         | Suresh scene                                                                    |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **W-1** | What does Suresh see when his supervisor is replaced by acting cover?                             | RM §5.5 pick 5 puts push **only** on the acting supervisor. Worker silence is explicit.                                                                                       | Month 8                                                                         |
| **W-2** | What does Suresh see when the acting window ends?                                                 | RM §5.6 + ops §7.10 — "while you were out digest" and "you'll be covered note" are **both supervisor-only**.                                                                  | Month 8                                                                         |
| **W-3** | What does Suresh see when his supervisor changes permanently?                                     | RM §3.2 + ops §7.11 cover HR + supervisor; worker side absent.                                                                                                                | Month 9                                                                         |
| **W-4** | What does Suresh see as subject of decisions about him?                                           | ops §7.1 "worker sees via worker app (Phase B scaffolding)" — deferred; §7.4 / §7.5 / §7.12 silent on worker visibility for FLAG / audit reversal / termination / suspension. | Day 3, Day 4, Month 7, Month 11                                                 |
| **W-5** | What does Suresh see about his leave-request status?                                              | ops §7.2 names "Worker (request status)"; outbox topic `worker.leave_approved` exists; mechanism (push/SMS/app pull) unspecified.                                             | Week 2                                                                          |
| **W-6** | What does Suresh see when he's a replacement candidate?                                           | D.1 §2.8 + ops §7.9 lifecycle locked; R6 `replacement-picker.jsx` is **supervisor-side only**; worker surface unmapped.                                                       | Day 7                                                                           |
| **W-7** | Who does Suresh trust / call when his supervisor is changing?                                     | No spec content on worker-side authority handoff anywhere.                                                                                                                    | Month 8 + Month 9                                                               |
| **W-8** | What does Suresh see as subject of decisions whose propose and apply spanned a supervisor switch? | RM §5.4 + ops §7.7 cover supervisor side; worker-side continuity narrative silent.                                                                                            | Month 11 (Mahesh termination originated by Ravi, applied by Kavitha during F27) |

## Spec uncertainty note

The spec doesn't lock how Visit rows transition SCHEDULED → IN_PROGRESS. Operations model §3.4 says worker scaffolding covers "assignment-receipt." Whether Visit rows are pre-created from the schedule, created on supervisor action, or expected from a future worker action is not locked anywhere. That ambiguity is itself a workflow-design gap — surfaces in Day 2.

## Reading guide

Every scene leads with what Suresh sees, hears, taps, or can't do. Spec citations live in inline tags. Each scene heading carries Layer label + workflow name. Each scene ends with one **Takeaway**.

---

## Year-1 timeline

### Day 1 · [Layer 1] · Workflow: Worker first-open after install

- **Trigger:** Ravi tells Suresh to install Axhy: "OTP aayega, login kar."
- **Actors + authority:** Suresh (new user). The app's worker shell (does it exist?).
- **Lived experience:** Install eats 90MB on his already-80%-full ₹6K Realme. He deletes two photos. OTP arrives, login works. Home screen is blank — no worker-routed shell exists. He closes the app wondering if he installed it right.
- **Pressure / overlap / failure:** Day-one trust loss. The app doesn't establish "this is where you'll see your work."
- **Outcome judgment:** `[MISSING]` — the workflow design has no worker home-shell concept at all. Operations model §3.4 explicitly: "Auth + assignment-receipt scaffolding only."
- **Implementation status:** Auth scaffolding present; worker shell absent in design.
- **Takeaway:** Login is the only thing that works on day 1; everything past login is workflow-design absent, not just code-unbuilt.

### Day 2 · [Layer 1] · Workflow: Visit lifecycle from worker side

- **Trigger:** Suresh's 7am Lakeview shift. He punches in on the building's paper register (security guard's process, not Axhy's).
- **Actors + authority:** Suresh (does the work). The mechanism supposed to move Visit rows SCHEDULED → IN_PROGRESS (unspecified). Ravi (`/visits/:id/end` exists supervisor-side).
- **Lived experience:** He works the 10-hour shift. He never opens the app during the day.
- **Pressure / overlap / failure:** Whether Axhy "saw" him is genuinely unknown — the spec doesn't say who or what should fire the state transition.
- **Outcome judgment:** `[MISSING]` — the workflow design has no locked trigger for the SCHEDULED → IN_PROGRESS transition from the worker side.
- **Implementation status:** No worker clock-in/out route; no worker UI.
- **Takeaway:** A day of work happens with the app effectively offline; the spec doesn't say what should have happened.

### Day 3 · [Layer 1] · Workflow: False absence + dispute path (W-4 absent subcase)

- **Trigger:** Suresh shows at Lakeview 6:55am. Ravi (checking another site) doesn't see him; voice-captures "Suresh nahi aaya."
- **Actors + authority:** Ravi (decision maker). Suresh (subject; present, no dispute affordance). Ramu (the replacement candidate; arrives confused at 7:20am).
- **Lived experience:** Suresh is mopping the lobby. Ramu walks in. They sort it out worker-to-worker: "boss Ravi se baat kar, main yahin hoon." Ravi reverses inside the 30-min window. Suresh sees nothing of the reversal — only Ravi's WhatsApp thumbs-up that night.
- **Pressure / overlap / failure:** Suresh spends an hour worried about pay loss with no in-app surface to dispute. Even after Ravi reverses, Suresh has no signal that the absence was undone.
- **Outcome judgment:** `[MISSING]` — the workflow design has no worker-side dispute affordance and no notification on audit reversal. W-4 subcase.
- **Implementation status:** Mark-absent + reverse routes present supervisor-side; worker dispute + reversal-notification absent in design.
- **Takeaway:** The supervisor's 30-min reverse is a real safety net; for Suresh the same hour is anxiety with no visibility.

### Day 4 · [Layer 1] · Workflow: AI-flagged visit from subject's side (W-4 FLAG subcase)

- **Trigger:** A photo Suresh uploaded for C-12 floor gets AI-flagged ("trash bin in frame; 0/3 mop strokes visible"). Ravi adjudicates Resolve OK.
- **Actors + authority:** AI (flags). Ravi (resolves). Suresh (subject; never notified).
- **Lived experience:** He never knows the flag fired. He never knows it resolved. If Ravi had picked Reject, the consequence (pay deduction? warning?) would arrive with no in-app explanation.
- **Pressure / overlap / failure:** AI verification is silent on Suresh's side regardless of outcome — clearing or penalising both invisible.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side FLAG visibility, no appeal path, no rendering of the consequence cascade. W-4 subcase.
- **Implementation status:** FlaggedReviewSheet present supervisor-side; worker FLAG visibility + appeal absent in design.
- **Takeaway:** AI verification is silent on Suresh's side regardless of outcome.

### Day 5 · [Layer 1+2] · Workflow: Company-wide HR Update reaches worker

- **Trigger:** Kavitha posts a wage-increment HRUpdate ("₹100 monthly increment June 1").
- **Actors + authority:** Kavitha (poster). All ~100 supervisors (audience per HR Updates §4.1). Workers (NOT in the audience model by design).
- **Lived experience:** Ravi WhatsApps Suresh that night: "boss ₹100 increment June 1 se." Suresh nods. He'll discover the change next month from his bank SMS.
- **Pressure / overlap / failure:** A pay-affecting policy change reaches Suresh through someone else's WhatsApp, not through his app. At 5K-scale, supervisor-WhatsApp is the de facto telephone network — slow, lossy, supervisor-language-dependent.
- **Outcome judgment:** `[BROKEN]` — the HR Updates audience model is a workflow-design choice that excludes workers; for pay-affecting changes that's a 5K-scale telephone problem regardless of build state.
- **Implementation status:** HR Updates route + supervisor audience present; worker audience absent in design.
- **Takeaway:** Policy changes that affect Suresh's pay reach him through someone else's WhatsApp.

### Day 7 · [Layer 1] · Workflow: Replacement-invite respond, worker side (W-6)

- **Trigger:** A Banjara worker is short. Ravi opens replacement picker; Suresh's name is a candidate. "Send invite — 2 min timer."
- **Actors + authority:** Ravi (originator). Suresh (candidate; expected to respond inside 2 min). System (TTL enforcer).
- **Lived experience:** Ravi doesn't rely on the in-app flow; he phones Suresh: "boss Banjara cover karega 4pm tak? extra 200 milega." Suresh agrees by voice.
- **Pressure / overlap / failure:** The 2-min TTL is design-side metadata; the actual operational mechanism is a phone call. If the design ever lands a worker UI, his ₹6K phone + patchy 4G + shared-phone reality means 2 minutes is brutally short anyway.
- **Outcome judgment:** `[MISSING]` — D.1 §2.8 + ops §7.9 lock the lifecycle entity; the worker-side response surface is unspecified anywhere. W-6.
- **Implementation status:** Invite lifecycle locked in design; worker accept/reject route and UI absent.
- **Takeaway:** The 2-min TTL is meaningful in design but invisible in Suresh's reality.

### Week 2 · [Layer 1] · Workflow: Worker initiates leave (W-5)

- **Trigger:** Suresh's son in Bihar has a fever. He wants Fri/Sat/Sun off.
- **Actors + authority:** Suresh (initiator). Ravi (the de facto submission proxy). Kavitha (approver). POST /leave-requests at `leave-requests.ts:44` exists but is supervisor-shaped (takes `workerId` in the body).
- **Lived experience:** Suresh WhatsApps Ravi. Ravi submits on his behalf via the supervisor app. The leave row goes to HR. Suresh has no status surface — no "your leave is HR-pending, position N." Approval arrives later that week via Ravi's WhatsApp screenshot.
- **Pressure / overlap / failure:** The workflow design treats supervisor-on-behalf-of submission as the default. Worker-self-initiative isn't surfaced. Status visibility is supervisor-only.
- **Outcome judgment:** `[BROKEN]` — workflow design treats leave as supervisor-mediated; the worker-self path doesn't exist. `[MISSING]` for worker-side status visibility. W-5.
- **Implementation status:** Supervisor-shaped POST route present; worker-self-submit path + status surface absent in design.
- **Takeaway:** Leave is mediated entirely by Ravi; the backend route's existence is invisible to Suresh.

### Week 4 · [Layer 1] · Workflow: Monthly pay arrives

- **Trigger:** End of month 1. ₹14,000 should land in his bank.
- **Actors + authority:** Payroll processor (stub per operations model §13). Suresh (recipient).
- **Lived experience:** Bank SMS at some point. No Axhy notification. No in-app salary statement. No attendance-count surface. If the amount is short, no in-app surface to ask "which days got deducted?" He texts Ravi.
- **Pressure / overlap / failure:** Suresh's single most trust-load-bearing event of the month happens entirely outside the app. Master plan §O.4 names this exact fear as his primary churn risk.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side pay-arrival / pay-breakdown / attendance-count surface.
- **Implementation status:** Payroll processor stub; worker pay surface absent in design.
- **Takeaway:** The most trust-load-bearing moment of every month happens entirely outside the app.

### Month 2 · [Layer 2] · Workflow: Burst absences with Suresh as cover

- **Trigger:** Monsoon flu wave. 3 workers absent at Lakeview the same morning. Ravi calls Suresh for a double shift.
- **Actors + authority:** Ravi (offer-er). Suresh (accepts via WhatsApp). Visit/Assignment rows server-side.
- **Lived experience:** Suresh works 14 hours. WhatsApp confirms the ₹400 extra. No in-app trace (visible to him) of "you worked a double shift." Bank SMS at month-end either confirms or doesn't.
- **Pressure / overlap / failure:** Suresh keeps a mental ledger of "what I'm owed extra." Festival overflow + WhatsApp coordination at 5K-scale means many extra-hours moments accumulate company-wide with no worker-side ledger anywhere.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side hours-worked / overtime surface.
- **Implementation status:** Server-side tracking may exist; worker visibility absent in design.
- **Takeaway:** The app doesn't notice that Suresh saved 3 sites in a monsoon scramble.

### Month 3 · [Layer 1] · Workflow: Suresh as backup cover for Joseph's leave

- **Trigger:** Joseph takes 5 days off; Wednesday cover gap; Ravi taps Suresh.
- **Actors + authority:** Ravi (asks). Suresh (covers 3 extra hours).
- **Lived experience:** Same shape as Month 2 — WhatsApp ask, extra hours, mental ledger, bank SMS confirmation at month-end.
- **Pressure / overlap / failure:** Pattern compounds across months.
- **Outcome judgment:** `[MISSING]` — same workflow gap as Month 2 (worker hours-worked surface). Folded for verdict.
- **Implementation status:** Same.
- **Takeaway:** The mental-ledger pattern compounds across months.

### Month 5 · [Layer 2] · Workflow: Site auto-suspension reaches workers (via Mahesh)

- **Trigger:** Vasanth Vihar auto-suspends at 6am. Mahesh has a Vasanth Vihar morning shift that day.
- **Actors + authority:** System (state transition). Mahesh (commutes 45 min, arrives, turned away). Ravi (the only escape valve).
- **Lived experience:** Mahesh phones Ravi from the bus stop. Lost morning's earnings. No app push happened to either supervisor or worker before the transition.
- **Pressure / overlap / failure:** State-transition workflow has no worker-side push step. At 5K-scale, suspensions happen often enough that commute cost is a recurring worker tax.
- **Outcome judgment:** `[BROKEN]` — workflow design has no worker-side push when a site changes state before that worker's next shift.
- **Implementation status:** State machine present; worker-side push cascade absent in design.
- **Takeaway:** Site changes happen system-side without any worker-side push; the worker absorbs the cost as commute and lost wages.

### Month 6 · [Layer 1+2] · Workflow: Urgent leave bottleneck, worker witnesses (W-5 stress)

- **Trigger:** Krishna asks for urgent Saturday medical leave Friday morning. 36-hour delay because Kavitha is buried.
- **Actors + authority:** Krishna (subject). Ravi (submitter). Kavitha (overloaded approver). Suresh (a fellow worker who hears about it).
- **Lived experience:** Krishna doesn't show Saturday. He calls Kavitha directly for phone-approval. Suresh hears the whole story from Krishna over chai. Suresh internalises: if I need urgent leave, the app won't save me — only Kavitha's phone will.
- **Pressure / overlap / failure:** Worker trust in the system erodes by witnessing other workers' near-misses. The system's HR bottleneck is a workflow-design failure regardless of build state.
- **Outcome judgment:** `[BROKEN]` — the leave workflow design treats HR as instant. No worker-side queue-status surface. The app becomes performative paperwork around real WhatsApp/phone work.
- **Implementation status:** Leave route + HR ack present supervisor-side; worker-side queue + escalation absent in design.
- **Takeaway:** Worker trust erodes by witnessing other workers' near-misses; the app becomes performative paperwork.

### Month 7 · [Layer 1] · Workflow: Mahesh's suspension week from subject side (W-4 suspension subcase)

- **Trigger:** Mahesh's accumulated absences. Ravi proposes 1-week suspension. Kavitha approves.
- **Actors + authority:** Ravi (proposer). Kavitha (approver). Mahesh (subject).
- **Lived experience:** Ravi phones: "boss, ek hafta rest, suspended hai, next Monday se aana." Mahesh asks "kya likha hai system mein? kab tak hai? salary aayegi?" Ravi doesn't know — his app doesn't surface a return date. Mahesh spends the week anxious; starts looking for other jobs informally.
- **Pressure / overlap / failure:** Suspension disappears the worker into opacity. The design stores an end date but doesn't render it anywhere — not on supervisor's worker row, not on worker-side at all. A week of opacity produces job-search activity, not corrective behaviour.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side suspension visibility (return date, current state, pay-pause status). W-4 suspension subcase.
- **Implementation status:** Suspension state present; worker-side surface absent in design.
- **Takeaway:** Suspension as designed disappears the worker into opacity that produces job-search behaviour, not corrective behaviour.

### Month 8 · [Layer 1+2] · Workflow: Worker experiences supervisor change (W-1 + W-2 + W-7 combined — the headline scene)

- **Trigger:** Ravi calls Suresh Monday: "boss main bimar hoon, 2 hafta, Lakshmi covers karegi mere sites, baat kar le usse." Acting binding takes effect 7am Monday.
- **Actors + authority:** Kavitha (creator of the binding). Lakshmi (acting cover). Ravi (original; offline). Suresh + Ravi's 39 other workers (subjects of the binding change; the spec does not address them as audience).
- **Lived experience:** Lakshmi WhatsApps Suresh Monday afternoon: "main Lakshmi, Ravi ke bimari mein cover kar rahi hoon, mere number save kar le." Suresh saves the number. He doesn't fully trust her — they've never met. For 14 days he is uncertain who to text first when something is wrong; defaults to Ravi (sick), forwards to Lakshmi. **Day 222 mid-week:** Ravi authors a termination proposal from bed about a Lakeview worker (Kishore-A); Lakshmi types the gate phrase against a worker she met two days ago. Kishore-A hears nothing through this period. **Day 234:** Window auto-ends overnight. Ravi WhatsApps "main aa gaya"; Suresh learns from that, not from the app.
- **Pressure / overlap / failure:** The trust-transition cost is entirely on the worker. The app does not orient him at start, does not reassure him during, does not signal at end. The supervisor-side pushes per pick 5 are explicitly only-supervisor.
- **Outcome judgment:** `[MISSING]` for **W-1** (worker awareness on start), `[MISSING]` for **W-2** (worker awareness on end), `[MISSING]` for **W-7** (in-app trust-transition surface). Spec is silent on all three. This is the load-bearing Suresh case.
- **Implementation status:** Binding routing present; worker-side notification + trust-transition surface absent in design.
- **Takeaway:** Supervisor change reaches Suresh as a WhatsApp introduction, and the app neither orients him nor reassures him that Ravi's old promises still hold.

### Month 9 · [Layer 1+2] · Workflow: Worker experiences permanent reassignment (W-3 + W-7)

- **Trigger:** Anjali permanently absorbs Manikonda from Ravi. Mehmood (Suresh's friend) works at Manikonda.
- **Actors + authority:** Kavitha (rebinds). Ravi → Anjali (binding transfer). Mehmood (subject).
- **Lived experience:** Mehmood tells Suresh over chai: "naye supervisor aaye hain, Anjali, sirf 2 sites le liye Ravi se." His experience is identical to Suresh's Month 8 — no app notification, just whoever WhatsApps first. Anjali's first week, Mehmood reports she didn't know the Manikonda lobby-mop-twice-daily rule; Mehmood explained.
- **Pressure / overlap / failure:** Worker-to-worker informal handoff is the actual transition mechanism. The app is invisible. The workflow design treats reassignment as a supervisor-side event.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side notification on permanent reassignment. W-3 + W-7 combined. Same silence as Month 8; permanent vs temporary, identical worker-side gap.
- **Implementation status:** Same as Month 8 — binding routing present; worker-side surface absent in design.
- **Takeaway:** Worker-to-worker informal handoff is currently the actual transition mechanism when supervisors change.

### Month 10 · [Layer 1+2] · Workflow: Diwali festival overflow

- **Trigger:** Festival overflow. Suresh stays in Hyderabad. Ravi offers extras via WhatsApp.
- **Actors + authority:** Ravi (offer-er via WhatsApp). Suresh (accepts).
- **Lived experience:** WhatsApp negotiation. Suresh works extra hours; some overtime, some swap-shaped, ambiguous. Resolution at month-end by phone tag.
- **Pressure / overlap / failure:** Festival-week scaling is entirely a WhatsApp throughput problem; the design has no worker-side offer/respond surface.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-driven offers/overtime surface (folded into Month 2/3 hours-worked gap; called out separately because festival shape — many offers, short windows — would stress the absent surface differently).
- **Implementation status:** Same as Months 2/3/replacement-invite.
- **Takeaway:** Festival-week scaling is entirely a WhatsApp throughput problem.

### Month 11 · [Layer 1] · Workflow: Mahesh's termination applies (W-4 + W-8)

- **Trigger:** Mahesh's termination (proposed Month 7) finally APPLIES — Kavitha types her HR phrase.
- **Actors + authority:** Ravi (originator, Month 7). Kavitha (HR final ack). Anjali (current responsible for Manikonda after F27). Mahesh (subject; offline at the app layer throughout).
- **Lived experience:** Mahesh receives a phone call from Kavitha that morning: "boss, sorry, your services are no longer needed. Aap ka final settlement bank mein 5 din mein aayega." That's it. No in-app notification. No record visible to him. No surface to dispute or download a record of his year. He asks for a written reason; Kavitha says "Ravi will tell you"; Ravi forwards a WhatsApp paragraph summarising 3 missed shifts + a client complaint. Suresh hears about Mahesh's termination from another worker at chai.
- **Pressure / overlap / failure:** A worker's most consequential moment in the system happens with the app entirely absent. Compounding **W-8**: the termination was proposed by Ravi but applied during Anjali's responsibility for Manikonda; the design says nothing about how the subject experiences this continuity-across-switch — but in practice the subject experiences nothing in-app regardless of which supervisor was responsible at any moment.
- **Outcome judgment:** `[BROKEN]` — workflow design treats EMPLOYMENT-tier termination as a supervisor + HR action with no worker side. The most trust-consequential workflow in the worker's life has zero in-app trace. **W-4 termination subcase + W-8.**
- **Implementation status:** Termination proposal + apply routes present supervisor + HR side; worker-side notification + appeal + records absent in design.
- **Takeaway:** A worker's most consequential moment — being fired — happens with the app entirely absent.

### Month 12 · [Layer 1] · Workflow: Worker year-end record

- **Trigger:** Year ends. Suresh has worked 11 of 12 months (took 4 leave days, no terminations against him, modest overtime). He checks the app on a quiet evening.
- **Actors + authority:** Suresh (looking).
- **Lived experience:** Login, then a near-empty home. He cannot see his year — no attendance count, no total earnings, no leave history, no record of the 3 double-shifts he covered in monsoon.
- **Pressure / overlap / failure:** A full year of work has happened on Suresh's side, and the app has nothing to show him for it.
- **Outcome judgment:** `[MISSING]` — workflow design has no worker-side annual statement or records-export.
- **Implementation status:** Worker home shell + records surface absent in design.
- **Takeaway:** A full year of work has happened on Suresh's side, and the app has nothing to show him for it.

---

## Workflows Suresh does today that have no app surface (forced-workarounds inventory)

| Workflow                                                | What he does                                             | Could the app help?                                                    |
| ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Confirm he showed up to work                            | Paper register at site security gate; trusts Ravi's eyes | Worker clock-in / clock-out (no route today)                           |
| Dispute being marked absent                             | WhatsApps next-shift worker, asks them to tell Ravi      | In-app "I'm here" tap with photo or GPS                                |
| See his attendance count for the month                  | Asks Ravi; trusts the bank SMS at month-end              | Worker pay/attendance summary surface                                  |
| Submit a leave request                                  | Phones Ravi; Ravi submits via supervisor flow            | Worker leave submit + status tracker                                   |
| Check leave-request status                              | Phones Ravi or Kavitha                                   | Worker leave-status surface                                            |
| Accept a replacement invite                             | Picks up Ravi's phone call                               | Worker invite respond surface + push                                   |
| Negotiate a swap with another worker                    | WhatsApp conversation, then both tell Ravi               | Worker swap propose/respond surface                                    |
| See HR Updates (wage changes, policy)                   | Ravi WhatsApps the gist                                  | Worker HR Updates feed (audience model currently supervisor-only)      |
| See a flagged visit + dispute it                        | Doesn't know it happened                                 | Worker flag-receive + comment surface                                  |
| See his suspension status / return date                 | Verbal from Ravi                                         | Worker suspension surface                                              |
| See a pending termination proposal against him          | Doesn't see it; learns only when applied                 | Worker advance-notice surface (or deliberate "no advance notice" lock) |
| See his year-end record                                 | Bank SMS history; verbal                                 | Worker annual statement / records export                               |
| Know who his current supervisor is when handoffs happen | WhatsApp introduction from incoming supervisor           | Worker "your supervisor is now X" banner                               |

---

## What worked (workflow-design judgments)

**Layer 1 — local:**

- OTP login is the one workflow that does what it should from his side.
- Server-side capture of the days nothing went wrong — his bank SMS arrived correctly most months.

**Layer 2 — cross-level:**

- Acting and reassignment binding routes correctly under the hood — Lakshmi and Anjali had access when they needed it.

That's the entire `[WORKS]` list. The remainder is `[MISSING]` (workflow-design gap) or `[BROKEN]` (workflow design produces a wrong outcome regardless of build state).

## What became confusing

**Layer 1 — local:**

- Day-1 blank home — workflow design has no worker shell, so the app's first impression cannot orient him.
- Day-3 false absence — Ravi reverses inside the supervisor 30-min window; Suresh sees nothing through the resolution; his hour of anxiety has no in-app close.
- Day-4 photo flag — silent on Suresh's side regardless of outcome; the workflow design doesn't model FLAG visibility for the subject.

**Layer 2 — cross-level:**

- Supervisor handoffs (Month 8, Month 9) arrive as WhatsApp introductions instead of app signals; the worker carries the trust-translation cost.

## What broke (workflow-design level)

**Layer 1 — local:**

- Leave submit workflow assumes supervisor-on-behalf submission; worker self-initiative has no path (Week 2).
- HR queue saturation strands the worker with no queue-status / escalation surface; the design treats HR as instant (Month 6).
- Termination as a subject-experience is the largest broken case: the design has no worker-side notification or appeal path at all (Month 11).

**Layer 2 — cross-level:**

- HR Updates audience model excludes workers by design; pay-affecting changes reach workers through someone else's WhatsApp at 5K-scale (Day 5).
- Site auto-suspension cascade has no worker push, so workers commute to closed buildings (Month 5).

## What is missing in design

Strict `[MISSING]` (workflow design itself doesn't cover the real-life case):

- Worker home shell on first open (Day 1).
- Visit-lifecycle worker-side trigger (Day 2).
- Worker dispute path for false absence (Day 3).
- Worker FLAG visibility + appeal (Day 4).
- Worker-side reasoning capture on dismiss (where applicable — not directly Suresh's surface).
- Replacement-invite respond surface (Day 7 / W-6).
- Worker-side leave-status visibility (Week 2 / W-5).
- Worker pay/attendance/breakdown surface (Week 4).
- Worker hours-worked / overtime / extra-shift surface (Months 2, 3, 10).
- Worker-side suspension visibility incl. return date (Month 7 / W-4).
- **Worker awareness on supervisor change — start, end, permanent** (Month 8 / Month 9 / W-1 + W-2 + W-3 + W-7). The headline gap.
- Worker year-end / on-request records export (Month 12).

The HR Updates audience-model exclusion (Day 5) and the worker-side termination absence (Month 11) are categorised as `[BROKEN]` design choices (the design names workers in the system but excludes them from the audience / notification path), not `[MISSING]`.

## What should change before implementation

Ordered by trust-impact for the worker, not by ease:

1. **Worker home shell** with attendance + pay + leave-balance at a glance. Single biggest trust-builder.
2. **Worker clock-in / clock-out** route + surface; lock the SCHEDULED → IN_PROGRESS trigger.
3. **"I'm here" dispute affordance** for false-absence cases — a single tap with optional photo / location, sent to supervisor's Today as a soft-flag.
4. **Worker-side leave submit + status surface**, paired with the existing route reshaped to accept worker-self-submit.
5. **Replacement-invite worker accept/reject route + push surface**. The 2-min TTL design only earns its keep if the worker has a surface to act in time.
6. **Suspension surface** — return date, current state, pay-pause status — for the subject.
7. **Termination workflow with worker-side awareness** — either (a) a deliberate "no advance notice" lock with an explicit appeal/records-download surface post-apply, or (b) a graceful HR-paced communication path. Currently neither exists.
8. **Worker awareness on supervisor change** — the headline ask. A simple "Your supervisor for site X is now Lakshmi until [date]" banner / push on start and end. Same for permanent reassignment.
9. **HR Updates audience extension to workers** for pay-affecting policy changes. At minimum, push the worker-relevant subset.
10. **Payroll statement surface** — monthly breakdown of days worked, overtime, deductions, net pay.
11. **Worker-facing site-state change push** when a worker's next-shift site changes state.
12. **Year-end / on-request records export** for the worker.

## Was the updated design actually followed consistently?

**The design holds where it speaks; it doesn't speak much to the worker.**

Where the design does speak about workers — leave-request initiator role (E21), replacement-invite candidate (F28), termination subject (E24) — the design treats the worker as a row in someone else's transaction, not as a user with a surface. The HR Updates audience model explicitly excludes workers. Pick 5 explicitly pushes only the acting supervisor. The "while you were out" digest is explicitly supervisor-only.

These are not implementation lags. They are workflow-design choices that, if shipped as-is, produce a worker product that's a thin shadow of the supervisor product. The audit's load-bearing finding from a year of Suresh's lived workflow simulation: **the worker side is mostly `[MISSING]` because the design itself does not yet model the worker as a primary actor with their own surface, their own awareness, or their own consequence-visibility**. Closing those gaps is workflow-design work; the implementation status is downstream of decisions the design hasn't yet made.

---

## Worker-side switching coverage appendix

Strict file-grounded check 2026-05-15 against the 6 workflow-bearing specs touched in the last 2 days surfaced the worker-side switching cases. The Ravi audit's switching appendix points to this file as primary owner of the worker-side dimension of supervisor switching. Cases owned by other files are listed for traceability.

### Switching cases covered in this file

| Case                                                                                                          | Source                                    | Scene                           |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- |
| W-1 — worker awareness when acting coverage starts                                                            | RM §5.5 pick 5                            | Month 8                         |
| W-2 — worker awareness when acting window ends                                                                | RM §5.6 + ops §7.10                       | Month 8                         |
| W-3 — worker awareness under permanent reassignment                                                           | RM §3.2 + ops §7.11                       | Month 9                         |
| W-4 — worker visibility into decisions about them (absent / FLAG / suspension / termination / audit reversal) | ops §7.1, §7.4, §7.5, §7.12               | Day 3, Day 4, Month 7, Month 11 |
| W-5 — worker-side leave-request status visibility                                                             | ops §7.2 + outbox `worker.leave_approved` | Week 2 + Month 6                |
| W-6 — worker-side replacement-invite respond                                                                  | D.1 §2.8 + ops §7.9                       | Day 7                           |
| W-7 — trust transition / authority awareness during handoffs                                                  | implicit (no spec content)                | Month 8 + Month 9               |
| W-8 — decision continuity as subject across a supervisor switch                                               | RM §5.4 + ops §7.7                        | Month 11                        |

### Switching cases owned by Ravi's audit (supervisor lens)

F26.1 / F26.2 / F26.3 / F26.4 / F26.6 / F26.7 / F26.8 / F26.9 / F26.12, F27.1 / F27.4 / F27.5, C-7.4 / C-7.5 / C-7.6 / C-7.7a / C-7.7b / C-7.9 / C-7.12a, G-9 — see Ravi's switching coverage appendix at `2026-05-14-1yr-sim-supervisor-ravi.md`.

### Switching cases owned by Kavitha's audit (HR control-plane lens)

F26.10 (acting refuses / is also absent), F26.11 (HR wrong-reassignment correction), F27.6 orchestration side, F27.7 (HR absent during permanent reassignment), F27.8 / G-5 (bootstrap-seed correction), G-1 (HR absent fallback), G-4 (wrong-reassignment audit-chain UX).

### Switching cases owned by the Combined audit (overlap stress + races)

F26.5 (no-overlap acting+acting violation), F27.2 (switch-all under live churn), F27.3 (no-overlap permanent+permanent violation), C-7.3 (swap initiated then supervisor absence), C-7.8 (HR Update ack during supervisor absence — explicit open question), C-7.12b (termination during HR absence stalls), G-3 (acting-applied decision original disagrees with), G-6 (cross-supervisor team view), G-7 (site-level HR Updates routing), G-10 (FLAGGED auto-escalate during absence).

### Cases that remain genuinely open in the specs

These have no Active spec answer yet — flagged where they surface in this audit and deferred for explicit founder review:

- G-1 HR absent fallback (ops §12 #1)
- G-2 / C-7.8 HR Update ack during supervisor absence (ops §12 #2)
- G-3 acting-applied decision original disagrees with — formal-correction UI deferred
- G-4 wrong-reassignment correction audit-chain UX
- G-5 bootstrap-seed correction surface
- G-6 cross-supervisor team view
- G-7 site-level HR Updates routing
- G-9 DWI EXPIRED threshold (ops §12 #3)
- G-10 FLAGGED auto-escalate threshold (ops §12 #4)
- Worker app surface scope (ops §12 #6) — implicit umbrella under which W-1 through W-8 sit

---

_End of Round 2 — Suresh audit (Methodology v2 revision + explicit worker-side switching coverage). Rounds 3–5 (Kavitha, Reddy, Combined) not written; each is a separate plan-mode pass under the same locked methodology._
