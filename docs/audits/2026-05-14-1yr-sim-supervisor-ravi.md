---
Status: Audit draft
Type: 1-year persona simulation audit (Round 1 of 5)
Persona: SUPERVISOR — Ravi (master plan §O.3)
Scale: Local portfolio (40 workers / 8 sites) inside Surya Cleaning at ~5,000 employees / ~100 supervisors
Primary lens: docs/specs/2026-05-14-supervisor-responsibility-model.md (Active 2026-05-14)
Secondary lenses: 2026-05-14-operations-workflow-model.md, 2026-05-12-decision-entity-lock.md (D.1), 2026-05-12-supervisor-mobile-r6-design.md (R6), 2026-05-12-hr-updates-spec.md, 2026-05-13-product-framing.md
Not added to: docs/index/canonical-truth.md (audit, not a governing spec)
Plan: /Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md
Revisions: 2026-05-14 afternoon — perspective correction (Ravi voice). 2026-05-14 evening — methodology v2 (workflow-design first, implementation status secondary; [MISSING] redefined as design gap not code gap). 2026-05-15 — switching-coverage patch (file-grounded against the 6 specs touched in last 2 days; 7 new sub-scenes 8f–8l in the Month 8 cluster + C-7.7b sub-case extension in 8e + G-8/F27.6 light touches in 8a and Month 11 + switching coverage appendix at end of file; ownership of out-of-scope switching cases delegated to Kavitha/Combined/Suresh audits).
---

# Ravi — 1-Year Simulation Audit (Supervisor)

## Persona setup

- **Ravi**, 32, Telugu native, basic English, basic Hindi. Cracked-screen ₹10K Android, 70% storage full. Wakes 5:30am, sleeps 11pm.
- **Portfolio (Day 1):** 40 workers / 8 sites in central Hyderabad. 30 single-site, 8 multi-site (rotate 2 sites), 2 floaters.
- **Surrounding company:** Surya at ~5,000 employees, ~100 supervisors, 5-person HR team led by Mrs. Kavitha (master plan §O.2). Mr. Reddy (§O.1) is hands-off.
- **Supporting cast:** Lakshmi (peer; acts for Ravi during his Month-8 sick week). Anjali (new supervisor; ramps up Month 9 by absorbing Ravi's sites).

## Audit method (v2 — workflow-design first)

A workflow is a real operational situation from trigger to real-world outcome, measured from the human side, over time, under pressure, with overlaps with other workflows. NOT a route, screen, or state machine.

Every scene in this file judges the **workflow design as if fully implemented** and addresses 8 elements in order: **Workflow** name · **Trigger** · **Actors + authority** · **Lived experience** · **Pressure / overlap / failure** · **Outcome judgment** (tag) · **Implementation status** (one line) · **Takeaway** (one line).

Tags:

- `[WORKS]` — workflow produces a good real-world outcome.
- `[CONFUSING]` — outcome is reached, but the people inside the workflow are slowed by ambiguity.
- `[STUCK]` — workflow is blocked from inside the app; people exit to WhatsApp/phone to finish.
- `[BROKEN]` — workflow produces a wrong or unfair real-world outcome.
- `[MISSING]` — **the workflow design itself does not cover this real-life case.** Not "code unbuilt."
- `[DRIFT]` — locked specs or the implemented surface disagree with each other.

Implementation absence is a one-line footnote, not the headline. Workflow design is the headline.

---

## Year-1 timeline

### Day 1 · [Layer 1+2] · Workflow: Portfolio bootstrap on migration morning

- **Trigger:** Surya migrates overnight; ~100 supervisors open the app for the first time and inherit pre-seeded portfolios.
- **Actors + authority:** HR (created the seed by most-recent-Assignment heuristic per pick 8). Ravi (consumer; no in-app affordance to confirm or contest). Supervisor-X (silent loser at Lakeview Tower; not notified).
- **Lived experience:** Greeting reads "Namaste, Ravi. 8 sites · 40 workers." 8 collapsed site cards. Ravi recognises 6 by name. Lakeview Tower he half-remembers — Supervisor-X used to do mornings there.
- **Pressure / overlap / failure:** Where two supervisors informally split a site, the heuristic picks one and discards the other silently. Supervisor-X learns 3 weeks later via WhatsApp. HR has no surface to spot or fix wrong-owner cases before they age.
- **Outcome judgment:** `[BROKEN]` for wrong-owner — design uses a heuristic with no human-confirmation step. `[CONFUSING]` for the legitimate cases — supervisors can't tell seeded-pending vs confirmed.
- **Implementation status:** Seed mechanism partially specified; admin-web seed-review affordance and supervisor-side "needs HR confirm" signal absent.
- **Takeaway:** Portfolio identity is established by an invisible process with no human-confirmation step on either side.

### Day 2 · [Layer 1] · Workflow: MARK_ABSENT + replacement + same-day reverse

- **Trigger:** Worker Suresh no-show at Lakeview 7am.
- **Actors + authority:** Ravi (proposes, approves, reverses within window). AI (extracts decisions). Ramu (replacement candidate; accepts). No HR involvement (OPERATIONAL tier).
- **Lived experience:** Ravi mic-captures the absence + replacement; sees the chat backlink "2 decisions added — review in Decisions"; opens Decisions, approves absence, picks Ramu in the replacement picker; "Send invite — 2 min timer" starts; Ramu accepts in 47s; Today repopulates; later Ravi remembers Bhanu was already arranged informally and reverses through Activity.
- **Pressure / overlap / failure:** Voice→decision happy path. Reverse meets a real "I forgot I had this covered" memory inside the window.
- **Outcome judgment:** `[WORKS]` for the workflow as a whole. `[DRIFT]` for the reverse window — R6 says 30 min at `activity.jsx:103`, D.1 §2.4 says 5 min; both Active.
- **Implementation status:** Core flow fully present in repo; reverse-window value will ship as whichever side wins resolution.
- **Takeaway:** First-day absence workflow closes cleanly; the only live risk is which reverse-window value ships.

### Day 3 · [Layer 1] · Workflow: Leave request for a multi-site worker

- **Trigger:** Bhanu (Mon/Wed/Fri Lakeview, Tue/Thu Manikonda) asks for next Friday off.
- **Actors + authority:** Ravi (proposes leave; covers primary-site shift). Bhanu (subject). HR (approver). Manikonda's site lead (downstream, not in loop).
- **Lived experience:** Ravi voice-captures; the leave row lands attributed against Bhanu's primary-site shift (Lakeview Friday); replacement invite cascade fires for the Lakeview slot only. Manikonda's same-day shift sees nothing.
- **Pressure / overlap / failure:** Bhanu doesn't show at Manikonda Friday morning; the Manikonda lead WhatsApps Ravi confused.
- **Outcome judgment:** `[MISSING]` — the leave-request workflow design treats leave as date-scoped against the primary site; the real-world case of multi-site workers having overlapping-day shifts at multiple sites is not addressed at all. The workflow produces a silent no-show on the secondary site.
- **Implementation status:** Leave route exists (`leave-requests.ts:44`); the multi-site cascade behaviour is undefined in the design.
- **Takeaway:** Multi-site workers fall through a quiet design gap; leave covers the worker but only at his "main" site.

### Day 4 · [Layer 1] · Workflow: AI-flagged visit adjudication

- **Trigger:** A worker uploads photos at Manikonda C-12; AI flags one ("trash bin in frame; 0/3 mop strokes visible").
- **Actors + authority:** AI (flags). Ravi (adjudicates; Resolve OK / Reject). Worker (subject; not notified).
- **Lived experience:** Today's urgency banner; FlaggedReviewSheet opens with photos + reason + buttons; Ravi picks Resolve OK and the visit verifies.
- **Pressure / overlap / failure:** Works post-completion. If the AI had flagged mid-shift (IN_PROGRESS state), the supervisor has no surface to act before the shift ends.
- **Outcome judgment:** `[WORKS]` for post-visit adjudication. `[MISSING]` for the mid-visit flag case — the workflow design only covers post-completion flags; mid-shift AI signal has no actor or action path.
- **Implementation status:** Post-visit surface fully present; mid-visit flag handling absent in design.
- **Takeaway:** Post-visit verification works; the workflow ignores the AI catching issues mid-shift.

### Day 5 (early) · [Layer 1] · Workflow: Worker activation + readonly site list

- **Trigger:** Kavitha invites a new worker (Mehmood) into Surya; Mehmood OTP-joins; uploads Aadhaar over WhatsApp.
- **Actors + authority:** Kavitha (invites). Mehmood (becomes ACTIVE). Ravi (sees the worker appear in roster).
- **Lived experience:** Mehmood shows up on Ravi's worker grid as AWAITING DOCS; next day after upload, the badge silently disappears.
- **Pressure / overlap / failure:** Silent transition. Ravi only notices by scan. In a busy week with 5 new workers, transitions can be missed for days.
- **Outcome judgment:** `[MISSING]` — the activation workflow design has no notification step to the responsible supervisor; the absence-of-signal is the design choice. (`[WORKS]` for the readonly site-list workflow — HR-only authority is appropriate.)
- **Implementation status:** Activation route present; supervisor-side notification absent in design.
- **Takeaway:** New worker onboarding completes silently; supervisor learns by scanning.

### Day 5 (later) · [Layer 1] · Workflow: HR Update post-and-ack (single update)

- **Trigger:** Kavitha posts "Wage revision: ₹100 increment from June 1."
- **Actors + authority:** Kavitha (poster). All supervisors (audience). Ravi (ack-er).
- **Lived experience:** Updates badge → 1 new. Ravi types "ok got it, will tell workers" (6 words); the counter clears him; ack lands.
- **Pressure / overlap / failure:** Light-load happy path.
- **Outcome judgment:** `[WORKS]` — the own-voice ack workflow is genuinely fast for short, supervisor-relevant updates.
- **Implementation status:** HR Updates route + UI present.
- **Takeaway:** Single-update ack works in light conditions.

### Day 7 · [Layer 1] · Workflow: Ambiguous-decision option picker + dismiss

- **Trigger:** AI extracts a swap request for "Joseph" (two workers share the name). Separately, AI mis-extracts a stray remark as a proposed action.
- **Actors + authority:** AI (extracts). Ravi (picks one option; dismisses the other).
- **Lived experience:** Decisions tab shows an option picker with two radio buttons — names look right, no other context. Ravi picks one. Two days later he learns it was the wrong Joseph. Separately, Ravi swipe-dismisses the stray-remark row; gone.
- **Pressure / overlap / failure:** Ambiguity itself creates the risk; the picker doesn't surface why the AI was unsure. Dismiss never asks "why," so the AI can't learn from rejections.
- **Outcome judgment:** `[CONFUSING]` — the picker workflow asks for a choice without arming the chooser. `[MISSING]` — the dismiss workflow design has no reason-capture step; the AI improvement loop can't close.
- **Implementation status:** Picker + dismiss flows present; ambiguity-reasoning + dismiss-reason absent in design.
- **Takeaway:** Ambiguity routing routes the question to Ravi without arming him to answer it; rejections teach the system nothing.

### Week 2 · [Layer 1] · Workflow: Calendar entry → assignment promotion + complaint logging + LivingDoc capture

- **Trigger:** Ravi plans 3 extra Saturday cleaners for Lakeview event prep; a client emails Surya about a missed Saturday deep-clean at Banjara Hills; Ravi captures a site-rule note for Lakeview.
- **Actors + authority:** Ravi (plans, logs, captures). AI (extracts in each case). Kavitha (forwards the client complaint). Future Anjali (post-Month-9, will own Lakeview but never sees this note).
- **Lived experience:** 3 calendar entries land as soft notes; one promotes to an actual assignment 24h before. The complaint logs as a note-tier decision; Ravi applies. The site-rule note saves into Ravi's LivingDoc.
- **Pressure / overlap / failure:** 4 calendar-entry kinds (NOTE/DEMAND/TENTATIVE/EVENT) all look identical on Today's day view. The complaint has no field linking to the assignment that should have happened. LivingDoc is per-supervisor and doesn't migrate when Lakeview reassigns to Anjali.
- **Outcome judgment:** `[CONFUSING]` for calendar — the workflow design uses a 4-kind enum that isn't surfaced on the card face. `[MISSING]` for complaint-link — design has no structural complaint→failed-assignment link, so root-cause queries can't follow the chain. `[MISSING]` for LivingDoc handoff — design has no migration path between supervisors on rebind.
- **Implementation status:** Calendar promotion + complaint logging + LivingDoc save present; all three traceability surfaces absent in design.
- **Takeaway:** The day-to-day captures work; the breadcrumbs that would connect them later are absent by design.

### Week 3 · [Layer 2] · Workflow: HR Updates broadcast at company scale

- **Trigger:** Kavitha's HR team posts 6 updates this week (PF digest, 2 site-state changes, attendance norm, equipment-loss, festival-bonus eligibility).
- **Actors + authority:** Kavitha + 4 HR users (posters). All ~100 supervisors (audience). Ravi (one of 100; only 2 of 6 updates affect his sites).
- **Lived experience:** Compliance digest single-ack-covers-5 works as designed. The other 5 updates pile into the same feed; no filter; no by-site relevance.
- **Pressure / overlap / failure:** At 5K-employee scale, broadcasting every HR update to every supervisor produces unfiltered noise. The compliance-digest pattern locally saves time but doesn't change the audience model.
- **Outcome judgment:** `[BROKEN]` — the all-supervisors audience model produces an unscannable tab under company-scale broadcasting; the workflow design didn't account for posting cadence at scale.
- **Implementation status:** Audience model locked in HR Updates spec §4.1; no filter chips designed or built.
- **Takeaway:** Compliance-digest ack saves time inside one update; the broadcast workflow itself doesn't scale humanely.

### Week 4 · [Layer 1+2] · Workflow: Assignment scheduling with conflict detection + cross-supervisor site scope

- **Trigger:** Ravi schedules Bhanu for an extra Saturday at Manikonda — Bhanu already has a recurring Saturday shift at Lakeview. Separately, peer supervisor Lakshmi tries to schedule one of her workers at Lakeview (a site she has no binding for).
- **Actors + authority:** Both supervisors (proposers). Conflict guard (engine). Binding system (silent gatekeeper).
- **Lived experience:** Ravi's attempt is refused with the conflict; he stops. Lakshmi's attempt — her UI shows Lakeview as a selectable option in the site picker because the picker isn't binding-scoped; she submits; the route refuses at submit-time with a confusing error.
- **Pressure / overlap / failure:** At 5K-scale with 100 supervisors moving around, "I tried to schedule at a site I shouldn't have" attempts will be routine.
- **Outcome judgment:** `[WORKS]` for hard same-worker conflict (engine catches it). `[CONFUSING]` for site-scope — the workflow design doesn't filter the picker to bound sites, only refuses at submission.
- **Implementation status:** Conflict engine present; picker scoping absent in design.
- **Takeaway:** Hard conflicts caught structurally; soft "you shouldn't even see that site" mistakes aren't prevented.

### Month 2 · [Layer 2] · Workflow: Burst absences during a monsoon flu wave

- **Trigger:** Day 38, 6:15am. 7 of Ravi's workers absent across 3 sites (Lakeview 3, Manikonda 2, Banjara Hills 2). Similar bursts hit ~12 other supervisor portfolios company-wide.
- **Actors + authority:** Ravi (proposes 14 decisions in one voice memo). AI extractor (queued under load). 14 replacement candidates. The mass-absence triage workflow.
- **Lived experience:** Today urgency banner "NEEDS YOU NOW: 7 absences." Floor pulse ON SITE 33 / SHORT 7 / PENDING 7. Site cards default collapsed; Ravi expands 3 to see who's out. Voice memo captures all 7. 14 decisions land as one batch; 11 invites accept inside the 2-min window; 3 expire. The retries don't surface in Chat as fresh proposed rows for ~6 minutes — AI pipeline is queued behind 12 other portfolios doing similar burst extractions.
- **Pressure / overlap / failure:** Company-wide AI load + collapsed-default UI + no "your input is processing" signal. Ravi can't tell whether retries failed silently or are queued.
- **Outcome judgment:** `[CONFUSING]` for collapsed Today under high-absence morning — the design choice (collapse-by-default) costs expand-taps when 7 absences fan across 3 sites. `[STUCK]` for chat backlog under load — the workflow design has no "queued" state visible to the supervisor. `[DRIFT]` for the Summary tile "atomic batches" label vs the locked "batch is grouping signal only."
- **Implementation status:** Burst-decision path present; backlog visibility absent; tile label not yet updated.
- **Takeaway:** Mass-absence workflow scales until AI is congested; under congestion the supervisor's surface goes quiet with no explanation.

### Month 3 · [Layer 1] · Workflow: Multi-day leave with per-day cover scout

- **Trigger:** Joseph asks for 5 consecutive days. Day 3 (Wednesday) has no available worker in Lakeview's roster.
- **Actors + authority:** Joseph (subject). Ravi (scouts + approves). HR (final approver). Possible covers (across the supervisor's network).
- **Lived experience:** Per-day pills. Ravi fills 4 of 5; Wednesday has no candidate. The "Approve leave + send invites" button stays disabled. He closes the screen, WhatsApps Bhanu, finds Bhanu can rotate, reopens, picks Bhanu, approves.
- **Pressure / overlap / failure:** Real-life scouting is iterative — partial scout, ask around, return with new information. The screen's disable-until-complete pattern doesn't accommodate this.
- **Outcome judgment:** `[STUCK]` — the workflow design forces all-or-nothing entry; supervisor exits to WhatsApp to complete the work the app should help with.
- **Implementation status:** Multi-day screen present; save-and-return path absent in design.
- **Takeaway:** Multi-day leave forces all-or-nothing entry when real scouting is iterative.

### Month 4 · [Layer 1+2] · Workflow: Activity scan / audit lookup

- **Trigger:** Ravi wants to find a reversal he made 6 weeks ago. By month 4 his Activity has ~1,200 rows.
- **Actors + authority:** Ravi (looking). System (filter chips: date / site / kind).
- **Lived experience:** No actor filter. No worker filter. He scrolls. He tries to confirm whether a specific absence row was actioned by him or a stand-in 3 weeks back — the row shows "Ravi" because he applied it, but there's no visible "responsibility-at-the-time" stamp.
- **Pressure / overlap / failure:** At company scale, his Activity feed also includes binding-change rows from HR — admin events mixed with operational events in one chronological stream. Under HR churn, admin events dominate the visual signal.
- **Outcome judgment:** `[CONFUSING]` — the workflow design's filter set is too narrow for a year of activity. `[MISSING]` — the design's correctness promise (historical attribution preserved at audit-time) isn't rendered in the UI; the promise is unfalsifiable from Ravi's side.
- **Implementation status:** Filter chips present (date/site/kind); actor + worker filters absent; binding-at-time stamp absent in render.
- **Takeaway:** Activity holds correct history but doesn't show it in a way Ravi can search or trust.

### Month 5 · [Layer 1] · Workflow: Site auto-suspension cascade

- **Trigger:** Vasanth Vihar (Ravi's site) auto-suspends at 6am after 3 complaint thresholds breach.
- **Actors + authority:** System (state machine fires). Ravi (responsible supervisor). Workers scheduled at that site (subjects of the cascade).
- **Lived experience:** Ravi opens at 8am, sees a SUSPENDED badge on the card. By 8am two morning shifts have already started. The workers themselves had no push; they show up to a locked building and find out from the security guard.
- **Pressure / overlap / failure:** State transition fires correctly server-side; the cascade to humans has no push step at either supervisor or worker layer.
- **Outcome judgment:** `[BROKEN]` — the workflow design has the right state machine and the wrong cascade. Workers commute (some by bus, 45+ minutes) to closed buildings and lose the day's pay.
- **Implementation status:** State machine present; supervisor + worker push cascade absent in design.
- **Takeaway:** Auto-suspensions are correct but silent; workers absorb the cost as commute and lost wages.

### Month 6 · [Layer 2] · Workflow: Urgent leave during HR queue saturation

- **Trigger:** Krishna asks for urgent Saturday medical leave Friday morning. Kavitha's HR queue is backed up because she's reviewing bootstrap-seed portfolios that week.
- **Actors + authority:** Worker (subject). Ravi (submits on his behalf). Kavitha (approver, overloaded).
- **Lived experience:** Leave sits 36 hours. Saturday morning, Krishna doesn't show. Ravi marks him absent. Ravi WhatsApps Kavitha; Kavitha phone-approves; Ravi is outside the 30-min reverse window. He files a complaint on himself in Activity to record the retroactive correction.
- **Pressure / overlap / failure:** HR is single-threaded; there's no in-app way for Ravi to see queue depth or escalate. Retroactive attendance correction has no path.
- **Outcome judgment:** `[BROKEN]` — the leave workflow design treats HR as instant; under real HR load the workflow leaves the worker stranded with no visibility on either side. `[MISSING]` — the workflow design has no retroactive-correction path for "this should have been leave, not absence."
- **Implementation status:** Leave route + HR ack present; SLA + escalation + queue-visibility + retroactive-correction routes absent.
- **Takeaway:** When HR is the bottleneck, the workflow design has no surface for Ravi to see it or escalate around it.

### Month 6.5 · [Layer 1] · Workflow: Worker swap + worker suspension

- **Trigger:** Ramu and Kishore want to swap sites (mutual). Mahesh hits 2 more missed shifts; Ravi proposes a 1-week suspension.
- **Actors + authority:** Two workers (swap parties). Ravi (proposer / approver). Kavitha (HR ack for suspension). Mahesh (subject of suspension).
- **Lived experience:** Swap — the swap decision lands; bilateral acceptance happens via WhatsApp; Ravi marks accepted manually. Suspension — Mahesh's row shows SUSPENDED; no return date is rendered; Mahesh anxiously asks Ravi "kab tak hai?"
- **Pressure / overlap / failure:** Real swaps require both workers to consent and be aware; design surfaces only the supervisor side. Suspension has a stored end date in data but no rendering on the worker row.
- **Outcome judgment:** `[MISSING]` for bilateral swap — the workflow design names mutual swap but has no route/UI for the second worker's accept. `[MISSING]` for suspension visibility — the workflow design has no return-date surface on the affected worker row.
- **Implementation status:** Swap route + suspension state present; second-worker accept + return-date render absent in design.
- **Takeaway:** Mid-severity worker workflows work on the rails but force the supervisor to keep state in his head or in WhatsApp.

### Month 7 · [Layer 1] · Workflow: EMPLOYMENT-tier termination proposal awaiting HR ack

- **Trigger:** Mahesh accumulates 3 missed shifts post-suspension + a client complaint. Ravi proposes termination.
- **Actors + authority:** Ravi (proposer; typed-phrase 'TERMINATE'). Kavitha (final ack). Mahesh (subject; unaware of pending).
- **Lived experience:** Termination screen opens — bad-tinted header, money implication (₹14K/mo gone), recent 10 days. Ravi types the phrase. Decision lands as "Pending HR." 4 days pass with no movement.
- **Pressure / overlap / failure:** Ravi has no surface to see queue position, last-touched timestamp, or escalation path. The proposer is in the dark during the most consequential pending action.
- **Outcome judgment:** `[MISSING]` — the workflow design has the proposer-side typed-phrase gate but no proposer-side visibility once the row is in HR's hands.
- **Implementation status:** Termination screen present; HR-pending visibility absent in design.
- **Takeaway:** The termination workflow does its job at the moment of proposal; what comes after is opaque to the proposer.

### Month 8 · [Layer 1+2] · Workflow cluster: F26 acting-supervisor coverage (sick week)

The sick-week is best read as a cluster of overlapping workflows. Each is judged separately below.

#### Workflow 8a: Acting-coverage window creation (Kavitha → Lakshmi for Ravi's 8 sites)

- **Trigger:** Ravi calls Kavitha Monday morning: "2 weeks rest." Kavitha sets up coverage.
- **Actors + authority:** Kavitha (HR; picks acting supervisor + window dates per pick 6). Ravi (original; off-point). Lakshmi (acting; on-point).
- **Lived experience:** Kavitha clicks through 8 sites in her admin tool. Lakshmi's phone buzzes 8 times in 30 seconds — one push per binding ("You're covering Lakeview Tower for Ravi" × 8). Ravi gets 8 mirror pushes from bed.
- **Pressure / overlap / failure:** At 5K-company scale, Kavitha runs this multiple times a week for different supervisors. Each acting binding stacks over Ravi's underlying permanent portfolio binding per RM §5.8 precedence (acting overrides baseline for the window; baseline returns automatically when the window ends). Ravi's 40 workers receive no in-app notification about Lakshmi covering — the worker-side notification on supervisor change is not specified by any current spec.
- **Outcome judgment:** `[CONFUSING]` — the workflow design notifies per-binding rather than coalescing; an 8-site cover fires 8 pushes when 1 "you're covering Ravi (8 sites)" would do the human job. `[WORKS]` precedence — acting stacks correctly over baseline. `[MISSING]` for the supervisor-side G-8 surface — Ravi has no in-app affordance to verify whether his workers were notified (primary worker-side experience belongs in Suresh's audit).
- **Implementation status:** Binding creation + per-binding push + precedence stacking present; coalesced push + worker-side notification absent in design.
- **Takeaway:** The right binding state is set; the notification design treats each binding as an independent event, and worker-side awareness is silent.

#### Workflow 8b: Sick supervisor's empty Today

- **Trigger:** Ravi (in bed) opens the app Tuesday at 10am.
- **Actors + authority:** Ravi (currently responsible for nothing during the window). The Today routing rule (current-responsibility-based).
- **Lived experience:** Greeting shows "Namaste, Ravi. 8 sites · 40 workers." Body is blank. No site cards. No banner saying "Lakshmi is on point; your sites return [date]."
- **Pressure / overlap / failure:** Blank Today is indistinguishable from "no work today." A sick supervisor cannot tell whether he has zero work or zero authority.
- **Outcome judgment:** `[CONFUSING]` — the workflow design correctly empties Today during absence but doesn't explain why; the empty state is the design.
- **Implementation status:** Routing logic correct; absence-state explanation affordance absent in design.
- **Takeaway:** The data layer is right; the UX of the absence is misleading to the person experiencing it.

#### Workflow 8c: Sick supervisor authoring decisions for sites he no longer controls

- **Trigger:** Ravi (in bed) remembers a fix he wants at Lakeview; mic-captures into his chat.
- **Actors + authority:** Ravi (chat-thread owner; current responsible for nothing). Lakshmi (current responsible for Lakeview).
- **Lived experience:** New chat turns produce decisions that route to Lakshmi (per the §5.5 rule: thread ownership stays with creator, new decisions route to current responsible). Lakshmi opens her Decisions tab the next morning to find a proposed action originating from a supervisor on absence, about a worker she barely knows.
- **Pressure / overlap / failure:** The rule is structurally followed; the outcome is bad work for the acting cover with no native framing.
- **Outcome judgment:** `[BROKEN]` — the workflow design rule produces wrong work because it doesn't address whether a sick supervisor should be able to author decisions at all.
- **Implementation status:** Routing rule locked in design; "absence mode" or author-side soft-block absent in design.
- **Takeaway:** The routing rule is consistent with itself and produces wrong real-world work; the design doesn't speak to this case.

#### Workflow 8d: EMPLOYMENT-tier termination originated during sick week

- **Trigger:** Day 222 — Ravi (in bed) hears about a worker with 5 missed shifts; mic-captures a TERMINATE proposal.
- **Actors + authority:** Ravi (origin attribution, immutable). Lakshmi (current responsible; receives the PROPOSED row; expected to type the gate phrase). Kavitha (HR final ack). The typed-phrase gate (deterrent design).
- **Lived experience:** PROPOSED row lands on Lakshmi's Decisions. She WhatsApps Ravi: "you sure?" Ravi says yes. She types the phrase against a worker she met 48 hours ago.
- **Pressure / overlap / failure:** The typed-phrase gate exists to make termination costly for the actor. The cost-of-the-phrase is undermined when the actor is acting-cover and the originator is on leave. When Kavitha later reviews, she sees actor=Lakshmi and originator=Ravi but no first-class framing of "acted on behalf during absence."
- **Outcome judgment:** `[BROKEN]` — the workflow design's gate produces a hollow safeguard in the absence-cover case. `[MISSING]` — design has no first-class "originator vs actor during absence" rendering for HR review.
- **Implementation status:** Origin + actor recorded in data; HR-review render of the asymmetry absent in design.
- **Takeaway:** The deterrent gate doesn't carry across an absence handoff; the seriousness of EMPLOYMENT-tier dilutes in the handoff.

#### Workflow 8e: Original supervisor's return after absence window

- **Trigger:** Day 234 — Ravi back from dengue. Acting window ends overnight by auto-revert.
- **Actors + authority:** System (cron + read-time check closes the window). Ravi (returner). Lakshmi (off-point).
- **Lived experience:** Today repopulates with 8 cards. Ravi expects a "while you were out" digest summarizing what Lakshmi did in his portfolio. There is none. He scrolls Activity to reconstruct 14 days; no actor filter; reconstruction takes 20 minutes.
- **Pressure / overlap / failure:** The §5.6 "while you were out" digest is named in the design but not specified; the UX is deferred per §10. Ravi returns blind.
- **Outcome judgment:** `[MISSING]` — the digest workflow design names the artifact but doesn't specify it; the post-absence reconstruction workflow has no first-class support.
- **Implementation status:** Auto-revert + Activity present; digest design absent.
- **Takeaway:** The data layer gets the absence right; the supervisor's lived experience of returning is "scroll Activity, guess what happened."

**Sub-case — pending Lakshmi-proposed row on return (C-7.7b):** One `PROPOSED` row Lakshmi proposed Saturday is still open when the window ends. Per ops §7.7 Absent actor: "If acting binding ends between propose and apply: original supervisor applies on return. Origin (`DWI.supervisorId`) stays the proposer's User.id." Ravi opens Decisions Day 234 and sees the row tagged "originated by Lakshmi." He doesn't know the workers' state of mind from Saturday; he WhatsApps Lakshmi for context. `[CONFUSING]` — the rule is correct; the returning supervisor inherits an apply-decision he didn't make and didn't witness. Impl status: routing rule locked; cross-supervisor context handoff absent in design.

---

### Month 8 supplementary switching coverage (sub-scenes 8f–8l)

The 8a–8e narrative carries the absence-week trunk. The sub-scenes below test specific switching cases from the source-of-truth specs (responsibility model + operations workflow model §7 Absent-actor rules + §12 open gaps) that the trunk doesn't explicitly exercise.

#### Workflow 8f · [Layer 1+2] · Pre-existing PROPOSED queue flips at Monday switch (F26.2)

- **Trigger:** Ravi ended Sunday with 5 open `PROPOSED` rows in his Decisions tab (3 from a weekend voice memo, 2 carried over from Friday). Acting binding kicks in Monday 7am.
- **Actors + authority:** Ravi (originator; offline). Lakshmi (becomes current responsible). Routing rule (read-time JOIN per RM §5.4).
- **Lived experience:** Monday 8am — Lakshmi opens Decisions; badge +5 from her usual count. Each row tagged "originated by Ravi." She has no provenance prompt. Ravi (in bed) opens his Decisions: empty.
- **Pressure / overlap / failure:** The rule works as designed — open decisions follow current responsibility. Lakshmi WhatsApps Ravi at 9am for context on two rows she can't decide alone.
- **Outcome judgment:** `[CONFUSING]` — the routing flip is correct in data; the workflow design has no "received from X" context note for the inheriting supervisor.
- **Implementation status:** Routing rule locked in design; context note absent.
- **Takeaway:** In-flight decisions migrate correctly but arrive at the acting supervisor without the originator's reasoning attached.

#### Workflow 8g · [Layer 1] · Replacement invite live across the binding boundary (C-7.9)

- **Trigger:** Monday 6:58am — Ravi (still trying to work despite illness) sends a replacement invite for the 7am Lakeview shift (a worker called out 6:45am). Acting binding takes effect at 7am. The 2-min TTL is running.
- **Actors + authority:** Ravi (sent the invite; off-point from 7am). Lakshmi (current responsible from 7am; sees the still-pending invite per ops §7.9 Absent actor). Candidate worker (responds 7:01am).
- **Lived experience:** Lakshmi opens Today at 7am, sees a live invite she didn't send. She has 1 minute to cancel or wait. She waits. Candidate accepts 7:01am. Today refreshes.
- **Pressure / overlap / failure:** Boundary case but real. The TTL is short enough that almost all invites resolve fast; the inheriting supervisor still has no "why this candidate" signal for the seconds she holds the live invite.
- **Outcome judgment:** `[WORKS]` operationally — the short TTL covers the gap. `[CONFUSING]` because the inheriting supervisor lacks the originator's selection reasoning.
- **Implementation status:** TTL + inheritance routing present; reason-for-pick absent.
- **Takeaway:** Short invite TTLs sidestep the in-flight handoff problem; the human-context gap remains.

#### Workflow 8h · [Layer 1] · Ravi-created calendar entry promotes mid-window (C-7.5)

- **Trigger:** Day 221 (Tuesday) 7pm — a calendar entry Ravi created two weeks ago (Lakeview Wednesday event-prep extra shift) hits its 24h-promotion window.
- **Actors + authority:** Ravi (creator; offline). Lakshmi (current responsible; inherits the `editableUntil` window per ops §7.5 Absent actor).
- **Lived experience:** Lakshmi's Today shows the promotion prompt for a calendar entry she didn't create, about a site she just inherited, with no notes from Ravi attached. She picks a worker from candidates using only names.
- **Pressure / overlap / failure:** Ravi's reasoning (why he chose Wednesday, who he had in mind) lives in his head, not on the entry.
- **Outcome judgment:** `[CONFUSING]` — the workflow correctly hands promotion authority to the current responsible without inheriting creator intent.
- **Implementation status:** Promotion route + acting-editor authority present; creator-intent capture on calendar entries absent.
- **Takeaway:** The acting supervisor inherits authority over a forward plan without inheriting the plan's reasoning.

#### Workflow 8i · [Layer 1] · Visit FLAGGED at a Ravi site, Lakshmi resolves (C-7.4)

- **Trigger:** Day 227 (Wednesday afternoon) — a Manikonda Plaza visit returns FLAGGED ("missing equipment in lobby pan shot").
- **Actors + authority:** Lakshmi (currently responsible for Manikonda; receives urgency banner). Flagged worker (subject; not notified). Ravi (offline; sees nothing in real time).
- **Lived experience:** Lakshmi opens FlaggedReviewSheet, sees the photo, picks Resolve OK ("equipment was put away early"). Visit verifies.
- **Pressure / overlap / failure:** Lakshmi adjudicates a worker she met two days ago with no historical context for that worker's usual quality. She judges correctly but on instinct, not knowledge.
- **Outcome judgment:** `[WORKS]` per the binding-routes-to-current rule. `[CONFUSING]` at workflow level — flagged-visit judgment quality depends on supervisor-worker history the acting supervisor doesn't have, and the design has no "first time judging this worker" affordance.
- **Implementation status:** Routing + FlaggedReviewSheet present; acting-supervisor historical context absent.
- **Takeaway:** Flagged-visit judgment routes correctly but the acting supervisor adjudicates without history.

#### Workflow 8j · [Layer 2] · HR Update broadcast during the window (F26.3)

- **Trigger:** Day 226 — Kavitha posts a "Q3 attendance norm" HRUpdate during Ravi's sick week.
- **Actors + authority:** Kavitha (poster). All ~100 supervisors (audience per HR Updates §4.1, including Ravi-on-absence and Lakshmi-as-cover). Ack is per-supervisor.
- **Lived experience:** Both Ravi and Lakshmi receive the push. Lakshmi reads and acks for herself. Ravi from bed reads it; the spec doesn't say whether his ack should be required or excused for the absence window.
- **Pressure / overlap / failure:** The audience model is binding-independent; absence does not exclude the supervisor from the broadcast. The ack-during-absence question is the explicit ops §12 #2 open question — owned by the Combined audit (cross-actor open question).
- **Outcome judgment:** `[WORKS]` for the broadcast workflow — the audience model is binding-independent and works as designed. The ack-during-absence question surfaces here; it doesn't resolve here.
- **Implementation status:** HR Update fan-out present; ack-during-absence resolution open per ops §12 #2.
- **Takeaway:** The broadcast reaches Ravi-on-absence and Lakshmi-as-cover identically; whether Ravi-on-absence should be excused from acking is the open question.

#### Workflow 8k · [Layer 1] · A Ravi-proposed DWI hits EXPIRED during the window (G-9)

- **Trigger:** Day 226 — a 14-day-old `PROPOSED` row Ravi created two weeks before he fell sick hits whatever staleness threshold lands (open per ops §12 #3); cron sweeps it to EXPIRED.
- **Actors + authority:** System cron (actor; actorId = NULL per design). Ravi (originator; offline). Lakshmi (current responsible; sees the row disappear).
- **Lived experience:** Lakshmi's Decisions silently drops the row. An Activity entry: "DECISION_EXPIRED (originated by Ravi)." No human acts; Lakshmi doesn't know why a row vanished.
- **Pressure / overlap / failure:** The expiry threshold isn't locked; if short (24h) it fires often during a 2-week window; if long (7d) it fires mid-window. Either way, the acting supervisor sees inherited rows expire without context.
- **Outcome judgment:** `[MISSING]` — the expiry workflow has no design for "expired during acting coverage" rendering on either supervisor's surface; the threshold is itself open.
- **Implementation status:** Cron stub exists; threshold open per ops §12 #3; rendering design absent.
- **Takeaway:** Expiry behaviour during acting coverage is unspecified — both the threshold and the rendering on the inheriting supervisor's side are open.

#### Workflow 8l · [Layer 1] · Window ends early — mid-shift handover (F26.9)

- **Trigger:** Day 230 (Saturday 4pm) — Ravi feels better and texts Kavitha "lautega kal, window khatam kar." Kavitha sets `endedAt = NOW`. Two of Ravi's sites have shifts in progress at the moment of the switch.
- **Actors + authority:** Kavitha (ends the window). Lakshmi (was responsible; loses the 8 sites at 4pm). Ravi (becomes responsible at 4pm; on his couch). In-progress workers (subjects).
- **Lived experience:** At 4pm Lakshmi's Today drops Ravi's 8 cards; Ravi's Today repopulates. A flagged visit at Manikonda fires at 4:03pm — it surfaces in Ravi's Today urgency banner, not Lakshmi's. Lakshmi closes the app.
- **Pressure / overlap / failure:** Operational handover is correct per ops §8 "no state inconsistency." But mid-shift transitions hand adjudication authority to a supervisor who isn't physically near the work; if Ravi is still resting, his judgment is one step removed.
- **Outcome judgment:** `[WORKS]` data-correctness. `[CONFUSING]` UX — the workflow design doesn't ask "are you ready to take back authority?" on the returning supervisor's side; the switch fires the moment Kavitha clicks end.
- **Implementation status:** Routing + `endedAt` action present; returning-supervisor confirmation absent in design.
- **Takeaway:** Mid-shift switches data-correctly route to the returning supervisor; the workflow doesn't pause to confirm operational readiness.

---

### Month 9 · [Layer 1+2] · Workflow cluster: F27 permanent portfolio reassignment (Anjali ramp-up)

#### Workflow 9a: Progressive site rebinding (Ravi → Anjali, 4 sites across weeks 36–40)

- **Trigger:** Kavitha onboards Anjali by progressively reassigning 4 of Ravi's 8 sites over 4 weeks. Simultaneously rebalances 4 other supervisors company-wide.
- **Actors + authority:** Kavitha (rebinds). Ravi (loses sites). Anjali (gains sites). 100 supervisors (background churn).
- **Lived experience:** Ravi opens Today after each rebinding morning — site cards count drops silently. No banner says "2 sites moved to Anjali." He goes to Activity, finds binding-ended rows, attributes them to Kavitha, understands.
- **Pressure / overlap / failure:** Multi-direction simultaneous rebinding produces a fog of binding events. A less-attentive supervisor would scan and feel vague unease but not know why.
- **Outcome judgment:** `[MISSING]` — the workflow design has no portfolio-delta surface on the supervisor side; rebinding succeeds in data but not in supervisor awareness.
- **Implementation status:** Binding rebind present; delta surface absent in design.
- **Takeaway:** The structural rebind is right; the experience of "you have 6 sites today, you had 8 yesterday" is invisible.

#### Workflow 9b: Site handover context loss

- **Trigger:** Anjali takes Manikonda Plaza; Lakeview rules and complaint history live in Ravi's LivingDoc / Activity.
- **Actors + authority:** Outgoing supervisor (Ravi). Incoming supervisor (Anjali). The sites + their accumulated context.
- **Lived experience:** Anjali starts cold at Manikonda. The lobby-mop-twice-daily rule that Ravi captured Week 2 doesn't appear in her context. She rediscovers it via a client complaint. Ravi later tries to follow up on a complaint he logged about Manikonda — he can see his historical sliver but not the current state of the site after handover.
- **Pressure / overlap / failure:** Site context is workflow content (rules, complaint tails, worker preferences). The rebinding workflow doesn't carry it.
- **Outcome judgment:** `[MISSING]` — the workflow design has no handover step; LivingDoc is per-supervisor with no migration; complaint tails don't follow the site.
- **Implementation status:** Per-supervisor LivingDoc present; handover prompt + migration absent in design.
- **Takeaway:** The workflow rebinds authority but not context, trust, or continuity.

### Month 10 · [Layer 1+2] · Workflow: Festival overflow (Diwali week)

- **Trigger:** Festival creates 30+ leave requests company-wide; 5 on Ravi's now-4-site portfolio.
- **Actors + authority:** Workers (leave-requesters). Ravi (proposer / approver). Kavitha (HR; partly backed up). AI (under load).
- **Lived experience:** 4 of 5 approved within the day; 5th sits 48 hours. Decisions tab during Diwali shows 12+ proposed rows — tier grouping holds. A long voice memo produces 9 decisions in one compound batch; the batch lineage isn't surfaced; Ravi scans wondering which are related.
- **Pressure / overlap / failure:** Diwali volume + AI batching + HR backlog re-surfacing all at once.
- **Outcome judgment:** `[WORKS]` for tier grouping under volume. `[CONFUSING]` for batch lineage — the workflow design uses batch IDs as grouping signal but doesn't surface them; supervisor can't see why 9 rows arrived together.
- **Implementation status:** Tier grouping + batch storage present; batch-grouping surface absent in design.
- **Takeaway:** Festival volume is absorbed by tier grouping; the compound-batch lineage gets lost in the list.

### Month 11 · [Layer 1+2] · Workflow: EMPLOYMENT-tier apply across a binding change + multi-direction churn

- **Trigger:** Mahesh's termination (proposed Month 7) finally APPLIES — Kavitha types her HR phrase. Same week, Kavitha shifts 3 sites onto Ravi from a supervisor who quit, and Anjali takes 2 more from Ravi (net +1 site for Ravi: 5 total).
- **Actors + authority:** Ravi (origin of termination). Anjali (current responsible for Manikonda where Mahesh works). Kavitha (HR ack-er). Mahesh (subject; unaware).
- **Lived experience:** Termination cascade fires on Anjali's surface (current responsible for Manikonda). Ravi sees the audit row (he's the originator). Termination-applied push routing across the binding change is not specified — both Ravi and Anjali could legitimately expect it. Mahesh learns by phone call from Kavitha. Same week, Ravi opens Today: 5 cards, 3 unfamiliar names; he scrolls Activity to piece it together. F27.6 in passing: the 3 sites Ravi inherits came from a supervisor who quit permanently — HR-driven portfolio liquidation that Kavitha orchestrated (the orchestration side belongs in Kavitha's audit).
- **Pressure / overlap / failure:** Multi-direction churn on top of a major EMPLOYMENT-tier apply. Mahesh has no in-app surface at any point; the most consequential moment of his employment happens entirely outside the app. G-8 surfaces again on the supervisor side: Ravi has no in-app affordance to verify whether the workers at the 5 sites he now manages (3 newly inherited, 2 retained) have been informed about the rebindings; primary worker-side experience is in Suresh's audit.
- **Outcome judgment:** `[MISSING]` for the apply-across-binding-change push routing — the workflow design doesn't address which supervisor receives the apply notification when origin and current-responsible differ. `[MISSING]` for portfolio-delta (re-surfaced from Month 9). `[BROKEN]` for worker-side termination notification — the workflow design has no in-app notification or appeal step for the subject; entirely offline. `[MISSING]` for the supervisor-side G-8 verification surface.
- **Implementation status:** Apply path present; cross-binding push routing unspecified; worker-side termination flow absent in design.
- **Takeaway:** When the company is busy in many directions and a termination lands, the workflow design has gaps at the supervisor handoff, the portfolio identity, and the worker side simultaneously.

### Month 12 · [Layer 1] · Workflow: Year-end rhythm + Summary dead button

- **Trigger:** Stable rhythm in December (5 sites, 28 workers). Kavitha posts a year-end attestation update.
- **Actors + authority:** Ravi (steady-state user). System (Summary tab rendering).
- **Lived experience:** Summary shows weekly wages, changes-today, flagged, leave pending. The "I'm done for today" wrap-up CTA still renders at the bottom — tapping does nothing.
- **Pressure / overlap / failure:** Light week; no breakpoints from operations.
- **Outcome judgment:** `[WORKS]` for steady-state Summary. `[DRIFT]` for the dead button — design says drop from launch (R6 §4 #15 resolution); implementation hasn't hidden or no-op'd it.
- **Implementation status:** Summary tab + ack flow present; dead-button removal not enforced.
- **Takeaway:** The product works hardest on the bad days; the calm days reveal small dead-button rough edges.

---

## What worked (workflow-design judgments)

**Layer 1 — local:**

- Voice → AI-extracted decision → tier-grouped Decisions tab → typed-phrase EMPLOYMENT gate produces the right loop under normal load.
- 2-minute replacement-invite TTL + cron-swept expiry is a clean ephemeral pattern.
- Single-update HR ack workflow (5-word own-voice) saves real time over per-rule acking under light load.
- Compliance-digest single-ack-covers-N is faster than per-rule acking inside a digest.
- 30-min reverse window catches genuine same-day mistakes.
- Calendar entry → 24h-ahead assignment promotion is a clean forward-planning loop.

**Layer 2 — cross-level:**

- Acting-window auto-revert via cron + read-time fires correctly without manual cleanup.
- Origin attribution (immutable) + read-time routing produces correct historical attribution after binding changes.
- Same-kind binding overlap prevention works structurally.

## What became confusing (workflow-design level)

**Layer 1 — local:**

- AmbiguousDecisionCard asks for a choice without surfacing the AI's confidence reasoning.
- Calendar entries don't visually distinguish soft notes vs hard events on Today.
- Today's collapsed-default cards cost expand-taps when many sites are short on the same morning.
- Multi-day-leave screen forces the supervisor to exit the app to scout, then return.
- Activity filter set is too narrow for a year of rows (no actor, no worker filter).
- Activity historical-attribution correctness is invisible at the row level.
- Sick-week empty Today is structurally correct but indistinguishable from "no work today."
- Batch lineage from compound voice memos isn't surfaced on Decisions.

**Layer 2 — cross-level:**

- HR Updates broadcast model produces unscannable feed at 5K-employee scale.
- Site picker isn't binding-scoped — wrong-site attempts surface as confusing submit-errors.
- Activity mixes operational events and binding-change events without grouping.
- Acting-coverage notifications fire per-binding (8 pushes for 8-site cover) instead of coalescing.

## What broke (workflow-design level)

**Layer 1 — local:**

- Bootstrap-seed wrong-owner cases are silent on both sides; the workflow design has no human-confirmation step.
- Sick supervisor can author decisions for sites he no longer controls; the workflow design's routing rule produces wrong work for the acting cover.
- EMPLOYMENT-tier termination typed-phrase gate dilutes across an absence handoff — the actor is acting-cover with no historical context.
- Urgent leave during HR queue saturation strands the worker; design has no SLA, no escalation, no supervisor-visible queue position. Retroactive correction has no path.

**Layer 2 — cross-level:**

- Site auto-suspension cascade has no push step; workers commute to closed buildings.
- HR Updates broadcast doesn't scale humanely; the audience model is the workflow design.
- Worker-side notification on supervisor change is undefined; trust transfer happens through WhatsApp introduction.
- Termination-apply push routing across binding changes is unspecified by design.
- Worker-side termination notification is absent at the design level; subject learns by phone.

## What is missing in design (workflow itself doesn't cover the real-life case)

- Multi-site worker leave semantics (Day 3).
- Mid-visit AI-flag adjudication path (Day 4).
- Activation notification to the responsible supervisor (Day 5).
- Dismiss-reason capture for AI learning (Day 7).
- Calendar-kind visual signal on Today (Week 2).
- Complaint → failed-assignment structural link (Week 2).
- LivingDoc handoff on site rebind (Week 2 / Month 9).
- HR-pending visibility for proposer (Months 6, 7).
- Retroactive attendance correction path (Month 6).
- Bilateral swap acceptance flow (Month 6.5).
- Suspension return-date render on worker row (Month 6.5).
- Sick-supervisor "absence mode" or author-side soft-block (Month 8c).
- "Originator vs actor during absence" first-class rendering for HR review (Month 8d).
- "While you were out" digest specification (Month 8e).
- Portfolio-delta surface on Today (Months 9, 11).
- Site handover prompt + context migration (Month 9).
- Batch-grouping surface on Decisions (Month 10).
- Termination-apply push routing across binding change (Month 11).
- Worker-side termination notification + appeal / records-download (Month 11).
- Worker push for site state changes (Month 5).

## What should change before implementation

Ordered by trust-impact, not by ease:

1. Resolve the 30-min vs 5-min reverse-window contradiction; pick one and update the other doc. _(R6 §4 #1.)_
2. Add a sick-supervisor "absence mode" to the chat-vs-current-responsibility rule — either soft-block new authoring or tag decisions as "from supervisor on absence" for the acting cover. _(Responsibility model §5.5.)_
3. Specify the "while you were out" digest content + UX. _(§5.6 / §10.)_
4. Add a portfolio-delta surface to Today — "since you last opened: 3 sites added, 2 sites removed." _(Today + §10.)_
5. Add a supervisor-side "HR-pending" view for EMPLOYMENT-tier and leave-requests with SLA + escalation. _(D.1 §2.11 + E21.)_
6. Add an HR-side seed-review affordance + a supervisor-side "seeded-pending HR confirm" signal. _(§9 pick 8 + §10.)_
7. Specify multi-site leave semantics — does a leave cover all that worker's shifts that day, or only primary? Surface the answer on the leave row. _(E21 + §5.9.)_
8. Specify mid-visit AI-flag adjudication. _(C14.)_
9. Specify a site-handover prompt + LivingDoc migration on rebind. _(Product framing §17.)_
10. Add a retroactive-attendance-correction path outside the 30-min reverse. _(D.1 §2.4.)_
11. Coalesce push notifications for multi-binding events. _(Pick 5.)_
12. Extend HR Updates audience model with optional per-site routing; add filter chips. _(§4.1 future hook.)_
13. Separate operational events from binding-change events in Activity (sub-tab or filter group). _(Activity.)_
14. Add a worker push for site state changes affecting their next shift. _(B6.)_
15. Specify termination-apply push routing across binding change. _(E24 + §5.5.)_
16. Specify a worker-side termination notification + appeal / records-download. _(E24.)_

## Was the updated design actually followed consistently?

**At the data layer, yes.** Origin attribution, read-time routing, auto-revert, same-kind overlap prevention all hold across every scene tested. The account-sharing workaround is never invoked.

**At the workflow-design layer, partially.** The responsibility model holds where it speaks — but in three named places (sick supervisor empty Today, sick-supervisor authoring decisions, EMPLOYMENT-tier across absence) the design follows itself and produces a wrong human outcome the design doesn't address. Those aren't drift; they're design gaps that need closing.

Two locked-doc contradictions remain `[DRIFT]`: reverse window 30-min vs 5-min, and the Summary "atomic batches" label vs the locked "batch is grouping signal only." One frozen-design residual `[DRIFT]`: the "I'm done for today" button dropped from scope but still rendering.

The load-bearing finding from a year of Ravi's lived workflow simulation: the responsibility model holds where it speaks; most of the breakpoints live in workflow situations the design didn't anticipate — multi-site workers, sick-week author behaviour, HR queue under load, site rebinding without context, worker-side notifications, the subject of EMPLOYMENT-tier decisions. Closing those gaps is workflow-design work, not implementation work.

---

## Switching coverage appendix

Strict file-grounded check 2026-05-15 against the 6 workflow-bearing specs touched in the last 2 days (`supervisor-responsibility-model.md`, `operations-workflow-model.md`, D.1, R6, HR Updates, product-framing) surfaced ~25 distinct switching cases. The ownership split was approved by the friend; this file covers only the Ravi-scope subset. Other cases are flagged here for traceability so a reader knows where each lives.

### Switching cases covered in this file

| Case                                                                     | Source             | Scene       |
| ------------------------------------------------------------------------ | ------------------ | ----------- |
| F26.1 — window creation + push                                           | RM §5.7            | 8a          |
| F26.2 — pre-existing PROPOSED queue flip                                 | RM §5.4            | 8f          |
| F26.3 — HR Update broadcast during window                                | RM §5.5 + HRU §4.1 | 8j          |
| F26.4 — thread ownership stays + new-turn routes to current              | RM §5.5            | 8c          |
| F26.6 — sick supervisor authoring decisions                              | RM §5.5            | 8c          |
| F26.7 — auto-revert                                                      | RM §5.3            | 8e          |
| F26.8 — "while you were out" digest absence                              | RM §5.6 / §10      | 8e          |
| F26.9 — mid-shift switch (window ends early)                             | Ops §8             | 8l          |
| F26.12 — acting stacks over baseline (precedence)                        | RM §5.8            | 8a          |
| F27.1 — permanent binding                                                | RM §5.2            | 9a          |
| F27.4 — no auto-revert (implicit through Months 9–12)                    | RM §5.3            | implicit    |
| F27.5 — ramp-up via progressive bindings                                 | RM §5.7            | 9a          |
| C-7.4 — visit FLAGGED during absence                                     | Ops §7.4           | 8i          |
| C-7.5 — calendar promotion during absence                                | Ops §7.5           | 8h          |
| C-7.6 — chat→DWI propose during absence                                  | Ops §7.6           | 8c          |
| C-7.7a — apply across switch (Ravi proposes → Lakshmi acks)              | Ops §7.7           | 8d          |
| C-7.7b — apply across switch (Lakshmi proposes → Ravi applies on return) | Ops §7.7           | 8e sub-case |
| C-7.9 — replacement invite across switch                                 | Ops §7.9           | 8g          |
| C-7.12a — termination during supervisor absence                          | Ops §7.12          | 8d          |
| G-9 — DWI EXPIRED during window                                          | Ops §12 #3         | 8k          |

### Switching cases owned by Kavitha's audit (HR control-plane lens)

| Case                                                      | Source          | Notes                                                                                  |
| --------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| F26.10 — acting refuses / is also absent                  | Ops §7.10       | HR has to pick another                                                                 |
| F26.11 — HR wrong-reassignment correction via `endedAt`   | Ops §8          | HR control-plane action                                                                |
| F27.6 (orchestration side) — supervisor quits permanently | Ops §8          | HR-driven portfolio liquidation; Ravi sees the receiving-side echo briefly in Month 11 |
| F27.7 — HR absent during permanent reassignment           | Ops §7.11       | HR control-plane gap                                                                   |
| F27.8 / G-5 — bootstrap-seed correction flow              | RM pick 8 / §10 | HR seed-review affordance                                                              |
| G-1 — HR absent fallback                                  | Ops §12 #1      | HR vacation / sick day                                                                 |
| G-4 — wrong-reassignment correction audit-chain UX        | Ops §8          | HR-side reconstruction surface                                                         |

### Switching cases owned by the Combined audit (overlap stress + races)

| Case                                                           | Source     | Notes                                                               |
| -------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| F26.5 — no-overlap (acting+acting same site) violation attempt | Ops §8     | Multi-actor race                                                    |
| F27.2 — "switch all sites" convenience under live churn        | RM §5.1    | HR action + multi-supervisor effect                                 |
| F27.3 — no-overlap (permanent+permanent) violation attempt     | Ops §8     | Multi-actor race                                                    |
| C-7.3 — swap initiated then supervisor absence                 | Ops §7.3   | Multi-actor (Ravi initiates, Lakshmi inherits, two workers respond) |
| C-7.8 — HR Update ack during supervisor absence (open Q)       | Ops §12 #2 | Cross-actor open question                                           |
| C-7.12b — termination during HR absence stalls                 | Ops §7.12  | Multi-actor (proposer + HR + subject)                               |
| G-3 — acting-applied decision original disagrees with          | Ops §8     | Cross-actor formal-correction case                                  |
| G-6 — cross-supervisor "team view"                             | Ops §12 #7 | Multi-supervisor product question                                   |
| G-7 — site-level HR Updates routing                            | Ops §12 #8 | HR audience design at scale                                         |
| G-10 — FLAGGED auto-escalate during absence                    | Ops §12 #4 | HR queue + acting + cron                                            |

### Switching cases primary in Suresh's audit (worker lens)

| Case                                                | Source              | Notes                                                                    |
| --------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| G-8 — worker-side notification on supervisor change | Ops §12 #6 implicit | Lived by the worker; Ravi notes the supervisor-side gap in 8a + Month 11 |

### Cases that remain genuinely open in the specs (no Active answer yet)

These appear in the matrix above but are not resolved by any current Active spec — flagged where they surface in this audit and deferred for explicit founder review:

- G-1 HR absent fallback (ops §12 #1)
- G-2 / C-7.8 HR Update ack during supervisor absence (ops §12 #2)
- G-3 acting-applied decision original disagrees with — formal-correction UI deferred
- G-4 wrong-reassignment correction audit-chain UX
- G-5 bootstrap-seed correction surface
- G-6 cross-supervisor team view
- G-7 site-level HR Updates routing
- G-9 DWI EXPIRED threshold (ops §12 #3)
- G-10 FLAGGED auto-escalate threshold (ops §12 #4)

---

_End of Round 1 — Ravi audit (Methodology v2 revision + switching-coverage patch 2026-05-15). Rounds 2–5 (Suresh revision, Kavitha, Reddy, Combined) not written; each is a separate plan-mode pass under the same locked methodology. The switching cases owned by other files are listed above so traceability is preserved._
