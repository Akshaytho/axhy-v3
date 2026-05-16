---
Status: Audit draft
Type: 1-year persona simulation audit (Round 4 of 5)
Persona: OWNER — Mr. Reddy (master plan §O.1)
Scale: Founder + bank-authority owner of Surya Cleaning at ~5,000 employees / ~100 supervisors / 5-person HR team
Primary lens: docs/specs/2026-05-14-supervisor-responsibility-model.md (Active 2026-05-14)
Secondary lenses: 2026-05-14-operations-workflow-model.md, 2026-05-12-decision-entity-lock.md (D.1), 2026-05-12-hr-updates-spec.md, 2026-05-13-product-framing.md
Cross-references: docs/audits/2026-05-14-1yr-sim-supervisor-ravi.md · 2026-05-14-1yr-sim-worker-suresh.md · 2026-05-15-1yr-sim-hr-kavitha.md
Not added to: docs/index/canonical-truth.md (audit, not a governing spec)
Plan: /Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md
---

# Reddy — 1-Year Simulation Audit (Owner)

## Persona setup

- **Mr. Reddy**, 52, founder of Surya Cleaning. 18 years running the company. Hyderabad-based.
- **Daily reality:** NOT a daily Axhy user. Operations run through his sister-in-law **Kavitha** (HR) and his ops manager. He keeps WhatsApp open all day.
- **Phone + comms:** WhatsApp primary. Doesn't read English fluently. Reads Telugu, speaks Hindi.
- **Named fears (master plan §O.1):** client complaints; software he doesn't understand.
- **Decision discipline:** 2–9 month cycle. ₹15–30K/month budget; walks at ₹50K. Approval gate: "does my friend already use this?" + visible ROI.
- **Authority he uniquely holds:** bank-account / tenant-settings changes (per ops §9.2); approves digests; final word on high-stakes interventions when Kavitha brings them up.

## Audit method (v2 — workflow-design first)

Every scene addresses 8 elements in order: **Workflow** · **Trigger** · **Actors + authority** · **Lived experience** · **Pressure / overlap / failure** · **Outcome judgment** (tag) · **Implementation status** (one line) · **Takeaway** (one line). `[MISSING]` = workflow design doesn't cover the case (not "code unbuilt"). Order rule: judge workflow design first; implementation status is a one-line footnote.

## Owner control-plane landscape (brief orientation)

What the spec gives Reddy across the 6 workflow-bearing files:

- **Bank-account / tenant settings authority** — ops §9.2 row: "OWNER · Planned (admin-web /owner)." Surface beyond AI budget alerts is unbuilt at design level.
- **AI budget alerts** — ops §G29 names 80% warning + 100% cap outbox alerts to owner. The reset-ai-spend cron resets at UTC midnight.
- **Owner-inheritance option for HR-absent fallback (G-1)** — named in ops §12 #1 as one of three options; not picked.
- **No owner digest spec.** What he sees daily / weekly / monthly is not specified anywhere across the 6 specs. Not in operations workflow model, not in product framing, not in R6 (which is supervisor-only).
- **No owner-override workflow** for high-consequence decisions (terminations, large reassignments). Spec is silent on whether and how Reddy ever sees these.
- **No owner-side audit / compliance surface** for legal review. He's the legal owner; the surface doesn't speak to him as a legal actor.

## Owner-owned scope (O-1 through O-8)

These are the cases the spec gives Reddy as actor or audience. Cross-referenced from Kavitha's appendix as "owned by Reddy's audit."

| Tag     | Question                                                                                                 | Source / silence                                                 | Scene                                |
| ------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| **O-1** | How does Reddy authorise a bank-account / tenant-settings change?                                        | Ops §9.2 row: "Planned (admin-web /owner)" — surface unspecified | Month 4                              |
| **O-2** | How does Reddy receive and act on AI budget alerts (80% warn, 100% cap)?                                 | G29 names the alerts; action surface undesigned                  | Month 3 + Month 6                    |
| **O-3** | What does the owner digest contain, at what cadence?                                                     | Spec silence across all 6 specs                                  | Month 1 + Month 12                   |
| **O-4** | Does Reddy inherit HR authority when Kavitha is absent (G-1 option)?                                     | Named option in ops §12 #1; not picked                           | Month 4 (cross-ref to Kavitha's H-5) |
| **O-5** | What operational events surface to Reddy as digest items?                                                | Spec silence                                                     | Months 5, 8, 9, 11                   |
| **O-6** | What can Reddy access for legal / compliance audit?                                                      | Spec silence on owner-audit surface                              | Critique section                     |
| **O-7** | What company KPI / health surface does Reddy see?                                                        | Spec silence                                                     | Month 6 + Month 12                   |
| **O-8** | How does Reddy get pulled into high-stakes operational decisions (large terminations, supervisor-quits)? | Spec silence                                                     | Month 11                             |

---

## Year-1 timeline

### Day 1 · [Layer 1] · Workflow: Bank-account confirmation at migration

- **Trigger:** Surya migrated overnight. The migration imported Worker bank rows from Tally; Reddy needs to confirm the tenant's master bank account (the payroll-disbursement source).
- **Actors + authority:** Reddy (sole bank-change authority per ops §9.2). Akshay (founder, walking him through). Kavitha (asking him to confirm).
- **Lived experience:** Kavitha calls Reddy 11am: "boss, sign-off chahiye for the migration; bank confirm karna hai." Reddy opens his phone; no /owner admin-web. Akshay sends him a screenshot of the master bank record over WhatsApp; Reddy replies "haan, theek hai" via voice note. Akshay records the confirmation in a separate log. Reddy never sees the system again that day.
- **Pressure / overlap / failure:** The workflow design says owner has bank-change authority; the surface for him to exercise it is not designed. Confirmation happens through screenshot + voice-note + manual log — the same pattern as Kavitha's Day 1 SQL+email triage.
- **Outcome judgment:** `[MISSING]` — workflow design names owner-authority over bank/tenant settings but provides no surface; consequence is manual-trust-chain (Akshay vouches for the screenshot).
- **Implementation status:** /owner admin-web stub exists for AI budget alerts only; bank-confirmation surface absent in design.
- **Takeaway:** Day-1 owner sign-off uses WhatsApp screenshots and Akshay as the trust anchor.

### Month 1 · [Layer 1] · Workflow: First monthly owner digest

- **Trigger:** End of month 1. Reddy expects to see how Surya did.
- **Actors + authority:** Kavitha (writes the digest). Reddy (recipient). Anita (payroll close).
- **Lived experience:** No automated owner digest exists in any spec. Kavitha sends Reddy a WhatsApp summary at month-end she composes manually from her Excel sheets + Axhy data + Tally: "Boss, this month: 5,012 workers active, 31 sites, ₹2.3 cr payroll, 14 client complaints, 3 site suspensions, 87 leaves approved. ₹14L AI spend (Akshay paid). Friend at Sodexo says he's happy with their version."
- **Pressure / overlap / failure:** The digest is composed by hand. Whether the numbers are reconciled against Axhy correctly depends on Kavitha's diligence; Reddy has no way to spot-check from his side. The workflow design has no spec for owner-digest content, cadence, or auto-composition.
- **Outcome judgment:** `[MISSING]` — no spec content anywhere defines owner digest. The fact that Kavitha hand-composes via WhatsApp is the default that fills the design vacuum.
- **Implementation status:** Owner digest absent in design and code.
- **Takeaway:** Owner-visibility runs through Kavitha's WhatsApp summary because the spec doesn't model what the owner should see.

### Month 3 · [Layer 1] · Workflow: First AI budget alert (O-2 — 80% warning)

- **Trigger:** Surya's monthly AI spend hits 80% of the cap on the 24th. G29 outbox fires.
- **Actors + authority:** System (cron + outbox). Reddy (alert recipient). Akshay (the one who actually understands what to do).
- **Lived experience:** Reddy receives a push notification: "AI spend at 80% of monthly cap (₹4L of ₹5L). Reset on the 1st." He doesn't fully understand what "AI spend" is — Kavitha explained it once. He WhatsApps Akshay: "boss, kya hua, kuch problem hai?" Akshay replies "no, just informational, normal usage, will reset Sunday." Reddy ignores.
- **Pressure / overlap / failure:** The alert workflow fires correctly per G29; the consequence-comprehension surface is silent. A 52-year-old founder who doesn't read English well receives a system push that is technically accurate but operationally meaningless to him without a translator.
- **Outcome judgment:** `[WORKS]` design-mechanically — the alert fires at the right threshold. `[CONFUSING]` workflow-experientially — the alert content doesn't speak to the owner's actual decision-question ("should I do something?").
- **Implementation status:** Outbox alert present; owner-side action surface + plain-English framing absent in design.
- **Takeaway:** AI budget alerts technically reach Reddy; their meaning reaches him via Akshay's WhatsApp.

### Month 4 · [Layer 1] · Workflow: Bank-routing detail change + Kavitha-absent overlap (O-1 + O-4)

- **Trigger:** Monthly payroll close. Surya's bank changed the routing on the disbursement account; the tenant settings need updating. Same week, Kavitha is at Reddy's family wedding (Kavitha Month 4).
- **Actors + authority:** Reddy (bank-change authority). Anita (payroll specialist, technically can run payroll but cannot change bank settings). Kavitha (unreachable).
- **Lived experience:** Anita calls Reddy Friday afternoon: "boss, bank routing change ho gaya hai, settings update karna hai, payroll Monday hai." Reddy needs to authorize. No /owner admin-web surface for tenant settings. Akshay is at the wedding too. They WhatsApp screenshots back and forth. Akshay updates the DB on Monday morning before payroll. Reddy never sees the change in any system.
- **Pressure / overlap / failure:** The workflow design names owner-authority over tenant settings; no surface to exercise it. **Folding O-4:** because Kavitha is absent, Reddy has no fallback to lean on — he's the legal owner but doesn't have HR's operational context; he can't (and shouldn't) inherit HR authority in any informal sense; spec is silent on this anyway.
- **Outcome judgment:** `[MISSING]` for O-1 — tenant-settings change has no owner surface; relies on Akshay's manual DB update. `[MISSING]` for O-4 — owner-inheritance option in G-1 is named but not picked; no fallback in either direction.
- **Implementation status:** /owner admin-web stub only covers AI budget alerts; tenant-settings surface absent.
- **Takeaway:** A routine bank change requires a founder-engineer with DB access; the owner's actual authority is exercised by proxy.

### Month 5 · [Layer 1] · Workflow: Site auto-suspension digest (O-5)

- **Trigger:** Vasanth Vihar auto-suspends (Ravi Month 5 + Kavitha Month 5).
- **Actors + authority:** System (state transition). Reddy (does he learn about this?).
- **Lived experience:** Kavitha's automatic WhatsApp digest the next morning mentions: "Vasanth Vihar suspended yesterday due to complaints. Restoring soon." Reddy nods. He has no way to ask "why" inside any system; he calls Kavitha if curious. He's curious; she explains the complaint pattern. Decision: he doesn't need to act.
- **Pressure / overlap / failure:** Site-state cascade has no owner-side surface; what reaches him is whatever Kavitha summarises. If she didn't include it (busy week), he wouldn't know.
- **Outcome judgment:** `[MISSING]` — workflow design has no operations-to-owner notification path; owner-awareness is whatever HR remembers to surface.
- **Implementation status:** Outbox digests for owner not designed.
- **Takeaway:** What the owner knows about operational events depends entirely on what HR remembers to mention.

### Month 6 · [Layer 1] · Workflow: Mid-year review with Akshay (O-2 + O-7)

- **Trigger:** Reddy meets Akshay for tea. Reddy asks: "boss, paisa wasool aa raha hai?"
- **Actors + authority:** Reddy (asking). Akshay (showing).
- **Lived experience:** Akshay opens a laptop and runs queries: worker count, site count, supervisor count, payroll trend, AI spend (which has fired three 80% warnings by now). Reddy looks at the numbers but doesn't interact with the laptop. They discuss whether the Sodexo-friend's continued usage is a good signal (yes). Reddy approves continuing the annual contract.
- **Pressure / overlap / failure:** The owner-KPI surface (O-7) is Akshay's laptop + queries. There is no /owner KPI dashboard in the design. The friend-as-approval-signal works because Reddy trusts the channel; the system isn't part of the decision.
- **Outcome judgment:** `[MISSING]` — workflow design has no owner-KPI surface. Trust chain runs through Akshay + friend, not through the product.
- **Implementation status:** /owner admin-web stub covers AI budget alerts; KPI dashboard absent.
- **Takeaway:** Mid-year review runs on Akshay's laptop + a 20-year friend's recommendation, not on any owner surface.

### Month 8 · [Layer 1] · Workflow: Ravi sick-week digest (O-5 + O-8)

- **Trigger:** Ravi's sick week (Ravi Month 8 + Kavitha Month 8). Lakshmi acting cover for 14 days. F26 binding correction mid-week.
- **Actors + authority:** Kavitha (handles operationally). Reddy (does he get visibility?).
- **Lived experience:** Kavitha's WhatsApp digest mentions Ravi's absence at the start: "boss, Ravi sick, Lakshmi covering for 2 weeks." That's it. The wrong-binding correction that nearly went to Anjali, the 8-push burst, the termination-from-bed (Day 222), the day-234 return — none of these reach Reddy. He doesn't ask.
- **Pressure / overlap / failure:** The workflow design has no owner-side surface for operational incidents; Kavitha decides what to surface. Lower-severity churn within a sick week is below her digest threshold even if it's operationally significant.
- **Outcome judgment:** `[MISSING]` — workflow design provides no owner-incident-digest spec; Reddy sees a one-line "Ravi sick" and nothing else.
- **Implementation status:** No owner-incident notification path in design.
- **Takeaway:** A 2-week operational stress event reaches Reddy as one sentence in Kavitha's WhatsApp, because the design provides no other channel.

### Month 11 · [Layer 1] · Workflow: Mahesh termination + supervisor-quits (O-8)

- **Trigger:** Mahesh's EMPLOYMENT-tier termination applies (Ravi Month 11 + Kavitha Month 11). Supervisor-Y resigns; Kavitha liquidates the 8-site portfolio.
- **Actors + authority:** Kavitha (orchestrator). Reddy (does he need to authorize anything?).
- **Lived experience:** Mahesh's termination — Kavitha mentions it in the monthly digest as a single line: "1 termination this month (3rd this year)." No EMPLOYMENT-tier rollup of "who got terminated and why" reaches Reddy. Supervisor-Y's resignation — Kavitha calls Reddy: "boss, Vikram quit kar gaya, 8 sites mein redistribute kar diya, theek?" Reddy says haan; doesn't see any system view.
- **Pressure / overlap / failure:** Two high-stakes events in one month. The termination passes as one-line digest content. The supervisor-quit happens by phone call. The workflow design has no "owner approval for high-consequence operational events" path — either the events are above his threshold (he should see them) or below (he shouldn't); the design doesn't say.
- **Outcome judgment:** `[MISSING]` — workflow design has no owner-side surface for high-stakes operational events; visibility runs through Kavitha's discretion.
- **Implementation status:** No owner approval / digest surface for high-consequence events in design.
- **Takeaway:** A founder running a ₹2.5cr/month operation sees high-stakes operational events as one-line WhatsApp mentions because the design hasn't decided what he should see.

### Month 12 · [Layer 1] · Workflow: Year-end review (O-3 + O-7)

- **Trigger:** Year-end. Reddy meets Akshay + Kavitha to decide whether to renew the annual contract.
- **Actors + authority:** Reddy (the decision). Akshay (presents). Kavitha (HR perspective). The friend-at-Sodexo (still using it).
- **Lived experience:** Akshay assembles a year-end summary slide on his laptop. Reddy looks at workers/sites/revenue/AI-spend trend. Kavitha confirms that payroll is "easier now than 6 months ago, but still mostly Excel" (her named primary fear). Reddy renews the annual contract. He's pleased that none of the AI-budget 100%-cap alerts ever fired (only 80% warnings — within tolerance).
- **Pressure / overlap / failure:** Year-end decision happens on a hand-assembled slide. The design has no annual-summary surface. Reddy's renewal signal is "friend still uses it + Kavitha not unhappy + no bills exceeded."
- **Outcome judgment:** `[MISSING]` — workflow design has no annual owner review surface; renewal runs on Akshay's slide + Kavitha's verbal nod + friend-channel.
- **Implementation status:** No annual review or KPI summary in design or code.
- **Takeaway:** The annual renewal decision — the single most commercially consequential moment of the year — runs entirely outside the product.

---

## What worked (workflow-design judgments)

- AI budget alerts fire at the correct threshold; the outbox topic is reliable (G29).
- Bank-account authority is unambiguously the owner's per ops §9.2 — the workflow design correctly places this authority, even if the surface is missing.
- The owner-as-hands-off design choice is operationally sound: Reddy not being in daily flow is correct, not a gap.

That's the entire `[WORKS]` list. Everything else is `[MISSING]` design.

## What became confusing

- AI budget alerts reach the owner as system English without operational context — a 52-year-old founder gets "AI spend at 80%" and asks Akshay what to do (Month 3).
- Owner sees high-stakes operational events as one-line WhatsApp mentions through HR's discretion; no spec content defines what threshold should reach him (Months 5, 8, 11).

## What broke

- Bank-account / tenant-settings authority is the owner's per spec, but the surface for him to exercise it is absent; routine bank changes route through Akshay's DB access (Month 4).
- Annual renewal decision — the single most commercially consequential moment — runs entirely outside any product surface (Month 12).

## What is missing in design

The workflow design itself has no answer for:

1. **Owner digest content, cadence, and composition.** What auto-generates, what HR composes, at what frequency, in what language.
2. **Owner KPI surface.** Workers / sites / revenue / churn / AI-spend trend / complaint trend at a glance.
3. **Bank-account / tenant-settings change UI** for the owner (ops §9.2 names the authority; surface deferred).
4. **AI budget alert content design** — plain-English framing, action choices, owner-comprehension support.
5. **Operational incident digests for owner** — what gets surfaced at what severity (Ravi sick-week, supervisor-quits, terminations all surfaced today only at HR's discretion).
6. **Annual / quarterly review surface.**
7. **Owner-inheritance option for G-1.** Either pick it or kill it; the named-but-undecided state means in Month 4 there is no fallback when Kavitha is absent.
8. **Owner audit / compliance surface.** As legal owner, Reddy may need to access compliance evidence for regulatory or legal events; spec is silent.

## What should change before implementation

Ordered by founder-trust impact:

1. **Owner monthly digest spec.** Define what auto-composes (workers / sites / revenue / AI-spend / complaint count / suspension count / termination count) and what HR adds (commentary, escalations). At minimum a WhatsApp-compatible text format that doesn't require him to log in.
2. **AI budget alert plain-English framing.** Translate "80% of cap" into "boss, AI cost is at ₹4L this month vs ₹5L budget; usual pattern, no action needed" — written in the language the owner reads.
3. **Bank-account / tenant-settings surface.** Even a 2-screen admin-web view is enough — he uses it twice a year.
4. **Owner-inheritance pick on G-1.** Either inherit HR authority during HR absence (with audit safeguards), name a second-HR successor, or accept queue-with-no-SLA. The named-but-undecided state is the worst outcome.
5. **High-stakes operational event digest.** Terminations, supervisor-quits, large reassignments, major complaints get a separate owner-feed (not buried in monthly digest).
6. **Owner KPI surface.** Workers / sites / supervisors / payroll trend / AI-spend trend — even read-only.
7. **Annual review summary** that auto-composes for the renewal conversation, replacing Akshay's hand-assembled slide.
8. **Owner audit / compliance access** spec — narrow scope (legal-event lookups), but a defined surface.

## Was the updated design actually followed consistently?

**The workflow design correctly identifies Reddy as a hands-off owner; it does not yet describe the surfaces he uses to exercise that role.**

Where the design speaks (bank-account authority per ops §9.2, AI budget alerts per G29, owner-as-non-daily-actor per master plan §O.1), it speaks consistently and Kavitha + Akshay execute against it. Where it stops speaking — owner digests, KPI surface, high-stakes event awareness, bank-change UI, annual review, compliance access — the gap is uniform.

The load-bearing finding from a year of Reddy's lived experience: **the design gives him the right oversight role (hands-off, high-authority on a small number of decisions) but does not give him the surfaces to exercise that role.** Today his oversight runs through Kavitha's WhatsApp discretion and Akshay's manual access. That works for a founder who already trusts both people; it doesn't scale to a less-trusting owner, and it isn't a product.

Closing these gaps is workflow-design work, not implementation work. The decisions worth making before implementation are: what is owner-digest content, what triggers an owner-notification, what does he click when an AI budget alert fires, who inherits when HR is absent. These are policy questions the design has not yet answered.

---

## Owner-side switching coverage appendix

Strict file-grounded check 2026-05-15 against the 6 workflow-bearing specs. Owner-side dimensions of supervisor switching are mostly absent from the spec; this section maps what's covered here vs deferred.

### Owner-owned cases covered in this file

| Tag                                                    | Source       | Scene                           |
| ------------------------------------------------------ | ------------ | ------------------------------- |
| O-1 — bank-account / tenant-settings authority surface | Ops §9.2     | Month 4                         |
| O-2 — AI budget alert receipt + action                 | G29          | Month 3 + Month 6               |
| O-3 — owner digest content + cadence                   | Spec silence | Month 1 + Month 12              |
| O-4 — owner-inheritance of HR authority (G-1 option)   | Ops §12 #1   | Month 4 (cross-ref Kavitha H-5) |
| O-5 — operational event digest visibility              | Spec silence | Months 5, 8, 11                 |
| O-6 — legal / compliance audit access                  | Spec silence | Critique section                |
| O-7 — company KPI / health surface                     | Spec silence | Month 6 + Month 12              |
| O-8 — high-stakes operational decision involvement     | Spec silence | Month 11                        |

### Switching cases owned by other files

- **Ravi (supervisor lens):** F26._ / F27._ mechanics + C-7.\* cross-workflow effects — see Ravi's switching coverage appendix.
- **Suresh (worker lens):** W-1 through W-8 — worker-side notification, decision visibility, replacement-invite respond, trust transition — see Suresh's switching coverage appendix.
- **Kavitha (HR lens):** H-1 through H-9 — HR-side switching orchestration, bootstrap-seed review, multi-HR coordination, HR-absent fallback — see Kavitha's switching coverage appendix.
- **Combined (overlap stress + races):** F26.5, F27.2, F27.3, C-7.3, C-7.8, C-7.12b, G-3, G-6, G-7, G-10 — overlap scenarios at company scale.

### Cases that remain genuinely open in the specs

- G-1 HR-absent fallback (ops §12 #1) — Kavitha Month 4 and Reddy Month 4 both surface it from opposite ends; the option of owner-inheritance is still un-picked.
- Owner digest spec (no source) — Reddy's whole audit is the surface for this gap.
- Owner KPI surface (no source) — Month 6 + Month 12.
- Owner-incident-digest threshold (no source) — Months 5, 8, 11.
- Owner audit / compliance surface (no source).

---

_End of Round 4 — Reddy audit (Methodology v2 + owner-side scope coverage). Round 5 (Combined) not written; it's a separate plan-mode pass under the same locked methodology — overlap stress + races + 5K-company-scale multi-workflow scenarios as the payload._
