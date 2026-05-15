---
Status: Audit draft
Type: 1-year persona simulation audit (Round 3 of 5)
Persona: HR — Mrs. Kavitha (master plan §O.2)
Scale: HR control-plane for Surya Cleaning at ~5,000 employees / ~100 supervisors / 5-person HR team
Primary lens: docs/specs/2026-05-14-supervisor-responsibility-model.md (Active 2026-05-14)
Secondary lenses: 2026-05-14-operations-workflow-model.md, 2026-05-12-decision-entity-lock.md (D.1), 2026-05-12-hr-updates-spec.md, 2026-05-13-product-framing.md
Round 1 (Ravi) cross-reference: docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md
Round 2 (Suresh) cross-reference: docs/audits/2026-05-14-1yr-sim-worker-suresh.md
Not added to: docs/index/canonical-truth.md (audit, not a governing spec)
Plan: /Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md
---

# Kavitha — 1-Year Simulation Audit (HR)

## Persona setup

- **Mrs. Kavitha**, 41, HR + accounts manager at Surya Cleaning. Reddy's sister-in-law (master plan §O.2).
- **Current daily workflow:** 3 Excel sheets, Tally (for accounts), Gmail, WhatsApp. Office laptop primary; phone for offline contact.
- **Named primary fear (master plan §O.2):** "Will this make payroll easier?"
- **HR team at 5K-scale:** Kavitha (lead) + 4 colleagues — **Anita** (payroll), **Vikram** (onboarding), **Priya** (compliance), **Deepak** (general queue).
- **Reddy** is hands-off operationally — he sees digests, approves bank changes, fields AI budget alerts.

## Audit method (v2 — workflow-design first)

A workflow = a real operational situation from trigger to real-world outcome, measured from the human side, over time, under pressure, with overlaps. Every scene addresses 8 elements in order: **Workflow** · **Trigger** · **Actors + authority** · **Lived experience** · **Pressure / overlap / failure** · **Outcome judgment** (tag) · **Implementation status** (one line) · **Takeaway** (one line).

`[MISSING]` = the workflow design itself doesn't cover this real-life case (not "code unbuilt"). Order rule: judge workflow design as if fully implemented; implementation status is a one-line footnote.

## HR control-plane landscape (file-grounded 2026-05-15)

Brief orientation, not the headline. The audit verdicts live in the scenes below.

- **Named but undesigned (7):** admin-web HR portal across 4 surfaces (bindings, leave queue, termination ack, HR Updates posting); bootstrap-seed review affordance (RM §10 pick 8 — "click through each"); wrong-reassignment audit-chain UX (ops §8); EMPLOYMENT-tier HR ack surface (D.1 §2.5 names `ackedAt`/`ackText` fields, surface silent); acting-coverage window creation UI (RM §5.7); permanent reassignment "switch all sites" convenience UI (RM §5.1); HR Updates ack during supervisor absence (ops §12 #2 — two paths, neither picked).
- **Code-silent (3):** POST /hr-updates unimplemented; EMPLOYMENT-tier HR-ack route absent; SiteSupervisorBinding table lands P1.5.
- **Open gaps:** G-1 HR-absent fallback (ops §12 #1 — "today: nothing"); G-2 supervisor-absent ack (ops §12 #2).
- **No multi-HR-user coordination model anywhere** — queue partitioning, race conditions, role subtypes all spec-silent.

## HR-owned switching scope (H-1 through H-9)

These are the HR-side dimensions Ravi's audit deferred here. Each gets explicit treatment.

| Tag     | Question                                                                             | Source / silence                                                                                                | Scene                     |
| ------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **H-1** | How does HR create an acting-coverage binding?                                       | RM §5.7 names "HR portfolio view" + capacity context; UI undesigned                                             | Month 8                   |
| **H-2** | How does HR create permanent reassignment, including "switch all sites" convenience? | RM §5.1 names N rows in 1 tx; UI deferred per §10                                                               | Month 9                   |
| **H-3** | How does HR end a wrong binding (F26.11)?                                            | Ops §8 names `endedAt` mechanism; correction UX deferred                                                        | Month 8                   |
| **H-4** | How does HR liquidate a quitting supervisor's portfolio (F27.6 orchestration)?       | Ops §8: "HR creates permanent SiteSupervisorBinding rows reassigning" + Membership.status INACTIVE; UI deferred | Month 11                  |
| **H-5** | What happens when HR itself is absent (G-1)?                                         | Ops §12 #1 explicit open gap                                                                                    | Month 4                   |
| **H-6** | How does HR review/correct bootstrap-seeded bindings (pick 8 / G-5)?                 | RM §10: "review and confirm affordance"; UI undesigned                                                          | Day 1 + Month 6           |
| **H-7** | What if the chosen acting supervisor refuses or is also absent?                      | Ops §7.10: "HR cancels + picks another"; no surface                                                             | Month 8 (folded with H-3) |
| **H-8** | After a wrong reassignment, how does HR reconstruct the audit chain (G-4)?           | Ops §8: deferred                                                                                                | Month 9                   |
| **H-9** | How do 5 HR users coordinate without conflicts?                                      | Spec silence — no partitioning, race resolution, role subtypes                                                  | Month 2 + Month 9         |

---

## Year-1 timeline

### Day 1 · [Layer 1+2] · Workflow: Migration onboarding from HR side (H-6)

- **Trigger:** Surya migrated overnight. Bootstrap-seed inferred ~100 supervisors' portfolios into SiteSupervisorBinding rows per pick 8. Kavitha is supposed to "review and confirm."
- **Actors + authority:** Kavitha (reviewer; no admin-web affordance). Akshay (founder, providing direct DB access). 100 inferred portfolios; 6+ have ambiguous histories (e.g., Lakeview where Ravi vs Supervisor-X both had assignments).
- **Lived experience:** 7am — she opens her laptop. The "review and confirm affordance" the spec names doesn't exist as a UI. She works with Akshay over a Sequel Pro session, running queries to spot wrong-owner cases. By noon she's flagged 6 ambiguities and emailed the 6 supervisors involved to "please confirm by EOD." Three respond; three don't.
- **Pressure / overlap / failure:** Day 1 of new month — she's also running month-end payroll on Excel + Tally in another window. The seed-correction workflow has no concept of "100-portfolio triage at scale" — she's processing it like a one-off audit.
- **Outcome judgment:** `[MISSING]` — the workflow design names a "review and confirm affordance" but provides no UI shape; HR is reduced to direct-DB + email triage.
- **Implementation status:** Seed logic locked per pick 8; review affordance design absent.
- **Takeaway:** Day-1 trust gate for HR is solving a 100-row triage with a SQL client and Gmail.

### Days 2–4 · [Layer 1] · Workflow cluster: First HR Update + first leave queue + first DOC_PENDING reviews

- **Workflow A (E23 first HR Update):** She wants to post the wage-revision update. The route is callable per HR Updates spec §2.1; admin-web UI may not expose it (spec quote). She emails Akshay: "how do I post the wage increment?" Akshay runs curl on her behalf. `[MISSING]` — caller-side UI absent in design.
- **Workflow B (E21 first leave approvals):** 3 leave requests land in her queue overnight. She needs a queue view; none exists. She gets the rows by SQL, approves by curl. `[MISSING]` — HR-side leave queue UI absent in design.
- **Workflow C (A4 first DOC_PENDING reviews):** 4 newly-invited workers are AWAITING DOCS. She emails the 4 supervisors to remind workers; there is no HR worker-state list. `[MISSING]` — HR worker-state surface absent in design.
- **Pressure:** All three in parallel + Tally + Excel + Gmail + WhatsApp. By Day 4 she's working until 9pm.
- **Outcome:** `[MISSING]` across all three — backend routes exist (or are planned) per HR Updates spec; HR-side caller surfaces are absent at the design level.
- **Implementation status:** Routes partially present; UIs absent.
- **Takeaway:** HR can DO the actions where backend exists; the design has no caller-side workflow surface, so she's running operations through SQL + curl + email.

### Week 4 · [Layer 1] · Workflow: First monthly payroll close (master plan §O.2 primary fear)

- **Trigger:** Month 1 ends. Payroll for ~5,000 workers due in 3 days.
- **Actors + authority:** Kavitha (lead). Anita (payroll specialist). Tally (accounting). Bank disbursement file.
- **Lived experience:** Per operations model §13, payroll processor is a stub. Outbox `payroll.recompute` fires but no handler. She + Anita pull an Excel export from Axhy attendance data, reconcile against Tally, manually generate the bank file. Master plan §O.2's named fear ("will this make payroll easier?") gets a Month 1 answer of "no — payroll is now Axhy + Tally + Excel instead of just Tally + Excel."
- **Pressure / overlap / failure:** 5K workers, 30 sites, varying shifts, festival adjustments. Manual reconciliation eats 3 days.
- **Outcome judgment:** `[MISSING]` — payroll handler is a design stub deferred to Phase D. The workflow as designed adds an Axhy reconciliation step to her existing process without replacing anything.
- **Implementation status:** Outbox topic exists; handler absent in design (Phase D scope per operations model §13).
- **Takeaway:** Master plan's named primary HR fear gets a Month-1 "not yet."

### Month 2 · [Layer 2] · Workflow: Festival queue spike + multi-HR collision (H-9)

- **Trigger:** Monsoon flu festival weekend. 80+ leave requests land in one week across the company.
- **Actors + authority:** All 5 HR users (Kavitha + Anita + Vikram + Priya + Deepak). Workers (subjects). Supervisors (submitters). The single shared queue (no partitioning).
- **Lived experience:** They informally pass rows via Gmail ("I'll take the Banjara ones, you take Madhapur"). No partitioning at the backend. Kavitha and Anita both approve a Krishna-leave row simultaneously. Per ops §8 in-progress collision row: "each is its own row (no dedup by content)." Two approval audit events; one wins the state-machine race; the other quietly fails. The conflict is noticed 2 days later when Ravi flags an inconsistency.
- **Pressure / overlap / failure:** 80 requests in a week is too many for direct-DB triage. They cherry-pick obvious approvals + email the rest to supervisors with "is this urgent?"
- **Outcome judgment:** `[MISSING]` — workflow design has no multi-HR-user queue partitioning. `[BROKEN]` — at 5K-scale with no queue model, HR-team actions collide silently.
- **Implementation status:** No queue model in design; no partitioning, no lock semantics, no role subtypes.
- **Takeaway:** Multi-HR coordination is the spec's biggest silence; the first festival exposes it.

### Month 4 · [Layer 1+2] · Workflow: HR absent fallback (H-5)

- **Trigger:** Reddy's family wedding. Kavitha gone Friday–Sunday.
- **Actors + authority:** Anita + Vikram (covering Kavitha's queue, no formal authority transfer). Reddy (cannot inherit HR authority — no HR Membership; route auth would refuse). The queue (sitting).
- **Lived experience:** Anita can take some Kavitha actions because the backend routes don't distinguish HR users — but she doesn't have Kavitha's context (Kavitha had been triaging a wrongful-termination escalation Thursday evening; only she knows the details). On Friday a supervisor whose worker needs urgent termination ack calls her cell; she's at the wedding and can't help. The decision sits 3 days.
- **Pressure / overlap / failure:** Email auto-reply says "back Monday." The workflow design has no spec content on what happens when HR is unreachable. Owner inherits / second-HR-promotion / queue-with-no-SLA were all named as options in ops §12 #1; none picked.
- **Outcome judgment:** `[MISSING]` — workflow design has no HR-absent fallback. The lack of a pick is itself the gap.
- **Implementation status:** Open per ops §12 #1.
- **Takeaway:** When Kavitha takes a long weekend, real operational work waits 72 hours.

### Month 5 · [Layer 1] · Workflow: HR-observed site auto-suspension

- **Trigger:** Vasanth Vihar auto-suspends after 3 complaint thresholds.
- **Actors + authority:** System state machine (auto). Kavitha (observer; receives outbox email digest the next morning).
- **Lived experience:** Email digest at 7am: "Vasanth Vihar suspended." She didn't trigger it. She has to figure out who to communicate to: the client (commercial relationship)? The workers who showed up to a closed building (operational)? The supervisor (organisational)? The design says nothing about which of these is HR's job.
- **Pressure / overlap / failure:** Auto-state events have no ownership clarity. She defaults to "all three" — emails the client, asks Ravi to call the affected workers, posts an internal note.
- **Outcome judgment:** `[MISSING]` — site-auto-state cascade has no HR-side ownership / responsibility surface in design.
- **Implementation status:** State machine present; HR-ownership rules absent.
- **Takeaway:** Auto-events arrive without ownership — no spec says whether HR should reach out to client, workers, or supervisor.

### Month 6 · [Layer 2] · Workflow: Queue saturation peak (Ravi/Suresh Month 6 from HR side)

- **Trigger:** Krishna's urgent Saturday medical leave lands Friday morning. Bootstrap-seed review backlog still ~30 rows unfinished. 7 EMPLOYMENT-tier reviews ahead. Diwali leave queue early signals starting.
- **Actors + authority:** Kavitha (saturated). Ravi (Krishna's submitter). Krishna (subject). 4 HR colleagues parallel-busy.
- **Lived experience:** Friday's queue has 47 items. No urgent-flag rendering, no SLA timer, no triage signal. Krishna's request title says "urgent" but the queue ordering is just chronological. She doesn't see it until 9pm Friday. Saturday Krishna doesn't show; Ravi marks absent; the retroactive correction loop fires Sunday (see Ravi Month 6).
- **Pressure / overlap / failure:** HR-as-bottleneck is invisible from HR's own side. The workflow design treats HR as instant; under sustained load the supervisor side sees workflow failures (workers stranded) but HR side has no way to triage on priority.
- **Outcome judgment:** `[BROKEN]` — the workflow design's HR-instant assumption produces lossy outcomes under real load. `[MISSING]` for triage signals.
- **Implementation status:** Queue rows present; priority/SLA/triage surface absent.
- **Takeaway:** HR-as-bottleneck is invisible from HR's own side because the design didn't model sustained load.

### Month 7 · [Layer 1] · Workflow: EMPLOYMENT-tier proposal sits in queue (H-7 ack surface)

- **Trigger:** Ravi proposes Mahesh's termination via the supervisor typed-phrase flow. Decision lands in HR queue waiting for Kavitha's typed-phrase final ack.
- **Actors + authority:** Ravi (proposer; phrase typed). Kavitha (final ack-er; phrase TBD). Mahesh (subject, unaware).
- **Lived experience:** The decision row lands. She has no admin-web typed-phrase surface. The route is planned per master plan §G HR-confirms lock; no current implementation. Her view of the decision is just the row + Ravi's typed phrase. She doesn't see Ravi's chat context; she doesn't see Mahesh's full attendance/complaint history without running additional queries. She defers it — 4 days in queue.
- **Pressure / overlap / failure:** She's also doing payroll close + seed cleanup + festival prep. EMPLOYMENT-tier decisions deserve careful review but the design provides no decision-support — no worker history dashboard, no proposer-context view.
- **Outcome judgment:** `[MISSING]` — workflow design names ack-fields (`ackedAt`/`ackText`) but has no HR-side surface for the typed-phrase ack on terminations + no decision-support view.
- **Implementation status:** Fields defined; surface absent in design.
- **Takeaway:** The year's most consequential workflow gives HR a row + a supervisor's phrase, with no decision-support around it.

### Month 8 · [Layer 1+2] · Workflow cluster: Acting-coverage creation + wrong-binding correction (H-1 + H-3 + H-7)

- **Trigger:** Ravi calls 9am Monday: "2 hafta rest, dengue."
- **Actors + authority:** Kavitha (binding creator). Ravi (off-point). Initially Anjali (Kavitha's first pick); then Lakshmi.
- **Lived experience:** Kavitha opens her direct-DB tool. She inserts 8 SiteSupervisorBinding rows for Anjali (her first instinct — Anjali is experienced). Per pick 5 a push fires per binding (8 pushes to Anjali). Within 30 minutes she realizes Anjali is already overloaded with 7 sites + an in-progress supervisor-quitter portfolio she'd been assigned. She rolls back: 8 `endedAt = NOW` updates on the Anjali rows, then 8 new rows for Lakshmi. Lakshmi gets her 8 pushes. Anjali sees her 8 bindings disappear from her Today the next morning with no explanation; she WhatsApps Kavitha asking what happened.
- **Pressure / overlap / failure:** The correction mechanism (`endedAt`) is named in ops §8 but the workflow has no audit-reconstruction UX. Anjali experiences a confusing burst (8 pushes "you're covering," 8 silent bindings disappearing). Kavitha has no way to send Anjali a "sorry, my mistake, here's why" notification. Same case folds H-7: Anjali implicitly "refused" (overloaded) — the design names "HR cancels + picks another" but the cancellation has no audit narrative or affected-person communication.
- **Outcome judgment:** `[WORKS]` for the mechanism (bindings end correctly via `endedAt`). `[MISSING]` for H-3 — correction has no audit-reconstruction UX, no affected-person communication, no "mistake-reason capture." `[MISSING]` for H-7 — the cancel-and-repick flow has no surface.
- **Implementation status:** Mechanism present; correction UX + audit narrative absent.
- **Takeaway:** Reassignment mistakes are correctable in data; the human consequence (confused acting candidates, lost trust) has no design.

### Month 9 · [Layer 1+2] · Workflow: Progressive permanent reassignment under multi-HR churn (H-2 + H-8 + H-9)

- **Trigger:** Anjali's ramp-up — Kavitha will move 4 of Ravi's sites to Anjali over 4 weeks. Same period, Anita is rebalancing 2 over-loaded supervisors' portfolios, and Vikram is placing a new hire.
- **Actors + authority:** Kavitha + Anita + Vikram in parallel. 5 supervisors touched. ~200 workers affected.
- **Lived experience:** No "switch all sites" convenience UI — each binding is a manual INSERT. They use Gmail to coordinate ("I'm doing the Anjali rebinds Tuesday morning, please don't touch Manikonda"). Mid-week Anita moves site Z from Supervisor-Z to Supervisor-A; later Kavitha (not knowing about Anita's move) moves site Z to Anjali — except the binding constraint refuses because A's binding is still active. The audit chain shows multiple `BINDING_CREATED` + `BINDING_ENDED` rows for site Z, but no narrative connecting them.
- **Pressure / overlap / failure:** Multi-direction churn + no UI + no coordination model. They get through it by Gmail + WhatsApp; the audit chain becomes unreadable post-hoc.
- **Outcome judgment:** `[MISSING]` for H-2 (no bulk-action UI). `[MISSING]` for H-9 (no multi-HR coordination model). `[MISSING]` for H-8 (no audit-chain reconstruction UX after the fact).
- **Implementation status:** Binding INSERT/`endedAt` mechanism present; bulk UI + coordination + audit-chain narrative absent.
- **Takeaway:** Multi-direction churn at 5K-scale runs on Gmail coordination because the workflow design has none of: bulk-action UX, multi-HR partitioning, audit-chain reconstruction.

### Month 10 · [Layer 1+2] · Workflow: Diwali queue spike (recurrence of Month 2)

- **Trigger:** Diwali. 80+ leave requests + a festival-bonus eligibility HR Update.
- **Actors + authority:** All 5 HR users.
- **Lived experience:** Same shape as Month 2. Same collisions. Same Gmail triage. They got slightly better at calling out "I'm taking these 10 rows" upfront but the underlying gap is identical.
- **Pressure / overlap / failure:** No learning loop in the design — the surface hasn't changed since Month 2.
- **Outcome judgment:** `[MISSING]` / `[BROKEN]` — same as Month 2.
- **Implementation status:** Same.
- **Takeaway:** Diwali is a stress test the design fails identically to the festival in Month 2.

### Month 11 · [Layer 1] · Workflow cluster: Mahesh termination final-ack (H-7 ack surface) + supervisor quits (H-4 orchestration)

**Workflow A — Mahesh's termination final ack:**

- **Trigger:** Mahesh's termination (proposed Month 7) has waited 4 months in HR queue. Kavitha finally types her phrase.
- **Lived experience:** She runs curl for the ack — no admin-web surface. Audit event fires. She then phones Mahesh personally: "boss, sorry, your services are no longer needed." No system push to Mahesh.
- **Outcome:** `[MISSING]` — HR-side ack surface absent + worker-side notification absent (Suresh's audit owns the worker-side gap).
- **Takeaway:** The year's most trust-consequential moment runs through curl + a personal phone call.

**Workflow B — Supervisor-Y quits (H-4):**

- **Trigger:** Supervisor-Y (5-year tenure peer of Ravi's) resigns effective immediately. 8 sites in his portfolio.
- **Actors + authority:** Kavitha (orchestrator). 3 receiving supervisors (Ravi gets 3, two others split the rest). Membership.status INACTIVE transition.
- **Lived experience:** She manually creates 8 permanent binding rows distributed across 3 supervisors, then updates Supervisor-Y's Membership.status to INACTIVE. The "transfer portfolio" UI is deferred per ops §8 — she does it via direct-DB. Workers at the 8 sites learn from their incoming supervisors' WhatsApp introductions (the same G-8 silence Suresh's audit named).
- **Outcome judgment:** `[MISSING]` — workflow design names the mechanism, defers the UI. At 5K-scale this is roughly a monthly operation; doing it via DB is fragile and slow.
- **Implementation status:** Mechanism present; portfolio-liquidation UI absent.
- **Takeaway:** Supervisor-quits is a high-stakes orchestration the design names but provides no surface for.

### Month 12 · [Layer 1] · Workflow: Year-end attestation + annual payroll close

- **Trigger:** Year-end. Year-end attestation HRUpdate + annual payroll close (more complex than monthly).
- **Lived experience:** Same surfaces as Month 4 payroll, now with year-end true-up across all 5,000 workers. Still Excel + Tally with Axhy as a reconciliation source. She posts the year-end attestation via curl through Akshay.
- **Outcome judgment:** `[MISSING]` — payroll handler still a stub; year-end true-up has no spec content.
- **Implementation status:** Same as Month 4.
- **Takeaway:** Year-end compounds Month 4's payroll surface gap; HR finishes the year still primarily on Excel.

---

## What worked (workflow-design judgments)

**Layer 1 — local:**

- Backend routes that exist (leave approve/reject at `leave-requests.ts:125`) work as designed when she can reach them via curl.
- The data layer for bindings, audit events, HRUpdate rows is sound and produces the correct stored state across all her actions.
- The 30-min reverse window on supervisor-side errors does catch some retroactive corrections before they reach her queue.

**Layer 2 — cross-level:**

- Where the workflow design speaks (responsibility binding mechanism, HR Updates audience model, leave-request state machine), it speaks consistently.

That is approximately the entire list. Everything else is `[MISSING]` (design gap), `[BROKEN]` (design produces wrong outcome under real load), or both.

## What became confusing

**Layer 1 — local:**

- HR-observed-but-didn't-trigger events (site auto-suspension, AI flags) have no ownership clarity — she defaults to "all three audiences."
- EMPLOYMENT-tier reviews give her a row + a supervisor's phrase with no decision-support (no chat context, no worker history dashboard).
- Reassignment mistakes have no affected-person communication path — Anjali got 8 silent disappearing bindings with no explanation.

**Layer 2 — cross-level:**

- Multi-HR coordination has no spec; collisions surface late (Month 2 + Month 9).
- Audit chain after multi-direction churn is unreadable post-hoc.

## What broke

**Layer 1 — local:**

- HR-as-bottleneck design treats HR as instant; queue saturation produces lossy outcomes for workers (Krishna stranded, Mahesh waiting 4 months).
- HR-absent fallback is non-existent — long weekends are operationally costly (Month 4).

**Layer 2 — cross-level:**

- Multi-HR-user queue collisions at 5K-scale produce silent duplicate / failed approvals (Month 2 Krishna case).
- Multi-direction permanent rebalances under concurrent HR action produce an unreadable audit chain (Month 9).

## What is missing in design

The workflow design itself has no answer for:

1. Admin-web HR portal across all 4 named surfaces (bindings, leave queue, termination ack, HR Updates posting).
2. Multi-HR-user queue partitioning, collision resolution, and role subtypes.
3. HR-absent fallback (G-1).
4. Bootstrap-seed review affordance UI (named "click through each," undesigned).
5. EMPLOYMENT-tier HR-ack surface with decision-support (chat context, worker history dashboard).
6. Wrong-reassignment correction audit-chain reconstruction UX (G-4 / H-8).
7. "Switch all sites" bulk-reassignment convenience UI.
8. Acting-supervisor cancel-and-repick affordance with affected-person communication (H-7).
9. Site auto-event HR-ownership rules.
10. Queue triage signals (urgent flag, SLA timer, priority ordering).
11. Payroll handler (operations model §13 — Phase D scope).

## What should change before implementation

Ordered by operational impact, not by ease:

1. **Multi-HR coordination model first.** Queue partition + lock semantics + role subtypes (compliance / onboarding / payroll / general). At 5K-scale the spec silence here is the single biggest operational risk.
2. **HR-absent fallback pick.** Owner-inherits / second-HR / queue+SLA — pick one. Open since 2026-05-14 in ops §12 #1.
3. **Queue-priority signals.** Urgent flag, SLA timer, age-based escalation. Without these HR cannot triage at sustained load.
4. **EMPLOYMENT-tier HR-ack surface with decision-support.** Show the supervisor's chat context + worker history dashboard alongside the typed-phrase ack field. Without it she acks on intuition.
5. **Admin-web HR portal v1 across the 4 named surfaces.** Even read-only with curl-fallback for actions is better than direct-DB.
6. **Bootstrap-seed review affordance** as the spec already named (the "click through" UI). The fact that Day 1 onboarding runs on SQL+Gmail is a design choice that screams "afterthought."
7. **"Switch all sites" bulk-reassignment UI** with audit-chain narrative reconstruction.
8. **Acting-supervisor cancel-and-repick affordance** with structured affected-person notification.
9. **Site auto-event HR-ownership rules.** When the system fires an auto-state-transition, the design must say who owns the human follow-ups.
10. **Payroll handler.** Master plan §O.2 named primary fear gets a workflow-design answer or HR's churn becomes the launch risk.

## Was the updated design actually followed consistently?

**The workflow design treats HR as a control plane, but specifies the control plane as policies + database mutations without surfaces.** Where the design speaks (responsibility binding rules, HR Updates audience model, leave-request states), it speaks consistently and Kavitha can comply. Where it stops speaking — which is everywhere she actually does day-to-day work — the gap is uniform.

She is the operational center of the system at 5K-scale. The design treats her as an actor with no UI, no queue model, no decision-support, no coordination model, no fallback. This is not implementation lag; the workflow design itself has not yet been written for the surface she uses every day.

The load-bearing finding from a year of Kavitha's lived workflow simulation: **the HR control-plane is contract-complete at the data / state-machine layer and contract-empty at the operational-workflow layer.** Closing the operational layer is workflow-design work, not implementation work — and it's the work that decides whether the design can survive contact with a real 5K-employee HR team.

---

## HR-side switching coverage appendix

Strict file-grounded check 2026-05-15 against the 6 workflow-bearing specs surfaced the HR-owned switching cases. Cross-referenced from Ravi's switching coverage appendix as "owned by Kavitha." Cases owned by other files listed for traceability.

### Switching cases covered in this file

| Case                                                               | Source                            | Scene                     |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------- |
| H-1 — acting-coverage window creation                              | RM §5.7                           | Month 8                   |
| H-2 — permanent reassignment incl. switch-all convenience          | RM §5.1 + §10                     | Month 9                   |
| H-3 — wrong-binding correction via `endedAt` (F26.11)              | Ops §8                            | Month 8                   |
| H-4 — supervisor-quits portfolio liquidation (F27.6 orchestration) | Ops §8                            | Month 11                  |
| H-5 — HR-absent fallback (G-1)                                     | Ops §12 #1                        | Month 4                   |
| H-6 — bootstrap-seed review/correction (pick 8 / F27.8 / G-5)      | RM §10 + pick 8                   | Day 1 + Month 6           |
| H-7 — acting supervisor refuses / is also absent (F26.10 / C-7.10) | Ops §7.10                         | Month 8 (folded with H-3) |
| H-8 — wrong-reassignment audit-chain reconstruction (G-4)          | Ops §8                            | Month 9                   |
| H-9 — multi-HR-user coordination                                   | Spec silence (across all 6 specs) | Month 2 + Month 9         |

### Switching cases owned by Ravi's audit (supervisor lens)

F26.1 / F26.2 / F26.3 / F26.4 / F26.6 / F26.7 / F26.8 / F26.9 / F26.12, F27.1 / F27.4 / F27.5, C-7.4 / C-7.5 / C-7.6 / C-7.7a / C-7.7b / C-7.9 / C-7.12a, G-9 — see Ravi's switching coverage appendix at `2026-05-14-1yr-sim-supervisor-ravi.md`.

### Switching cases owned by Suresh's audit (worker lens)

W-1 through W-8 — worker-side notification, decision visibility, leave status visibility, replacement-invite respond, trust transition, decision continuity across switch — see Suresh's switching coverage appendix at `2026-05-14-1yr-sim-worker-suresh.md`.

### Switching cases owned by the Combined audit (overlap stress + races)

F26.5 (no-overlap acting+acting violation), F27.2 (switch-all under live churn), F27.3 (no-overlap permanent+permanent violation), C-7.3 (swap initiated then supervisor absence), C-7.8 (HR Update ack during supervisor absence — explicit open question), C-7.12b (termination during HR absence stalls), G-3 (acting-applied decision original disagrees with), G-6 (cross-supervisor team view), G-7 (site-level HR Updates routing), G-10 (FLAGGED auto-escalate during absence).

### Cases owned by Reddy's audit (owner lens — Round 4)

Bank account / tenant settings authority (per ops §9.2); G-1 owner-inheritance option (if it ever becomes the pick); AI budget alerts (G29) — Reddy's perspective.

### Cases that remain genuinely open in the specs

- G-1 HR-absent fallback (ops §12 #1) — Kavitha's Month 4 surfaces it
- G-2 / C-7.8 HR Update ack during supervisor absence (ops §12 #2)
- G-3 acting-applied decision original disagrees with — formal-correction UI deferred
- G-4 wrong-reassignment correction audit-chain UX — Kavitha's Month 9 surfaces it
- G-5 bootstrap-seed correction surface — Kavitha's Day 1 surfaces it
- G-6 cross-supervisor team view
- G-7 site-level HR Updates routing
- G-9 DWI EXPIRED threshold (ops §12 #3)
- G-10 FLAGGED auto-escalate threshold (ops §12 #4)
- Multi-HR-user coordination model (no spec content anywhere) — Kavitha's largest design gap

---

_End of Round 3 — Kavitha audit (Methodology v2 + HR-owned switching coverage). Rounds 4–5 (Reddy, Combined) not written; each is a separate plan-mode pass under the same locked methodology._
