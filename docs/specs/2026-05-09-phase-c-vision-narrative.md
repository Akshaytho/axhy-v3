# Phase C — Vision Narrative

> **Status:** DRAFT companion to `2026-05-09-phase-c-assignment-design.md`
> **Date:** 2026-05-09
> **Purpose:** What Mukesh-the-supervisor _experiences_ with v3. The schema spec describes the boxes; this describes the arrows between them — the moments that don't exist in any other facility-management software.

> **How to read:** these are 7 vignettes from one supervisor's day. After each, a "what's different" annotation calls out the novel pattern. The Phase C engineering work exists to make these moments possible.

> **How to give async feedback:** leave `> FOUNDER NOTE: …` lines anywhere. I integrate next session.

---

## Why this doc exists alongside the schema spec

The schema spec (`2026-05-09-phase-c-assignment-design.md`) shows **what tables exist**, **what state machines transition**, **what routes accept**.

This doc shows **what Mukesh experiences** that nobody has experienced before in cleaning-company software.

Both are needed. The schema spec is for engineering reviewers. The vision narrative is for the founder, the panel, sales conversations, and future hires asking "what makes Axhy different."

8 novel patterns are surfaced inside the narrative below — not as a list, but as live behavior in real moments.

---

## Mukesh's Friday afternoon (and following Tuesday)

The personas: **Mukesh** (supervisor, 5 sites, 47 workers under his patch), **Suresh / Pradeep / Sundeep / Kavita / Lakshmi** (workers), **Mr. Reddy** (owner of Suvarna Cleaning, 35 employees), **Apollo Hospital / Cyber Towers / Westfield Tower** (client sites).

---

### Vignette 1 — 5:32pm Friday: thinking out loud

Mukesh is on a metro back from Apollo Hospital. He pulls out his phone and opens Axhy.

He taps the mic on the chat tab and speaks Telugu: _"Apollo needs 5 workers next Tuesday, thinking Pradeep, maybe Suresh, but check Suresh's leave first."_

The chat shows three things:

- A tentative pencil-mark on Tuesday's calendar entry (Apollo, +5, Pradeep, Suresh-?)
- A cross-check chip: _"Suresh has approved leave Tue–Wed"_
- AI's own line: _"Suresh is on leave. Want to keep Pradeep tentative and pick someone else for the second slot?"_

Mukesh: _"yeah Sundeep."_ Tap. Both names land in Tuesday's tentative.

> **What just happened that doesn't exist anywhere:** Mukesh's _thinking_ became system state. There's no form. No commit. No lock-in pressure. The AI listened, cross-checked his soft thought against hard records (the leave), and held the result as tentative — exactly what a paper notebook does, but the AI also reads it. **This is the soft-state Calendar pattern.**

---

### Vignette 2 — 5:41pm: ambient context absorption

Notification: _Sundeep clocked in late at Cyber Towers — 8 minutes. Voice-clock said he was stuck behind a fallen tree near IT corridor._

Mukesh doesn't reply. The system doesn't ask him to. The voice clip is logged. AI marks the lateness as "explained, weather." Mukesh's living-doc gets a small structured update: _Sundeep tends to be 5–10 min late on rainy days, low-impact, no escalation needed._

> **What's different:** competitors require Mukesh to triage every tardy. v3 quietly absorbs context and only pings him when it crosses a threshold _he_ set. Per-supervisor living-doc tracks this supervisor's own thresholds — there's no SaaS-wide policy. **This is the per-supervisor living-doc pattern.**

---

### Vignette 3 — 6:02pm: owner-friendly summaries

Mr. Reddy (owner) sends Mukesh a one-line WhatsApp: _"What was Suresh's last week looking like?"_

Mukesh opens Axhy chat (not WhatsApp), types _"Suresh last week summary."_

AI returns 4 lines: _"Mon-Sat at Apollo. Verified by AI in 5 of 6 visits. Wednesday: late by 12 min (no reason given). Photos all clean. No complaints. He took half-day leave on Saturday after lunch."_

Mukesh forwards to Mr. Reddy.

> **What's different:** competitors give "view detailed report (PDF)." v3 gives a sentence Mr. Reddy can paste back to a client. AI knows what kind of summary _owners_ want — short, context-aware, paste-ready. **This is owner-as-recipient design — owner consumes, doesn't approve.**

---

### Vignette 4 — 6:17pm: a correction with dignity

Mukesh remembers — Wednesday's visit at Westfield. He marked Suresh as the worker, but Suresh actually went to Apollo (covering for Pradeep who didn't show up). The Westfield visit was Pradeep's, not Suresh's.

Mukesh types _"correct Wednesday Westfield, that was Pradeep not Suresh."_

The chat shows a DecisionCard: _"Wednesday Westfield 9-5. Worker change Suresh → Pradeep. Reason?"_ Below: chips — Split shift / Covering for [picker] / Mistake / Other.

Mukesh taps _Covering for_ → picker shows _Pradeep covering for [pick]?_ — but actually Suresh covered for Pradeep, not the other way. Mukesh re-reads the card. Ah — the correction is changing the visit's worker, not creating a new one. He picks "Other" and types: _"Pradeep was at Westfield, not Suresh. They covered for each other."_

Tap Apply.

The visit row gets a `correctsVisitId` correction. Suresh's worker app shows: _"Wednesday's record updated by Mukesh on Friday 6:17pm."_ If Suresh wants to dispute, he taps Complaint → routes to HR.

The original Wednesday row stays in the DB forever. The correction is a NEW row pointing to the original. Suresh sees both versions if he taps. If a labor dispute happens 6 months later, Anushka (legal) can reconstruct the chain.

> **What's different:** worker dignity + DPDP-compliant + audit-bulletproof in one design. The original record never disappears. The worker is _told_ about corrections to their own record by name and timestamp. They can complain. **This is append-only Visit chain with worker-facing visibility.**

---

### Vignette 5 — Tuesday 7:30am (4 days later): the AI's "lock in" moment

Mukesh opens the app on the metro again. AI's first chat bubble:

_"You had Apollo Tuesday Pradeep + Sundeep as tentative on Friday. Today is Tuesday. Lock in?"_

Mukesh taps Apply. Two Assignments materialize. Pradeep + Sundeep get push notifications: _"Apollo today, 9-5, special — covering for the morning team."_

Mukesh's tentative calendar entry stays visible as _"↗ Promoted to Assignment."_ Audit chain: tentative on Friday → tap on Tuesday → 2 hard Assignment rows + 2 worker notifications.

> **What's different:** the 4-day gap between _thinking_ and _committing_ was fine. The system held context. Mukesh didn't have to remember; the AI surfaced it at the right moment. **The kacha-pakka loop (rough → final) is now a system, not a WhatsApp draft graveyard.** This is the soft → hard promotion pattern.

---

### Vignette 6 — Tuesday 9:14am: the voice-mediated correction

Mukesh's supervisor app pings: _"Sundeep clocked in at Apollo, voice-confidence MEDIUM, says he heard Tuesday morning is split."_

Mukesh checks. Sundeep was confused — thought Apollo was a half-day. AI flags this as MISSING_INFO and shows a card: _"Sundeep thinks today is half-day. Original assignment is full-day. Confirm?"_

Mukesh taps "Full day" → AI speaks back to Sundeep through the worker app: _"Today is full day at Apollo. Mukesh confirmed."_

The supervisor never had to call Sundeep. Voice-mediated correction loop, end-to-end, in 30 seconds.

> **What's different:** the voice-confidence is signaling something might be wrong; AI surfaces it; supervisor decides; AI relays. **Three-actor loop (worker, AI, supervisor) without a phone call.** Voice confidence is part of the UX, not just a debug metric.

---

### Vignette 7 — Tuesday 6pm: the end-of-day ritual

Mukesh's end-of-day summary opens automatically as the day ends:

_"Today: 47 workers, 47 sites covered, 0 unstaffed shifts. 1 correction (Sundeep half-day confusion). 2 leaves active (Suresh continues, Kavita started). 1 complaint by Lakshmi at Cyber Towers (toilet supplies low). Tomorrow's plan: 47 / 47 covered, no flags."_

Below: a small footer — _"Voice usage today: 73%. Mr. Reddy's review of last week is overdue (3 days)."_

Mukesh taps Mr. Reddy's reminder → AI drafts a one-line summary for him to send.

> **What's different:** end-of-day is **the** ritual. Owners care, supervisors plan tomorrow on it. v3 makes it the default screen at 6pm, not a tab Mukesh has to remember to open. Voice usage tracking is built-in (Aanya's metric — voice adoption is the moat). **End-of-day-as-default is the v3 supervisor pattern.**

---

## The 8 novel patterns, mapped to vignettes

| #   | Pattern                                                                | Vignette                                                        |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Calendar as soft state, AI as bridge to hard state                     | 1, 5                                                            |
| 2   | Per-supervisor persona context (aliases + sitePrefs + recentDecisions) | 2, 3                                                            |
| 3   | Owner-free operational layer + legal-anchor escalation                 | 3                                                               |
| 4   | Voice → AI → DecisionCard → tap (no forms)                             | All vignettes                                                   |
| 5   | Override chips emit relationship-graph events                          | 4                                                               |
| 6   | Append-only Visit chain with worker visibility                         | 4                                                               |
| 7   | Voice-confidence-aware conflict UX                                     | 6                                                               |
| 8   | Anonymized work-pattern retention for industry analytics               | (Phase 3 / future — surfaced via aggregated reports in Phase C) |

## What competitors look like in each vignette

The shadow comparison sales narrative will use:

- **Vignette 1 vs WhatsApp drafts / paper:** "today, Mukesh's planning lives nowhere queryable. Tomorrow morning, he searches messages."
- **Vignette 2 vs Sodexo's escalation rules:** "today, every tardy = a notification = supervisor decision-fatigue."
- **Vignette 3 vs Greythr / sumHR reports:** "today, Mr. Reddy gets a PDF. Tomorrow, he gets a sentence."
- **Vignette 4 vs ServiceTitan / Jobber edits:** "today, you edit the record. The worker doesn't know."
- **Vignette 5 vs calendar appointments:** "today, you forget what you planned 4 days ago. Tomorrow, the system remembers for you."
- **Vignette 6 vs phone calls:** "today, every confusion is a phone call. Tomorrow, voice mediates."
- **Vignette 7 vs dashboard-checking:** "today, you remember to check. Tomorrow, the day ends with a summary."

## Why this matters for Phase C engineering

Each vignette maps to engineering pieces in the schema spec:

- Vignette 1 needs: Calendar table + AI tool `propose_calendar_entry` + cross-check on read against ChangeRequest LEAVE + per-supervisor Living-doc.
- Vignette 5 needs: Calendar `editableUntil` + `promotedTo*` columns + `propose_promote_calendar_entry` + DecisionCard standardized return shape.
- Vignette 4 needs: Visit `correctsVisitId` chain + `latest_visit` view + ESLint rule on payroll/billing reads + worker-app visibility.
- Vignette 7 needs: end-of-day cron + voice-usage telemetry + per-supervisor outstanding-task aggregation.

If we ship the schema (Spec 1) without the magic-moment polish, we get a generic FM tool. If we ship the magic without the schema, we get a demo that doesn't scale.

**Both artifacts are needed. The schema spec is the engine; the vision narrative is the steering wheel.**

---

## Open invitation for founder edits

Add `> FOUNDER NOTE:` lines anywhere in this doc. Especially:

- Did I get Mukesh's voice / phrasing right? (Telugu native, fluent English, functional Hindi.)
- Are the personas accurate to Indian SMB cleaning ops? (Or do real Mukeshes do something different?)
- Are there magic moments I missed entirely?
- Is the comparison-with-competitors framing useful or noisy?

Whatever you mark, I'll integrate next session.
