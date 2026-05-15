---
Status: Audit draft
Type: 1-year persona simulation audit (Round 5 of 5 — Combined / system)
Personas: All 4 — Reddy (OWNER) · Kavitha (HR) · Ravi (SUPERVISOR) · Suresh (WORKER)
Scale: Surya Cleaning at ~5,000 employees / ~100 supervisors / 5 HR users / ~30+ sites
Primary lens: docs/specs/2026-05-14-supervisor-responsibility-model.md (Active 2026-05-14)
Secondary lenses: 2026-05-14-operations-workflow-model.md, 2026-05-12-decision-entity-lock.md (D.1), 2026-05-12-hr-updates-spec.md, 2026-05-13-product-framing.md
Per-persona files (locked inputs): docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md · 2026-05-14-1yr-sim-worker-suresh.md · 2026-05-15-1yr-sim-hr-kavitha.md · 2026-05-15-1yr-sim-owner-reddy.md
Not added to: docs/index/canonical-truth.md (audit, not a governing spec)
Plan: /Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md
---

# Combined Audit — 1-Year System Simulation (All 4 Personas, 5K-Scale Surya)

## Cast at 5K-scale

- **Reddy (OWNER)** — Surya founder; hands-off; WhatsApp + Telugu primary.
- **Kavitha (HR lead)** + 4 colleagues: **Anita** (payroll), **Vikram** (onboarding), **Priya** (compliance), **Deepak** (general queue).
- **Ravi (SUPERVISOR)** — 40 workers / 8 sites at year start; ends with 5 sites. Peers in audit: **Lakshmi** (acting cover during sick week), **Anjali** (new hire ramping up), **Supervisor-X** (Lakeview seed dispute), **Supervisor-Y** (Month 11 quitter).
- **Suresh (WORKER)** at Lakeview Mon–Sat. Supporting workers: **Mahesh** (Manikonda; terminated Month 11), **Bhanu** (multi-site), **Joseph**, **Krishna**, **Ramu**, **Mehmood**.
- ~96 other supervisors operating in parallel across the company; ~5,000 other workers; ~30+ other sites.

## Audit method (v2 — silent reuse)

8-element scene pattern (Workflow / Trigger / Actors+authority / Lived experience / Pressure-overlap-failure / Outcome / Impl status / Takeaway). `[MISSING]` = workflow-design gap, not code gap. Workflow design judged first; implementation status is a one-line footnote. Layer labels and Takeaways preserved.

## What this file uniquely covers

Per-persona files exercise individual workflows from one persona's perspective. This file's payload is what happens when **multiple workflows + multiple personas + 5K-scale conditions overlap in the same hour or week**:

- **Multi-workflow overlap scenarios** (6 named scenes — the centerpiece)
- **Cross-persona handoff timeline** (Gantt-style — who hands what to whom at the major events)
- **Authority-chain breakage at scale** (where the "exactly one effective responsible supervisor per site" promise produces broken human outcomes)
- **Spec coverage matrix** (29 workflows × 4 persona files; what's exercised where)
- **HR control-plane saturation** + **notification-noise budget at scale**
- **Open-gap severity classification** (dangerous vs annoying vs unclear)

---

## Spec coverage matrix (29 workflows × 4 persona files)

Legend: ✅ explicit scene · ⚠️ partial / by implication · — workflow does not naturally touch this persona

| #   | Workflow                         | Reddy                | Kavitha                         | Ravi                                                               | Suresh                    |
| --- | -------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------ | ------------------------- |
| A1  | OTP login                        | ✅ Day 1             | ✅ Day 1                        | ✅ Day 1                                                           | ✅ Day 1                  |
| A2  | JWT refresh / role select        | —                    | —                               | ⚠️ implicit                                                        | ⚠️ implicit               |
| A3  | Worker invitation → activation   | ⚠️ digest            | ✅ Days 2–4                     | ✅ Day 5                                                           | ✅ Day 1 (classification) |
| A4  | Worker doc collection → ACTIVE   | ⚠️ digest            | ✅ Days 2–4                     | ✅ Day 5                                                           | ✅ classification         |
| B5  | Site creation                    | —                    | ⚠️ one-time (no explicit scene) | ⚠️ readonly view at Day 5 (consumer side only — not site creation) | —                         |
| B6  | Site state transitions           | ✅ Month 5 (digest)  | ✅ Month 5                      | ✅ Month 5                                                         | ✅ Month 5 (via Mahesh)   |
| B7  | Calendar entry creation          | —                    | —                               | ✅ Week 2                                                          | —                         |
| B8  | Calendar → Assignment promotion  | —                    | —                               | ✅ Week 2 + 8h                                                     | —                         |
| B9  | Direct assignment creation       | —                    | ⚠️ rare                         | ✅ Week 4                                                          | ⚠️ via Day 7              |
| B10 | Conflict detection at assignment | —                    | —                               | ✅ Week 4                                                          | —                         |
| C11 | Mark worker absent               | —                    | —                               | ✅ Day 2                                                           | ✅ Day 3                  |
| C12 | Visit lifecycle                  | —                    | —                               | ✅ Day 4                                                           | ✅ Day 2                  |
| C13 | Site complaint logging           | ✅ Month 5 (digest)  | ⚠️ via queue                    | ✅ Week 2                                                          | —                         |
| C14 | Visit photo verification         | —                    | —                               | ✅ Day 4                                                           | ✅ Day 4                  |
| C15 | Audit reversal (30-min)          | —                    | ⚠️ Month 6 retroactive          | ✅ Day 2                                                           | ✅ Day 3                  |
| D16 | AI chat → decision extraction    | —                    | —                               | ✅ Day 2                                                           | —                         |
| D17 | Decision apply                   | —                    | ⚠️ sees results                 | ✅ Day 2                                                           | ✅ Day 3 (subject)        |
| D18 | Decision dismiss / undo          | —                    | —                               | ✅ Day 7                                                           | —                         |
| D19 | Option-picker decision           | —                    | —                               | ✅ Day 7                                                           | —                         |
| D20 | EMPLOYMENT-tier ack              | ✅ Month 11 (digest) | ✅ Months 7 + 11                | ✅ Months 7 + 8d                                                   | ✅ Month 11 (Mahesh)      |
| E21 | Leave request workflow           | ✅ Month 11 (digest) | ✅ Days 2–4 + Months 2/6/10     | ✅ Day 3 + Months 3/6                                              | ✅ Week 2                 |
| E22 | Worker swap request              | —                    | ⚠️ sees in feed                 | ✅ Month 6.5                                                       | ✅ classification         |
| E23 | HR Update post                   | ✅ Month 1 (digest)  | ✅ Days 2–4 + Months 2/10       | ✅ Day 5 + Week 3 + 8j                                             | ✅ Day 5                  |
| E24 | Worker termination               | ✅ Month 11 (digest) | ✅ Month 11                     | ✅ Months 7 / 8d / 11                                              | ✅ Month 11 (Mahesh)      |
| E25 | Worker suspension / block        | ✅ Month 11 (digest) | ⚠️ approves                     | ✅ Month 6.5                                                       | ✅ Month 7 (Mahesh)       |
| F26 | Acting supervisor coverage       | ✅ Month 8 (digest)  | ✅ Month 8                      | ✅ Month 8 cluster + 8f–8l                                         | ✅ Month 8 (headline)     |
| F27 | Permanent portfolio reassignment | ✅ Month 11 (digest) | ✅ Months 9 + 11                | ✅ Months 9 + 11                                                   | ✅ Month 9                |
| F28 | Replacement invite (worker)      | —                    | ⚠️ via queue                    | ✅ Day 2 + Month 2 + 8g                                            | ✅ Day 7                  |
| G29 | AI budget alerts + cron reset    | ✅ Months 3 + 6 + 12 | ⚠️ aware                        | —                                                                  | —                         |

**Matrix verdict:** 27 of 29 workflows exercised explicitly in at least one persona file. The 2 implicit-only (A2 JWT refresh, B5 site creation) are appropriately background mechanics. Most workflows surface in 2+ persona files — which is what makes the overlap scenarios below load-bearing.

---

## Cross-persona handoff timeline (Gantt-style)

| Date         | Event                             | Reddy                                | Kavitha                                   | Ravi                                        | Suresh                           |
| ------------ | --------------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------- | -------------------------------- |
| Day 1        | Migration day                     | Bank confirm via WhatsApp screenshot | Bootstrap-seed review starts (no UI)      | Portfolio inherited; Lakeview seed-disputed | Install + blank home             |
| Day 2        | First absence                     | —                                    | —                                         | Voice → 2 decisions + reverse               | Marked absent while present      |
| Day 5        | First HR Update                   | —                                    | Posts via curl                            | Acks in own voice                           | Hears via Ravi's WhatsApp        |
| Week 4       | First payroll close               | —                                    | Excel + Tally + Axhy reconciliation       | —                                           | Bank SMS, no app trace           |
| Day 38       | Monsoon flu wave                  | —                                    | First multi-HR collision                  | 14 decisions burst + 3 retries silent       | Double shift, no in-app trace    |
| Day 90       | Bootstrap-seed conflict surfaces  | —                                    | Reconstructs via SQL                      | Authored 3 Lakeview decisions; immutable    | —                                |
| Day 120      | Kavitha at wedding                | Routing change via Akshay DB         | OUT (no fallback)                         | —                                           | —                                |
| Day 150      | Vasanth Vihar auto-suspends       | One-line digest                      | Email digest morning after                | Sees badge on Today next morning            | Mahesh turned away at site       |
| Day 180      | HR queue saturation peak          | —                                    | Krishna's request sits                    | Marks Krishna absent                        | Krishna doesn't show             |
| Day 210      | Mahesh termination proposed       | —                                    | Sits 4 days                               | Types phrase                                | Mahesh oblivious                 |
| Days 220–234 | Ravi sick week                    | —                                    | Creates F26 (with H-3 correction)         | Empty Today + sick-author + 8f–8l           | Lakshmi via WhatsApp             |
| Days 248–280 | Anjali ramp-up                    | —                                    | F27 + 3 parallel rebalances               | Loses 4 sites silently                      | Mehmood (Manikonda) via WhatsApp |
| Day 295      | Diwali week                       | One-line digest                      | Queue spike repeat (no learning loop)     | 12+ decisions; one 9-row batch              | Diwali OT via WhatsApp           |
| Day 320      | Mahesh apply + Supervisor-Y quits | One-line digest                      | Curl ack + phone call + 8 manual bindings | Origin of termination; inherits 3 sites     | Mahesh learns by phone           |
| Day 365      | Year-end                          | Annual renewal via Akshay slide      | Year-end true-up still on Excel           | Steady 5-site rhythm                        | Blank home year-end              |

---

## Multi-workflow overlap scenarios

### Overlap Scenario 1 · [Layer 2] · Diwali week — festival-scale stack across all personas

- **Workflow cluster:** E21 leave + F28 replacement + D16 chat extraction + E23 HR Updates + D20 EMPLOYMENT + H-9 multi-HR coordination, all stacked.
- **Trigger:** Day 295 — Diwali. ~250 leave requests across Surya in 5 days. ~40 active acting-coverage windows already running. 3 EMPLOYMENT-tier reviews waiting in HR queue. Festival-bonus eligibility HRUpdate due.
- **Actors per persona at the moment of collision:**
  - **Suresh:** Lakeview Tower 7am. Ravi WhatsApps 6-hour overtime offer; agrees. He sees nothing about the company-wide festival in any in-app surface.
  - **Ravi:** 12+ proposed rows in Decisions tab; one 9-row compound batch with no batch-lineage signal; Joseph's leave sits 48 hours unapproved (Kavitha's queue depth invisible to Ravi).
  - **Kavitha:** 250 leave requests across the company in 5 days. She + Anita + Priya + Deepak coordinate via Gmail. Two collisions like Month 2 occur, noticed late. She defers Joseph's leave because two EMPLOYMENT-tier reviews "feel more important" — no spec content actually says they are.
  - **Reddy:** Monthly digest at month-end: "Festival week — 250 leaves, AI spend at 85% of cap." He WhatsApps Akshay: "boss problem hai?" Akshay says no.
- **Pressure / overlap / failure:** AI chat extraction backlog lags 6+ minutes for some supervisors. Push notification volume spikes (~40 windows × per-binding pushes). HR-Updates feed adds a festival update on top of regular noise. No spec content on triage signals; no spec content on multi-HR coordination at this scale; no spec content on AI backlog visibility.
- **Outcome judgment:** `[BROKEN]` — design's HR-instant + AI-instant assumptions both fail under festival scale. `[MISSING]` — multi-HR triage model, AI backlog signaling, festival-mode behavior all absent in design.
- **Implementation status:** Routes exist; coordinated stress-handling surface absent.
- **Takeaway:** A single festival week exposes 4 design silences at once — HR triage, multi-HR coordination, AI backlog signaling, festival-scale behavior — none addressed in any spec.

### Overlap Scenario 2 · [Layer 2] · Monsoon morning across 12 supervisor portfolios

- **Workflow cluster:** C11 mark-absent + F28 replacement-invite + D16 AI extraction + multi-site worker leave semantics (Day 3 Bhanu gap).
- **Trigger:** Day 38, 6:15am. Monsoon flu wave. Ravi has 7 absences across 3 sites; ~11 other supervisor portfolios have similar bursts company-wide.
- **Actors at the moment of collision:** All ~12 affected supervisors mic-capturing simultaneously. AI extraction pipeline queued behind them. 100+ replacement-invite candidates being TTL-clocked in parallel.
- **Lived overlap:**
  - 11 of 12 supervisors see their retries appear delayed 6+ minutes after voice memos. 3 retries fail silently at the AI layer.
  - One of Ravi's absent workers is Bhanu (multi-site Lakeview / Manikonda). The leave-cascade design covers his primary-site shift only; his secondary-site shift produces a silent no-show 4 hours later (Day 3 design gap surfacing in Day 38 scale).
  - Replacement-invite 2-min TTL on slow-network phones during monsoon weather: a few candidates miss the window and the design assumes they declined.
- **Pressure / overlap / failure:** Burst-scale AI backlog with no visibility signal; multi-site worker leave semantics produce silent gaps under burst conditions; TTL-vs-network-quality interaction not modeled.
- **Outcome judgment:** `[BROKEN]` — design's per-supervisor view of mass-absence morning doesn't account for company-scale AI contention; multi-site worker rule produces silent gaps; TTL design ignores network variance.
- **Implementation status:** AI pipeline + invite TTL present; backlog visibility + multi-site semantics + network-adaptive TTL absent in design.
- **Takeaway:** Mass-absence morning at company scale collides three design assumptions simultaneously.

### Overlap Scenario 3 · [Layer 1+2] · Sick-week ending + Anjali ramp-up beginning (Days 234–280)

- **Workflow cluster:** F26 ending (Lakshmi steps down) + F27 progressing (Anjali takes Ravi's sites) + LivingDoc handoff silence + multi-supervisor rebalance overlap.
- **Trigger:** Day 234 — Ravi's acting window auto-ends. Day 248 — Kavitha begins moving Manikonda + Banjara to Anjali. Meanwhile Anita is rebalancing 2 other supervisors' portfolios in parallel (overload relief).
- **Authority sequence on Banjara Hills (one Ravi site):** Ravi (permanent) → Lakshmi (acting Days 220–234) → Ravi (permanent, Day 234) → Anjali (permanent, Day 248). In 28 days, 3 distinct supervisors had authority.
- **Lived collision:** A complaint Lakshmi logged Day 228 about Banjara needs follow-up Day 250. Anjali (newly responsible) opens Activity; she sees the complaint row but cannot follow up because her view starts at the binding handoff (Ravi audit Month 9 — site-handoff context absent). She rediscovers the complaint cause by talking to a worker at the site, who tells her "Lakshmi madam ne report ki thi."
- **Worker side:** Mehmood at Manikonda sees four supervisors' WhatsApp introductions in 28 days (Ravi sick → Lakshmi → Ravi back → Anjali). Suresh-style W-1/W-2/W-7 silence compounded.
- **Pressure / overlap / failure:** Nested supervisor changes within a month produce a site-context black hole. The audit chain records the sequence but doesn't narrate it.
- **Outcome judgment:** `[MISSING]` — site-handoff context migration across nested supervisor changes is absent in design (Ravi Month 9 + Kavitha Month 9 + Suresh Month 9 all surface the same gap from their angle). `[CONFUSING]` — audit chain present, narrative reconstruction absent.
- **Implementation status:** Binding-event audit rows present; narrative reconstruction UX absent.
- **Takeaway:** Workflows that span multiple supervisor handoffs in a month lose context at every transition because the design models bindings but not continuity.

### Overlap Scenario 4 · [Layer 1+2] · HR-absent + EMPLOYMENT-tier in queue + acting cover on the other end

- **Workflow cluster:** G-1 HR-absent fallback + E24 EMPLOYMENT-tier stall + F26 active cover.
- **Trigger:** Day 120 — Kavitha at Reddy's family wedding (Friday–Sunday). Same Friday evening, a supervisor on her own sick-week acting-cover (call her Sup-Z) proposes an EMPLOYMENT-tier termination via her acting authority. The PROPOSED row goes to HR queue.
- **Actors at collision:** Sup-Z (acting cover, proposing). Anita (HR colleague, can approve leaves but not EMPLOYMENT per ops §7.12 "HR absent: terminations stall"). The subject worker (oblivious). Kavitha (unreachable). Reddy (could theoretically inherit per G-1 owner-inheritance option — but G-1 is un-picked, so the route auth would refuse him anyway).
- **Lived experience:** Friday 6pm row lands. Saturday Anita sees it; can't act. Sunday: still nothing. Sup-Z WhatsApps Kavitha's cell: "boss, kab tak lagega?" Kavitha responds Monday 6am: "wait, I'll review when I'm back." Decision sits 72 hours. The acting supervisor proposed it with full context; by the time it ascends Kavitha's queue Monday afternoon, Sup-Z is overdue to step down (her sick supervisor returned Sunday) — origin attribution + actor change.
- **Pressure / overlap / failure:** G-1 unpicked means no fallback; EMPLOYMENT-tier-in-queue stalls; the originating actor's authority is itself transient. The workflow design has no answer for any of these layered conditions.
- **Outcome judgment:** `[BROKEN]` — 72-hour stall on a worker's employment status with no fallback design at any layer.
- **Implementation status:** Open per ops §12 #1.
- **Takeaway:** HR-absent + EMPLOYMENT-tier-in-queue + acting-cover-rotation is the most operationally damaging cross-workflow case the spec has not picked an answer for.

### Overlap Scenario 5 · [Layer 1] · Bootstrap-seed wrong-owner ages into operational conflict (Day 1 → Day 90)

- **Workflow cluster:** H-6 bootstrap-seed review + G-4 audit-chain reconstruction + origin-attribution immutability.
- **Trigger:** Day 1 — Lakeview Tower was informally split between Ravi and Supervisor-X; seed picked Ravi by `createdAt` heuristic. Day 90 — Supervisor-X surfaces it via WhatsApp to Kavitha: "Lakeview mein mere bhi workers the, kuch confusion hai."
- **Actors at collision:** Ravi (has authored 3+ Lakeview decisions in months 1–3 — 2 mark-absents + 1 leave approval + 1 photo-flag resolution). Supervisor-X (the displaced-but-silent-loser). Kavitha (the seed-review owner who never finished reviewing because the affordance didn't exist). Workers at Lakeview (some originally Supervisor-X's contacts; now operationally Ravi's).
- **Lived collision:** Per RM §4, origin attribution is immutable. The 3+ Lakeview decisions Ravi authored stay attributed to him. Question: should they have been Supervisor-X's? Pick 8 explicitly said "BOOTSTRAP_SEED — pending HR review" — but the review never happened. Now Kavitha has to triage: how many decisions were affected? Were any workers treated unfairly under the wrong supervisor? G-4 audit-chain reconstruction UX is deferred — she has no surface to triage this.
- **Pressure / overlap / failure:** Day-1 design gap (no seed-review affordance) becomes an aged operational conflict by Day 90 because the spec didn't model a deadline on the "pending HR review" state. The conflict has compliance implications (labor records correctness) and trust implications (Supervisor-X's standing).
- **Outcome judgment:** `[BROKEN]` — bootstrap-seed wrong-owner cases age into compliance risk without any reconstruction or remediation surface. `[MISSING]` — G-4 audit-chain reconstruction UX; G-5 seed-correction affordance.
- **Implementation status:** Seed mechanism present; review affordance + audit-chain reconstruction absent.
- **Takeaway:** A Day-1 heuristic with no review deadline becomes a Day-90 compliance question with no reconstruction surface — the audit chain holds the data but provides no answer.

### Overlap Scenario 6 · [Layer 1+2] · Mahesh's termination across F26 + F27 + queue saturation (Day 210 → Day 320)

- **Workflow cluster:** D20 EMPLOYMENT-tier ack + F26 (acting cover changes proposer authority mid-flow) + F27 (binding moves subject's site mid-flow) + H-7 HR-pending visibility + W-4 + W-8 worker-side experience.
- **Trigger:** Day 210 — Ravi proposes Mahesh's termination (Manikonda worker). It sits 4 months in HR queue while:
  - Days 220–234: Ravi sick week (acting cover Lakshmi technically inherits the proposed row for routing purposes); not acted because EMPLOYMENT-tier requires HR.
  - Days 248–280: Manikonda permanently reassigns to Anjali (F27). Subject's responsible-supervisor changes mid-proposal-pending.
  - Day 320: Kavitha finally types HR ack. APPLIED.
- **Authority sequence on the Mahesh decision row:**
  - Origin attribution: Ravi (Day 210) — immutable.
  - Routing (read-time JOIN) during sick week: Lakshmi (Days 220–234) — would have routed there if she'd acted; HR-pending so she didn't.
  - Routing after Day 248: Anjali (current responsible for Manikonda) — would route there now; still HR-pending.
  - Actor at apply (Day 320): Kavitha (HR).
- **Lived experience across personas:**
  - **Mahesh (subject):** Zero in-app trace across 110 days. Calls from Ravi about suspension (Day 195), nothing until phone call from Kavitha Day 320 announcing termination + final settlement.
  - **Ravi (originator):** Sees row in his Activity (he proposed it); no surface for "pending HR position N"; surface he expects (Decisions tab) doesn't show post-routing rows during his sick week; on return he can't tell whether his proposal was acted, dismissed, or still pending without scrolling Activity.
  - **Anjali (post-binding current responsible):** Inherits a PROPOSED termination on a worker she's never met. She doesn't see Ravi's proposing context; no decision-support surface (Kavitha Month 7 H-7 gap).
  - **Kavitha (final actor):** Types phrase via curl. She doesn't see Ravi's chat context. She doesn't see Mahesh's full history without separate queries. Acks on intuition + Ravi's typed phrase + her vague recollection of the case.
  - **Reddy:** One-line in monthly digest.
- **Pressure / overlap / failure:** A single EMPLOYMENT-tier decision traverses 3 supervisor states + a 4-month queue + 4 personas with zero in-system narrative. The audit chain is correct; the human consequence is that the most consequential workflow in a worker's year runs through phone calls and SQL.
- **Outcome judgment:** `[BROKEN]` — design correctly routes data through binding changes, but the human consequences (subject's zero in-app trace; inheriting supervisor's zero context; final actor's zero decision-support; originator's zero status visibility) are all design-silent.
- **Implementation status:** Apply path + binding routing + audit chain all correct in design + partly implemented. Surfaces for the human consequences absent.
- **Takeaway:** The decision spans 4 months, 3 supervisors, 4 personas — and the design speaks to none of the human transitions in between origin and apply.

### Overlap Scenario 7 · [Layer 2] · No-overlap invariant violation attempts at company scale (F26.5 + F27.3)

- **Workflow cluster:** F26.5 same-kind acting-window overlap + F27.3 same-kind permanent overlap, both attempted under multi-HR coordination at scale.
- **Trigger:** Diwali week (HR queue saturated, 5 HR users acting in parallel without partitioning).
- **F26.5 case:** Kavitha is setting up Lakshmi as acting cover for Supervisor-P (sick). At the same moment, Anita — handling another sick supervisor's relief and unaware of Kavitha's in-progress action — attempts to assign Priya-as-supervisor as acting cover for one of Supervisor-P's sites. The DB EXCLUDE constraint refuses Anita's INSERT.
- **F27.3 case:** Earlier the same week, Kavitha + Anita both attempt to permanently reassign Site Q simultaneously to different supervisors (their Gmail threads had crossed). DB EXCLUDE refuses the second INSERT.
- **Actors at collision:** Kavitha + Anita (HR colleagues, both with binding-write authority). The DB constraint. The supervisor target of the refused INSERT (Priya / Anjali respectively) sees nothing — Anita's attempted push to her didn't happen.
- **Lived experience:** Anita sees a generic 409 error. She doesn't see what site conflicts with what, or who else just wrote. She WhatsApps Kavitha: "boss, kuch error aaya, dekho." 3 messages later they sort it out manually.
- **Pressure / overlap / failure:** The structural promise of "exactly one effective responsible supervisor per site" is preserved by the DB constraint. The human consequence — Anita's wasted attempt, the unclear failure, the WhatsApp back-and-forth — has no design.
- **Outcome judgment:** `[WORKS]` for the no-overlap invariant — DB EXCLUDE catches both races correctly. `[MISSING]` for the user-facing race-resolution UX — Anita gets a generic 409 with no context on what conflicts.
- **Implementation status:** EXCLUDE constraint lands P1.5; constraint-failure UX absent in design.
- **Takeaway:** The no-overlap invariant is structurally upheld; the moment-of-collision experience for the losing HR user is design-silent and runs on WhatsApp.

---

## Authority-chain breakage points at scale

The responsibility model's "exactly one effective responsible supervisor per site at any moment" promise holds at the data layer. The breakages live at the workflow-design layer. Listed by severity.

| Breakage                                                                                                               | Where it surfaces                                  | Severity                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sick supervisor authors decisions for sites he no longer controls — produces wrong work for acting cover               | Ravi Month 8c + Combined Scenario 4                | **Dangerous** — acting cover makes EMPLOYMENT-tier acks on workers she barely knows                  |
| EMPLOYMENT-tier proposal traverses 3+ supervisor states between propose and apply                                      | Combined Scenario 6 (Mahesh)                       | **Dangerous** — worker subject's most consequential workflow + Kavitha acks without decision-support |
| Wrong-binding correction has no audit-chain reconstruction; affected supervisor gets a silent push storm               | Kavitha Month 8 (Anjali→Lakshmi switch)            | **Annoying-to-Dangerous** depending on frequency                                                     |
| Multi-HR race on overlapping reassignments — DB catches it; UX is generic 409                                          | Kavitha Month 9 + Combined Scenario 3 hint         | **Annoying** for HR; **Dangerous** if it causes them to abandon a needed change                      |
| Bootstrap-seed wrong-owner ages into operational conflict; immutable origin makes retroactive reattribution impossible | Combined Scenario 5                                | **Dangerous** — compliance / labor record correctness                                                |
| Worker-side silence on supervisor change (start / end / permanent)                                                     | Suresh Month 8 + Month 9 + Combined Scenarios 3, 6 | **Dangerous** — trust erosion + worker churn                                                         |
| Decision-continuity-across-switch as worker subject — outcome lands without subject ever seeing the process            | Suresh Month 11 + Combined Scenario 6              | **Dangerous** — labor law + records correctness                                                      |

---

## HR control-plane saturation (cross-persona view)

Kavitha's audit details the saturation from inside HR. The combined view: HR saturation isn't an HR problem — it produces cascading consequences in every persona file.

- **Suresh's side** (Month 6 + Diwali): workers wait at home or commute to shifts that need approval; Krishna missed Saturday because Kavitha was buried; the worker absorbs the saturation as lost wages.
- **Ravi's side** (Month 6 + Month 7): supervisor has no in-app visibility into HR queue depth; Joseph's leave + Mahesh's termination both wait without explanation.
- **Reddy's side** (Month 6): saturation never reaches him as a signal; Kavitha's digest mentions her workload obliquely if at all.
- **Kavitha's side**: she sees the depth but has no triage signal — no urgent flag, no SLA timer, no priority ordering.

The design treats HR as instant. At 5K-scale with 5 HR users sharing one unpartitioned queue, that assumption fails by Month 2 and never recovers.

## Notification-noise budget at scale

At any given moment, Surya at 5K-scale has roughly:

- ~20 active acting-coverage windows
- 4 in-progress permanent reassignments
- 50+ in-flight replacement invites (2-min TTL each)
- 200+ open PROPOSED decisions across supervisors
- 5–10 leave requests landing per day
- 1–3 HR Updates posted per week

The push design (pick 5 per-binding, no coalescing; HR Updates broadcast to all supervisors; AI budget alerts to owner) produces a notification volume that is:

- **For supervisors:** ~10–30 pushes per day in steady state, spiking to 50+ during company-wide events. No filter, no priority signal.
- **For workers:** essentially zero (audience model excludes them).
- **For HR users:** zero in-app (they live on email / WhatsApp / DB).
- **For owner:** ~1 per week (AI budget) in steady state.

The asymmetry is the design: supervisor surface gets all the noise; the persona who could most use signal (worker) gets none.

---

## Open-gap severity classification

### Dangerous (will cause operational, legal, or trust damage at 5K-scale if shipped as-is)

- **G-1 HR-absent fallback** (un-picked) — Kavitha PTO produces 72-hour stalls (Combined Scenario 4).
- **Multi-HR coordination model** (spec silence) — silent duplicate approvals and race losses (Kavitha Months 2 + 9 + 10).
- **HR queue priority/SLA signals** (spec silence) — workers stranded under load (Combined Scenario 1 + 4).
- **Worker-side notification on supervisor change** (W-1 / W-2 / W-3 / W-7 silence) — trust transition runs through WhatsApp; high worker-churn risk (Suresh Month 8 + Month 9).
- **Worker-side termination notification + records access** (W-4 termination subcase) — labor law exposure; Mahesh learns by phone (Combined Scenario 6).
- **Bootstrap-seed correction surface** (G-5) — Day-1 wrong-owner ages into compliance risk (Combined Scenario 5).
- **Audit-chain reconstruction UX** (G-4) — wrong-reassignment + bootstrap-seed conflict can't be triaged without it.
- **Bank-change / tenant-settings surface for owner** (Reddy Month 4) — single-point-of-failure on Akshay's DB access.
- **HR-as-instant design assumption** — produces lossy outcomes under sustained load; not an open-question, an unmodeled invariant.
- **EMPLOYMENT-tier across binding changes** (Combined Scenario 6) — typed-phrase gate dilutes; HR has no decision-support; worker subject has zero trace.

### Annoying (operational friction; not damaging)

- Reverse window 30-min vs 5-min contradiction (R6 §4 #1) — pick one and update the other doc.
- "I'm done for today" dead button (Ravi Month 12) — design says drop; remove it.
- "Atomic batches" Summary label vs batch-grouping-only resolution.
- 8 pushes vs coalesced push for multi-site acting binding.
- Activity feed mixing operational + binding events.
- AI budget alert plain-English framing.
- Calendar kind not surfaced on Today.
- Year-end records export for workers.

### Unclear (depends on policy decisions not yet made; severity follows the pick)

- **G-2 / C-7.8 HR Updates ack during supervisor absence** — two paths named; neither picked.
- **G-9 DWI EXPIRED threshold** — 24h? 7d? per-kind?
- **G-10 FLAGGED visit auto-escalate threshold.**
- **G-6 cross-supervisor team view** — design product question.
- **G-7 site-level HR Updates routing** — design product question.
- **Owner-inheritance option for G-1** — one of three named fallbacks; pick or kill.
- **Multi-site worker leave semantics** — does a leave cover all that day's shifts or only primary?

---

## What worked (workflow-design judgments — combined view)

- Origin attribution + read-time routing produces correct historical attribution across every binding change tested (Ravi Months 8/9/11; Combined Scenario 6).
- Same-kind binding overlap prevention works structurally (DB EXCLUDE constraint catches multi-HR race in Combined Scenario 3 hint).
- Auto-revert on acting-coverage closes cleanly without manual cleanup (Ravi Month 8e).
- The 30-min reverse window catches genuine same-day errors at the local supervisor level.
- AI chat extraction is reliable when not under burst load.
- Tier grouping on Decisions tab holds at Diwali volume.

## What became confusing (cross-persona)

- Activity feed scan-cost at scale (all personas with the feed).
- Push notification volume + asymmetry (supervisor gets all of it; worker gets none).
- HR queue triage from every angle — Kavitha can't see priority, Ravi can't see depth, Suresh sees only outcomes, Reddy sees nothing.
- Empty Today during acting absence (Ravi sick week).
- Worker-side silence on supervisor change (Suresh Months 8–9).

## What broke (cross-persona)

- HR-as-bottleneck design produces lossy worker outcomes (Combined Scenario 1 + 4).
- Multi-HR coordination silence produces silent collisions (Combined Scenario 1 + 6).
- Bootstrap-seed wrong-owner cases age into compliance risk (Combined Scenario 5).
- Sick supervisor authoring decisions for sites he no longer controls produces wrong work for acting cover (Combined Scenario 6).
- Worker-side absence of design for termination, supervisor change, dispute (Suresh + Combined).

## What is missing in design (cross-cutting design gaps that affect 2+ persona files)

| Gap                                                         | Persona files where it surfaces                   |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Multi-HR coordination model                                 | Kavitha + Combined                                |
| HR queue triage signals (urgent / SLA)                      | Kavitha + Ravi + Suresh + Reddy                   |
| Worker-side supervisor-change notification                  | Ravi (acknowledges) + Suresh (primary) + Combined |
| Worker-side termination notification + records              | Suresh (primary) + Combined                       |
| Bootstrap-seed correction affordance                        | Kavitha + Ravi + Combined                         |
| HR-absent fallback (G-1 pick)                               | Kavitha + Reddy + Combined                        |
| Audit-chain reconstruction UX (G-4)                         | Kavitha + Combined                                |
| Owner digest spec + KPI surface                             | Reddy (entire) + Combined                         |
| Site-handoff context migration (LivingDoc, complaints)      | Ravi + Suresh + Combined                          |
| EMPLOYMENT-tier decision-support for HR ack-er              | Kavitha + Combined                                |
| HR-as-instant assumption (queue model under sustained load) | Kavitha + Ravi + Suresh + Combined                |
| AI backlog visibility under burst                           | Ravi + Combined                                   |

## What should change before implementation (ranked by cross-persona impact)

1. **Multi-HR coordination model.** Queue partition + lock semantics + role subtypes. The single biggest 5K-scale operational risk. Affects 4 persona files.
2. **HR-absent fallback pick (G-1).** Owner-inherits / second-HR / queue-with-SLA. Pick one. Affects 3 persona files.
3. **HR queue triage signals.** Urgent flag, SLA timer, age-based escalation, priority rendering. Affects 4 persona files.
4. **Worker-side surfaces cluster.** Home shell + supervisor-change notification + termination notification + leave status + replacement-invite respond. Suresh's W-1 through W-8. Affects 2–3 persona files.
5. **Bootstrap-seed correction affordance + audit-chain reconstruction UX.** Day-1 → Day-90 aging means no acceptable to defer past launch.
6. **EMPLOYMENT-tier across-binding-change design.** Decision-support for HR + cross-binding push routing + originator-vs-actor framing for HR review. Affects 3 persona files.
7. **AI backlog visibility under burst.** "Your input is queued" signal on supervisor side. Affects 2 persona files.
8. **Owner digest content + KPI surface.** Even read-only WhatsApp-compatible text. Affects 1 persona file but is the renewal-decision surface.
9. **Bank-change / tenant-settings surface.** Even minimal admin-web for the founder.
10. **Site-handoff context migration.** When a site rebinds, LivingDoc + complaint tail must carry. Affects 3 persona files.

## Was the updated design actually followed consistently? (Combined verdict)

**The design's core promises hold; the design's silences cause the breakages.**

Where the design speaks — binding model, origin attribution, read-time routing, no-overlap invariant, HR Updates audience model, leave-request state machine, EMPLOYMENT-tier typed-phrase, replacement-invite TTL — it speaks consistently and all four persona files corroborate the structural correctness.

The breakages live in three categories:

1. **Locked-doc contradictions** still in flight (`[DRIFT]`) — reverse window 30 vs 5 minutes; Summary "atomic batches" vs not-atomic; "I'm done for today" button dropped from launch but present in design. These are picks waiting to be made.

2. **Design rules whose own consequences haven't been addressed** (`[BROKEN]` design gaps where the rule is consistent with itself but produces wrong human outcomes) — sick supervisor authoring decisions for sites he no longer controls; HR-as-instant under sustained load; HR Updates audience excluding workers for pay-affecting changes.

3. **Workflow design silences** (`[MISSING]` design gaps where the design has no answer at all for the real-life case) — multi-HR coordination; HR-absent fallback; worker-side notification on supervisor change; bootstrap-seed correction; audit-chain reconstruction; owner digest content; bank-change surface; site-handoff context migration.

The structural design is sound. The operational design — the policies + surfaces that turn the structure into a workable product for real people at 5K scale — is roughly one-third written. Closing the operational design is workflow-design work, not implementation work.

The single most load-bearing finding from the 5-file audit set: **most of the dangerous gaps appear in 2+ persona files**, which means closing them in any one file's implementation roadmap is not enough. They are cross-cutting design choices that need cross-cutting decisions before any single feature ships.

---

## Combined-file switching coverage appendix

This file delivers what the per-persona files delegated upward — overlap scenarios, multi-actor races, cross-persona collisions.

### Cases explicitly exercised in this file (with a named scene)

| Case                                                         | Source           | Scene      |
| ------------------------------------------------------------ | ---------------- | ---------- |
| F26.5 no-overlap (acting+acting same site) violation attempt | RM §5.8 + Ops §8 | Scenario 7 |
| F27.3 no-overlap (permanent+permanent) violation attempt     | Ops §8           | Scenario 7 |
| C-7.12b termination during HR absence stalls                 | Ops §7.12        | Scenario 4 |

### Cases owned by this file but NOT yet explicitly exercised (open in Combined scope)

These are Combined-owned per the cross-file split, but the current draft surfaces them in tables / open-gap severity sections without running them through a named scene. Listed honestly so a future revision can add scenes if needed.

| Case                                                   | Source     | Current treatment in this file                                                                                                                 |
| ------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F27.2 "switch all sites" convenience under live churn  | RM §5.1    | Closest treatment is Kavitha Month 9 (multi-direction HR churn) + Combined Scenarios 3 + 6 hints; no explicit cross-persona overlap scene yet. |
| C-7.3 swap initiated then supervisor absence           | Ops §7.3   | Not exercised. Combined Scenario 6 (Mahesh) is termination-centric, not swap-centric.                                                          |
| C-7.8 HR Update ack during supervisor absence (open Q) | Ops §12 #2 | Surfaced in Open-gap severity (unclear); not run through a multi-actor scene.                                                                  |
| G-3 acting-applied decision original disagrees with    | Ops §8     | Surfaced in Authority-chain table; no formal-correction scene exercises the "original disagrees" outcome.                                      |
| G-6 cross-supervisor team view                         | Ops §12 #7 | Surfaced in Open-gap severity (unclear); no scene.                                                                                             |
| G-7 site-level HR Updates routing                      | Ops §12 #8 | Surfaced in Open-gap severity (unclear); no scene.                                                                                             |
| G-10 FLAGGED auto-escalate during absence              | Ops §12 #4 | Surfaced in Open-gap severity (unclear); no scene.                                                                                             |

### Cases covered in per-persona files (cross-reference)

- **Ravi audit:** F26.1–4, F26.6–9, F26.12, F27.1, F27.4–5, C-7.4–7, C-7.9, C-7.12a, G-9 + 8f–8l switching-coverage patch.
- **Suresh audit:** W-1 through W-8 — worker-side notification, decision visibility, replacement-invite respond, trust transition, decision continuity.
- **Kavitha audit:** H-1 through H-9 — HR-side switching orchestration, bootstrap-seed review, multi-HR coordination, HR-absent fallback, wrong-reassignment correction.
- **Reddy audit:** O-1 through O-8 — owner-side authority, digest content, AI alerts, oversight surface.

### Cases that remain genuinely open in the specs

- G-1 HR-absent fallback (ops §12 #1) — picks needed.
- G-2 / C-7.8 HR Update ack during supervisor absence (ops §12 #2).
- G-3 acting-applied decision original disagrees with.
- G-4 wrong-reassignment audit-chain reconstruction UX.
- G-5 bootstrap-seed correction surface.
- G-6 cross-supervisor team view.
- G-7 site-level HR Updates routing.
- G-9 DWI EXPIRED threshold.
- G-10 FLAGGED auto-escalate threshold.
- Multi-HR-user coordination model (no spec content anywhere) — Kavitha's largest gap, surfaced here as cross-cutting.
- Worker product surface (ops §12 #6) — Suresh's whole audit.
- Owner digest + KPI surface (no source) — Reddy's whole audit.
- Multi-site worker leave semantics — Ravi Day 3 + Combined Scenario 2.
- AI backlog visibility under burst — Ravi Month 2 + Combined Scenario 1.

---

_End of Round 5 — Combined audit (Methodology v2 + cross-persona overlap stress). The 5-file audit set (Ravi · Suresh · Kavitha · Reddy · Combined) is now complete as drafts. No spec modified. No canonical-truth entry. No panel critique run. The drafts are reviewable artifacts; promotion or panel critique are separate decisions if founder requests._
