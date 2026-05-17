# Supervisor — Features & Real-Life Scenarios

> **Purpose.** This is the plain-English source of truth for the Axhy v3 supervisor mobile app. It tells the team:
>
> 1. **What** each feature is, **why** it exists, **where + when + who** uses it, and **how** a real supervisor actually uses it in a working day in India (Layer A — Feature explanations).
> 2. **The exact real-life scenes** the implementation must handle — normal flow, edge cases, things that break in real life, ripple effects on workers / HR / admin (Layer B — Scenarios).
>
> **Use during the sprint:** every screen we build is graded against this document. At the end of the sprint, every scene listed below gets a PASS or FAIL in the done memo. No scene is allowed to be silently skipped.
>
> **Authority:** R6 design canon (`docs/prototypes/supervisor-mobile-r6/`) for visuals, workflow-design-closure 2026-05-15 for cross-cutting decisions, master-plan personas (§O) for who the user is.
>
> **Scale floor:** Every scene is written for a tenant with **2,000+ workers, 100+ supervisors, multiple HRs, multiple admins**, operating in India. Demo-data assumptions (25 workers, 3 sites) are not acceptable shortcuts.
>
> **Tab order (R6 locked + founder-confirmed 2026-05-17 PM):** `Today / Decisions / Activity / Chat / Profile`.

---

## Who the supervisor is — anchor personas

We design and grade everything against three real-life supervisors. If a scene reads cleanly to all three, the feature is real-world ready. If even one persona would stumble, the feature is wrong.

### Ravi — primary anchor

- 38 years old, native Telugu, functional Hindi + basic English.
- Works for "Surya Cleaning Services" in Hyderabad. 8 sites in his portfolio (mix of corporate parks, residential complexes, hospitals).
- Manages ~60 workers across those sites.
- Owns a 5-year-old Android phone with a cracked screen. Mobile data is patchy in basement parking areas of his sites.
- Day starts at 5:00 AM with the morning roster sweep. Day usually ends around 9–10 PM after end-of-day pay reconciliation.
- Doesn't read long English text. Trusts the app when it shows him exactly what to do, in his words. Distrusts the app when it surprises him.

### Suresh — second anchor (worker side, but supervisor's actions ripple to him)

- 27 years old, native Hindi, very basic English. Tenth-pass.
- Cleaner at one of Ravi's sites (a tech-park building). Lives in a worker dormitory 12 km from the site.
- Bus + auto-rickshaw to work. Phone is a 4-year-old smartphone, mostly used for WhatsApp and Bhojpuri YouTube.
- When his supervisor marks him absent, files leave for him, or terminates him — that's a real life event with rent, family, dignity attached. Errors here have human cost.

### Mr. Reddy — owner / admin third anchor

- 52 years old, founder/owner of Surya Cleaning. Native Telugu, conversational English.
- Sits in an office above one of his sites; visits a different site every morning.
- Wants two things from the app: a number on the KPI dashboard he can trust, and a monthly digest he can send to his clients to show value.
- Hates being woken up by problems his supervisors should handle. Equally hates being kept in the dark when something requires owner-level intervention.

---

## How to read each feature section

Each tab and surface below uses the same structure:

- **What it is** — one-sentence definition in plain English.
- **Why it exists** — the real-world problem it solves.
- **Where it's used** — physical contexts.
- **When it's used** — time-of-day contexts.
- **Who uses it** — primary persona + cross-persona observers.
- **How a real user actually uses it** — narrative.
- **Cross-persona ripples** — what workers/HR/admins observe when the supervisor uses this feature.
- **Scenarios** — numbered list of scenes the implementation must handle (normal, edge, breaking, scale, cross-persona).

---

# Main Tab 1 — Today

## What it is

The supervisor's roster of the current day — every site under their responsibility, every worker on shift today, who's on-site, who's late, who hasn't shown up, and what AI flagged for review.

## Why it exists

A supervisor with 8 sites and 60 workers cannot hold the day in their head. The Today tab is the **operational pulse** — the one screen Ravi opens 30+ times a day to know "what's the situation right now."

## Where it's used

- Standing in a building lobby checking on workers as they arrive.
- In the supervisor's car between site visits.
- Sitting on a bench inside a worker break room, monitoring shift-end.
- On 2G connection while crossing an industrial-area dead-zone.

## When it's used

- **Pre-shift sweep (5:00–7:00 AM):** Ravi opens Today to see which workers haven't started, who's late, who has a flag from yesterday he forgot.
- **Shift-start surge (7:00–9:00 AM):** Refreshes constantly as workers clock in. If "SHORT" count rises, that's an emergency — he needs to send replacements.
- **Mid-shift (10:00 AM–4:00 PM):** Spot-checks every 30–60 minutes; mostly idle but glances for new flags or unexpected absences.
- **Shift-end (5:00–7:00 PM):** Confirms everyone clocked out; reviews flagged visits before payroll cuts.
- **After-hours emergency (anytime):** Worker doesn't show up for a night shift; site complaint comes in; Today shows what's happening right now.

## Who uses it

- **Primary:** Supervisor (Ravi).
- **Observers (indirectly):** HR pulls a similar "Today" view of the whole company; admin pulls KPI counts derived from the same data; workers don't see this screen but feel its effects (replacement invites, marked-absent SMS, etc.).

## How a real user actually uses it

Ravi opens the app. The first thing his eyes hit is the URGENCY BANNER if anything needs him NOW — e.g., "2 workers short at Sites Manjeera + Rainbow Vistas; 1 AI-flagged visit at Hospital Apollo." If the banner is calm (no urgency), he scrolls the FLOOR PULSE — three big numbers: ON SITE / SHORT / PENDING. If those look fine, he relaxes and scrolls the site cards. Each site card is collapsed by default with the headline (e.g., "Manjeera Trinity — 6/8 on shift"). He taps the worried-looking ones to expand, sees individual worker rows, and acts: marks no-shows absent, opens replacement picker, reviews flagged visits.

He never spends more than 90 seconds on Today in one open. It's a glance, an act, a close. The whole product depends on that flow staying that fast at 2K-worker scale.

## Cross-persona ripples

- **Worker side:** When Ravi marks Suresh absent, Suresh gets an SMS in Hindi: "Aapko aaj absent maark kiya gaya hai — agar yeh galat hai toh supervisor se sampark karein." Suresh's day-end pay slip reflects the deduction.
- **HR side:** Every mark-absent fires `hr.worker_absent` → HR sees the count in their queue + payroll feed. Repeated absences trigger HR's attendance pattern alert.
- **Admin side:** Mr. Reddy's KPI dashboard updates within minutes: "Today's no-shows: 3 (last week avg: 1.2)."

## Scenarios — Today tab

**Normal flow**

1. Ravi opens Today at 5:55 AM. 0 workers clocked in yet, all 8 sites show "WAITING — shift starts 6:00 AM". Calm.
2. At 6:15 AM Ravi reopens. 5 of 8 sites are fully staffed; 3 still have "1 short". Refreshes once at 6:25 — 7 of 8 staffed. One site still has 1 worker missing. Ravi opens replacement picker.
3. At 11:00 AM Ravi reopens after coffee. ON SITE = 58 of 60, SHORT = 0, PENDING = 2, FLAGGED = 0. Closes, goes about the day.
4. At 5:30 PM Ravi reviews end-of-day. FLAGGED = 1 (an AI-flagged visit at Hospital Apollo because no after-photos taken). He taps the flagged visit, sees the photos, accepts the flag → routed to HR for follow-up.

**Edge cases** 5. **Empty portfolio.** Ravi has no active site bindings (new supervisor, hasn't been assigned anything yet). Today shows a friendly empty state — "No sites assigned yet. Your HR will set this up." No errors. No fake counters. 6. **Single-site supervisor.** Ravi covers one site only. The pulse counters reflect just that site; site card is shown as the single focus, not a list of one. Density adjusted for the case. 7. **30-site supervisor.** Senior supervisor with 30 sites in portfolio (large operation). Site cards must paginate / virtualize. Pulse counters compute server-side; client never loads all worker rows at once. 8. **Worker has no Assignment row at all.** Today only renders workers with active assignments on portfolio sites; an unassigned worker doesn't haunt the screen. 9. **Worker is on leave today (approved).** They appear in the worker list with state ON_LEAVE, no clock-in expected, not counted in PENDING or SHORT. 10. **Late detection.** Worker clocked in at 9:25 AM when their shift starts at 9:00 AM. Today shows them as LATE (red badge), not as ON SITE (green). Threshold is 15 minutes per the spec.

**Real-life scenes that break things** 11. **2G network in basement.** Ravi opens Today while inside a parking-area dead-zone. App shows the last cached snapshot with a thin "LAST SYNCED 4 MIN AGO" banner. He can still act (mark-absent queues for later sync). When he gets signal, the queued action ships and the banner clears. 12. **Server is slow at 7 AM rush.** Today takes 3 seconds to load instead of 500ms. A skeleton state renders meaningful structure (site cards in grey) so Ravi doesn't think the app is broken. 13. **Two supervisors disagree about who covers a site.** Ravi marks worker absent at a site where the §5.8 acting binding has actually shifted to a different supervisor. Ravi gets a clear 403 with "You're not the responsible supervisor for this worker today" — not a generic error. (Verified by the Q2=B hardening shipped 2026-05-17.) 14. **Festival day with reduced staffing.** Diwali — only 30% of workers scheduled. Site cards reflect the reduced "workersDue" correctly (dayMask-aware), not a stale yesterday count. 15. **Monsoon outage.** Hyderabad heavy rain; Ravi can't visit one site for hours. Today's pulse keeps updating from the workers there independent of his physical presence. 16. **Mass clock-in surge.** 8:00 AM shift start across 5 sites; 40 workers clock in within 5 minutes. Today refreshes smoothly; pulse counter doesn't lag perceptibly. 17. **Worker's phone died — couldn't clock in.** Ravi confirms they're actually there, manually marks PRESENT via the worker row (PERSONNEL-tier decision; routed to Decisions tab for HR visibility).

**Scale stress** 18. **2K-worker tenant, Ravi has 8 sites with ~60 workers; Today loads in <500ms p95.** The aggregator never scans tenant-wide tables — only portfolio-scoped. 19. **Tenant with 100 supervisors all hitting Today simultaneously.** Backend keeps up; no contention. 20. **Pulse counters computed server-side.** Client never re-aggregates; refresh is a single API call.

**Cross-persona ripples (verified end-to-end where testable; specced where not)** 21. **Mark-absent → worker SMS in 60 seconds.** Outbox `hr.worker_absent` drained by dispatcher → MSG91. Verifiable by sandbox SMS log when worker mobile lands (Phase D). 22. **Mark-absent → payroll feed updates same day.** Outbox `payroll.recompute` enqueued; HR sees the deduction in their daily reconciliation. 23. **Mark-absent → admin KPI dashboard updates within 60 seconds.** Aggregated counter in `/admin/owner/dashboard` reflects new no-show. 24. **Replacement-invite from Today → replacement worker's WhatsApp.** When Phase D ships, the 2-min invite timer is visible on both sides.

---

# Main Tab 2 — Decisions

## What it is

The supervisor's worklist of decisions waiting for them — sorted by tier (NEEDS YOU NOW → ROUTINE → FAILED·REVIEW). Each row is a decision the AI proposed from chat, or a system-generated decision that needs supervisor action (e.g., HR has routed a termination here).

## Why it exists

Chat captures _what's happening_ in messy language. Decisions captures _what's pending_ in priority order. A supervisor with 30 sites doesn't want to scroll chat — they want to see "what do I need to action right now."

## Where it's used

- During the mid-morning lull, sitting down to clear the backlog.
- When the HR escalation push arrives ("Ravi, you have 2 EMPLOYMENT decisions pending — please action").
- In the supervisor's car between sites, working the queue with one hand.

## When it's used

- **9:30–11:00 AM** — the daily decision sweep.
- **Right after chat** — Ravi spoke five things into chat; he now opens Decisions to pick which ones to apply, edit, or amend.
- **End-of-day** — Ravi sweeps Decisions to make sure nothing is still PROPOSED before he signs off.

## Who uses it

- **Primary:** Supervisor.
- **Observers:** HR receives EMPLOYMENT-tier decisions after supervisor ack; admin sees decision counts as KPI.

## How a real user actually uses it

Ravi taps Decisions. The tab badge shows "4" — four pending. The screen has three sections: NEEDS YOU NOW (red, top), ROUTINE (white, middle), FAILED·REVIEW (grey, bottom). He works top-to-bottom. Each row is compact — tier chip + 40-char body + tap-to-act. EMPLOYMENT-tier rows require him to type "TERMINATE" in his own hand before they go through (no accidental terminations). REVIEW_REQUIRED rows ask him to pick from a small set of options. He never types more than 5 words. When he finishes the queue, the tab badge goes to 0 and he feels the calm of an empty inbox.

## Cross-persona ripples

- **EMPLOYMENT decision applied** → HR sees in their queue with the originContext (chat excerpt + worker history) attached. HR makes the final ack. Worker gets binding-change banner + appeal window (per closure §7.3).
- **PERSONNEL decision applied** (leave approved, replacement assigned) → worker SMS, HR daily reconciliation, payroll feed.
- **OPERATIONAL decision applied** (new assignment, schedule shift) → worker SMS for new assignment.
- **NOTE-tier** (site rule, observation) → silent; stored in LivingDoc for AI context.

## Scenarios — Decisions tab

**Normal flow** 25. **Empty queue.** Ravi opens Decisions; badge is 0. Friendly empty state — "All caught up. Great work." 26. **Single PERSONNEL decision (approve worker leave).** Tap → review worker context → approve → routes to worker SMS + payroll. Decision moves to "Applied" history. 27. **EMPLOYMENT decision (terminate worker).** Tap → opens TerminationScreen (sub-screen). Reviews recent 10-day worker history. Types "TERMINATE" exactly. Submits. Routes to HR for final ack. 28. **REVIEW_REQUIRED decision (AI was ambiguous).** Two radio options presented. Ravi picks one. Confirms.

**Edge cases** 29. **Slow queue grows to 30+ pending** (Ravi was on leave Monday; comes back Tuesday with backlog). The screen virtualizes; performance stays flat. 30. **A decision becomes stale** (a leave-approval pending for 3 days while the leave date passed). The system marks it FAILED·REVIEW with a clear reason and moves it to the bottom section. 31. **A decision is amended via chat.** Ravi originally said "approve Suresh's leave for Monday." He goes back to chat and says "actually cancel that, his leave was Tuesday not Monday." The Decisions row updates in-place with an "amended" marker. Audit trail keeps both states. 32. **Network drops mid-apply.** Apply button shows a spinner; on failure, decision stays in queue with "tap to retry" copy. No silent data loss. 33. **Two supervisors try to apply the same decision** (rare, but happens when an acting binding overlaps). Server arbitrates; second attempt gets a clear "already applied by [Name]" message.

**Real-life scenes** 34. **Mr. Reddy calls during lunch:** "Ravi, that termination at Apollo — please action it now." Ravi opens Decisions, taps the EMPLOYMENT row, types TERMINATE, submits — without leaving the parking lot of his current site. Took 90 seconds total. 35. **AI extracts a wrong tier.** Ravi said "Suresh missed work" — AI tiered it PERSONNEL (mark absent) when Ravi meant EMPLOYMENT (terminate after 5 absences). REVIEW_REQUIRED surfaces the option; Ravi picks the right tier. 36. **HR rejects an EMPLOYMENT decision.** Three days later, the termination Ravi submitted comes back with HR's note "needs better documentation." It appears in FAILED·REVIEW with the note inline. Ravi acts on it.

**Scale stress** 37. **30 supervisors at Surya all applying decisions in the same 15-minute window.** Backend handles concurrent applies; each tenant-scoped tx is fast. 38. **A REVIEW_REQUIRED decision with 4 options.** Picker renders cleanly on small phones; option labels truncate gracefully.

**Cross-persona ripples** 39. **Termination applied → worker sees binding-change banner in their app + appeal-window form** (Phase D — specced; not testable this sprint without worker app). 40. **Approve-leave applied → worker SMS in 60s + payroll feed updates** (testable via sandbox SMS log when worker mobile lands). 41. **HR gets EMPLOYMENT decision in their queue with originContext snapshot.** Verifiable via /admin/hr/queue when HR portal lands.

**Sprint scope note**

> The Decisions tab in this sprint ships the full R6 UI shell with the proper sections, tier chips, and EMPLOYMENT typed-phrase ack. The pending-decisions read API (`GET /decisions/proposed-for-me`) is the paused routing slice — this sprint either resumes that or renders the shell with "Coming with P1 routing" copy for the data list while keeping the UI honest. The shell is reusable; the data path lights up when routing resumes.

---

# Main Tab 3 — Activity

## What it is

A scrollable log of recent decisions and supervisor actions — what happened, when, by whom, with the ability to share a record to a worker's WhatsApp or REVERSE a recent decision (within a 30-min window for marks-absent and similar PERSONNEL-tier ops).

## Why it exists

Supervisors get questioned all the time. "Why was I marked absent on Tuesday?" "Show me my last week's attendance." Activity is the supervisor's evidence trail — and the share-to-WhatsApp action is how that evidence reaches workers and HR without screenshots.

## Where it's used

- During worker disputes ("Sir, my pay is short — why?").
- During HR audits ("Send us last Friday's full activity for Site Apollo").
- When Ravi himself wants to remember what he did at 6 AM (he's tired by 8 PM and his memory is unreliable).

## When it's used

- **Anytime a worker challenges a decision.** Within seconds, Ravi can pull the entry, share it on WhatsApp.
- **End-of-week review** (Friday evening) — sweep the week's actions before payroll closes.
- **HR audit moments** — random.

## Who uses it

- **Primary:** Supervisor.
- **Observers:** Worker (receives shared records via WhatsApp); HR pulls similar Activity views for the whole company.

## How a real user actually uses it

Ravi opens Activity. He sees today's events at the top with a "{N} events" count. Each row is one line — tier dot + 40-char body + relative time ("2 hours ago"). He filters by site (chip), by date (chip), or by kind (chip). He never types in a search box — voice + chip filters only (no NL search, per R6 lock).

He taps a row. The row expands to show details and reveals two actions: SHARE TO WHATSAPP (which composes a clean text message and opens the WhatsApp share sheet) and REVERSE (only shown if within 30 minutes for reversible kinds). After 30 minutes, REVERSE is hidden and replaced by "Soft flag for HR" — Ravi can flag the entry for HR review but cannot undo it himself.

## Cross-persona ripples

- **Share to WhatsApp** → worker receives an in-WhatsApp message with the supervisor's clean record copy. They have proof.
- **Reverse within 30 min** → original action's effects undo (attendance row removed, payroll recompute fired in reverse). HR sees the reversal in their queue with a small audit note. The reversal counts toward Ravi's daily "reverse count" — too many reversals signal an issue.
- **Soft flag (>30 min)** → routes to HR for follow-up; doesn't undo the action.

## Scenarios — Activity tab

**Normal flow** 42. **Default view: today.** Ravi opens Activity; sees today's events grouped by site. 8 events visible. Scroll loads more. 43. **Filter by site.** Ravi taps a site chip; sees only that site's activity. 44. **Filter by date.** Ravi taps "Yesterday"; date range filters to the prior day. 45. **Tap a mark-absent row at 9:00 AM.** Row expands. Shows "Suresh — ABSENT — no call". Two action buttons: SHARE TO WHATSAPP + REVERSE (because 30-min window still open). 46. **Tap REVERSE.** Confirmation sheet — "Are you sure? This will undo the absent mark for Suresh today. Pay deduction will be removed." Tap confirm; action is reversed; worker SMS sent ("Earlier absent mark was reversed"). 47. **Tap SHARE TO WHATSAPP on a mark-absent row.** Preview shows the message text. Tap share; WhatsApp opens with composed text; Ravi picks Suresh's contact; sends.

**Edge cases** 48. **Reverse is disabled after 30 min.** Row shows "Soft flag for HR" instead. 49. **Soft flag triggers an HR queue item.** HR sees "Ravi flagged this for review" with the original action context. 50. **Search by free text is unavailable.** Only chip filters. Aligned to R6 NL-search demotion. 51. **Last sync stale > 5 min.** Banner: "LAST SYNCED 6 MIN AGO — REVERSE DISABLED until sync." Forces accuracy.

**Real-life scenes** 52. **Worker disputes pay on payday.** Ravi opens Activity, filters by worker name (via the chip — not free-text search; the chip uses a structured worker picker). Finds the absent entries. Shares each to the worker's WhatsApp. Dispute closed. 53. **HR audit on Friday for all of Apollo site activity.** Ravi filters by site, by week. Selects a range of rows, shares to HR's WhatsApp group. 54. **Ravi forgot what he did at 6 AM.** Opens Activity, scrolls to morning. Sees he marked 2 workers absent at Manjeera. Remembers. 55. **Worker says "I clocked in but you didn't see it."** Activity has the clock-in event. Ravi shares the timestamp.

**Scale stress** 56. **Senior supervisor with 30 sites and 200 decisions in a week.** Activity virtualizes; first paint is fast. 57. **Activity with 30 days of history per supervisor.** Pagination + filter keeps reads bounded.

**Cross-persona ripples** 58. **Share to WhatsApp logs an audit event** ("AUDIT_SHARED_TO_WORKER") so HR knows when records were shared and to whom. 59. **REVERSE actions log audit events** so HR can detect pattern anomalies. 60. **Worker accumulates a "records shared" log on their side** (Phase D) — they can show it to dispute any claim.

**Sprint scope note**

> Activity tab in this sprint ships the full R6 UI shell with structured filter chips, row expand, SHARE TO WHATSAPP UI, and the 30-min REVERSE window logic in the UI. The actual REVERSE backend mutation needs `POST /decisions/:id/reverse` (or equivalent) which is part of the routing slice. UI degrades gracefully — REVERSE button shows "Coming with routing slice" if backend not ready. SHARE TO WHATSAPP works end-to-end via deeplinks (no backend needed).

---

# Main Tab 4 — Chat

## What it is

The supervisor's voice-first capture surface. Ravi speaks in messy Telugu/Hindi/English mix; AI extracts decisions and routes them to Decisions tab.

## Why it exists

A supervisor cannot tap forms with one hand while doing site work. Voice is the only realistic input modality. Chat is where the messy reality of a supervisor's day becomes structured decisions.

## Where it's used

- **In motion** — walking between buildings.
- **Under noise** — generator running, machinery, traffic.
- **One-handed** — holding a clipboard in the other.
- **Wet conditions** — Hyderabad rain, water-prone fingers.

## When it's used

- **Continuously** — small bursts of 5–30 seconds throughout the day.
- **Late evening dictation** — Ravi summarizes the day to AI before sleeping.

## Who uses it

- **Primary:** Supervisor (voice + occasional text).
- **AI** — assists, never decides.
- **Workers/HR/Admin** — never see chat directly; they see decisions that emerged from it.

## How a real user actually uses it

Ravi opens Chat. The capture surface (footer) has a big mic button (red+pulse when listening) and a tiny text input fallback. He long-presses the mic. Speaks: "Suresh aaj nahi aaya, Apollo me, mark karo absent." The transcription overlay shows the words appearing. He releases. The AI processes (2–4 seconds — a thinking-skeleton bubble appears). A response bubble lands: "Marked Suresh absent at Apollo — review in Decisions." A thin "1 decision added — review in Decisions" link sits below.

He doesn't review the decision card inline (per R6 — DecisionCards demoted from chat to MediumSheet to keep the chat surface focused on capture). He continues capturing the next thought. Maybe later, when he opens Decisions tab, he sees and applies that decision.

Older bubbles dim to 55% opacity so his focus stays at the bottom. The total-pending count is visible on the footer ("3 decisions pending → Decisions").

## Cross-persona ripples

- **AI extraction never silently writes** — every extraction becomes a decision the supervisor must apply.
- **High-cost AI calls** are budget-capped per the wave-4b cost-protection rules. If budget hits cap, banner shows "AI paused for today — speak again tomorrow or use text input."
- **Voice transcripts stored 24 hours** then deleted (per master plan §G voice retention rule).

## Scenarios — Chat tab

**Normal flow** 61. **Single capture.** Ravi long-presses mic, speaks one thing, releases. Thinking bubble → response bubble → decision added link. 62. **Compound utterance.** Ravi speaks 5 things in one burst. AI extracts 5 decisions; batch link "5 decisions added — review in Decisions." 63. **Amend a prior decision.** Ravi speaks "actually Suresh's leave was Tuesday not Monday." AI maps to the prior decision via context, updates in place. Decisions tab reflects the amendment with an "amended" tag.

**Edge cases** 64. **Network drops mid-capture.** Voice queues; uploads when signal returns. UI shows "Queued — will process when online." 65. **AI returns ambiguous extraction.** Surfaces an AmbiguousDecisionCard (radio options) inside MediumSheet, NOT in the chat scroll. 66. **AI hits daily budget cap.** Mic button greyed; banner shows "AI paused for today." Text input still works as a fallback (gets stored as raw decision draft). 67. **Voice transcription confidence low** (loud environment, accent edge case). Bubble shows "low confidence" chip; suggests Ravi review the extracted decision before applying. 68. **Telugu/Hindi/English code-switching mid-sentence.** AI handles it (the model is multilingual); transcript preserves the mix; extracted decisions are translated to the supervisor's UI locale.

**Real-life scenes** 69. **Generator noise at a hospital site.** Ravi captures voice; AI transcript has noise artifacts but the extraction still works because of context. 70. **Walking and talking.** Ravi captures while walking between buildings. The release-to-stop gesture is forgiving (200ms grace). 71. **At-the-gate moment.** Ravi enters a site; security wants to chat. He needs to leave the app fast. Chat pauses cleanly when he switches apps; resumes when he returns. 72. **Late-night summary.** Ravi at 9 PM dictates a 3-minute end-of-day summary. AI extracts ~5 NOTE-tier decisions (site observations) — stored in LivingDoc.

**Scale stress** 73. **Supervisor with thousands of past chat messages.** Older bubbles dim + lazy-load on scroll. Initial paint is fast. 74. **Concurrent supervisors at scale.** Backend chat budget caps + idempotency keys prevent runaway costs.

**Cross-persona ripples** 75. **Every chat message stored with audit identity** (companyId + supervisorId). HR can pull any supervisor's chat history if a dispute requires it. 76. **AI cost per supervisor visible in admin dashboard** (Mr. Reddy sees if any supervisor is spending too much on AI; tells him their input quality is low).

**Sprint scope note**

> Chat tab in this sprint audits the existing R1 chat.tsx implementation and brings it to R6 fidelity:
>
> - Mic-primary footer ✓
> - 55% dimmed older bubbles
> - Live transcription overlay
> - "{N} decisions added — review in Decisions" link replacing inline DecisionCards
> - Capture-surface footer with total-pending link
> - Amend flow (basic)
>   Existing apply-from-chat path stays functional; the R6 design moves the "apply" to Decisions tab, not in chat.

---

# Main Tab 5 — Profile

## What it is

Ravi's identity + settings page. Avatar, name, role, language, notification prefs, switch-company (for multi-tenant supervisors), sign out.

## Why it exists

Every app needs a "me" surface. Critical here for language switching (Telugu/Hindi/English), notification toggles (he doesn't want push during sleeping hours), and multi-tenant supervisors who freelance across cleaning companies.

## Where it's used

- Rarely — once a week or so.
- **First time** — onboarding moment after login.
- **When changing phones** — re-verify identity, re-login.

## When it's used

- **Anytime, briefly.**
- **At setup** — language pick.

## Who uses it

- **Primary:** Supervisor.

## How a real user actually uses it

Ravi taps Profile. Sees his name and role at the top ("Ravi Reddy — Supervisor at Surya Cleaning"). Scrolls down. Sees notification preferences (push / SMS / WhatsApp toggles). Sees language pick (English / हिन्दी / తెలుగు). Sees Switch Company (only if he has memberships in multiple companies). Sees Sign Out at the bottom.

He rarely changes anything. When he does, the change applies immediately and surfaces a tiny "Saved" toast — no save buttons, no friction.

## Cross-persona ripples

- **Notification pref change** → backend updates Membership.notificationPrefs; affects how Outbox dispatcher decides what channels to use for this user.
- **Language pick** → also affects worker SMS / WhatsApp template language for workers under Ravi (cascade per master plan locale rules).
- **Switch company** → re-issues JWT with new companyId; all queries scope to the new tenant.

## Scenarios — Profile tab

**Normal flow** 77. **View profile.** Open Profile, see name + role + company + phone. Read-only fields, not editable in app (HR edits identity). 78. **Change language to Telugu.** Tap language row; pick Telugu; UI re-renders in Telugu immediately. Saved toast. 79. **Toggle off push during sleeping hours.** Tap notification prefs; toggle "Do not disturb 10 PM – 5 AM." Saved. 80. **Switch to second company.** Tap Switch Company; pick other tenant; JWT re-issues; redirected to Today on new tenant. 81. **Sign out.** Tap; confirmation; tokens cleared; redirect to phone-login screen.

**Edge cases** 82. **Single-company supervisor.** Switch Company row is hidden (no second tenant to switch to). 83. **Notification toggle saves but network was offline.** Local toggle reflects state; backend sync happens on reconnect. 84. **Language change resets text input direction** (no RTL languages currently, but template is ready).

**Real-life scenes** 85. **Ravi's first day after install.** Profile prompts him to pick language. Telugu by default for an Andhra/Telangana-based account. 86. **Ravi switches companies between morning and evening shifts** (he freelances for two cleaning companies, an edge but real case).

**Cross-persona ripples** 87. **Language change emits an audit event** for HR if it crosses a defined locale (e.g., HR knows which supervisors operate in which languages).

**Sprint scope note**

> Profile in this sprint completes the wired-up notification prefs (currently a stub at L156 of `apps/mobile/app/(supervisor)/profile.tsx`) and adds switch-company flow (currently skeleton). View + language + sign-out already shipped.

---

# Secondary Surface — Summary

## What it is

End-of-day digest opened from a tab (not its own tab anymore, per R6 IA). Numbers + timeline + wage week + "I'm done" CTA.

## Why it exists

Ravi finishes the day at 8 PM and wants to know: did anything I do today cost the company money? what changed in pay? what's tomorrow's roster?

## Where it's used

- At home, before sleeping.
- After shift end, sitting in a chai shop.

## When it's used

- **Once per day, around 7–9 PM.**

## How a real user actually uses it

Opens Summary. Sees 2×2 tile grid: CHANGES TODAY (atomic batches) / FLAGGED (need review) / LEAVE PENDING / TOMORROW·ROSTER. Scrolls past tiles. Sees TIMELINE — chronological list of today's decisions. Taps a tier → DecisionsTodaySheet filters Decisions tab by that tier. Below timeline, WAGES THIS WEEK card — bar chart of his sites' weekly wage so far. At the bottom, "I'm done for today" — taps to mark his day complete (cosmetic, not functional gate per R6 dropped-from-launch §4 #15 — but the button stays as a wellness touch).

## Scenarios — Summary

**Normal flow** 88. **Tap CHANGES TODAY tile.** Drills into Decisions tab filtered by today. 89. **Tap WAGES bar.** Drills into Activity filtered by pay-impacting events. 90. **Tap "I'm done."** Soft confirm; closes app or stays open.

**Edge cases** 91. **Empty day** (Sunday, supervisor off). Tiles all zero. Encouraging empty state. 92. **Week boundary.** Wages bar resets correctly Monday morning.

**Sprint scope note**

> Summary in this sprint ships as a real R6-faithful secondary surface (NOT a main tab). Requires a new `GET /supervisor/summary` aggregator route (built same pattern as `/supervisor/today`). 7-day attendance + wage-week math derive from existing Attendance + Worker.baseSalaryPaise.

---

# Secondary Surface — Updates

## What it is

HR compliance digests. Policy changes, rule updates, training pings — read + acknowledge in own words (5+ words minimum).

## Why it exists

Indian compliance + legal requirement to prove employees acknowledged policy changes. The 5-word own-voice ack is the proof.

## Where it's used

- Late evening, once HR ping arrives.
- Calm moments — supervisor reads, takes time to write their ack.

## When it's used

- **Whenever HR sends an update** — usually pre-monthly or pre-quarterly.

## How a real user actually uses it

Updates tab badge shows "2 new." Ravi opens. Two cards in NEEDS YOUR ACK section. Tap first — expands to show the rule (3-5 sentences), with sub-rules expandable. Free-text field at bottom: "Acknowledge in your own words." Word counter: "0/5 WORDS." Ravi types: "Will share with my workers tomorrow morning." Counter: "8/5 WORDS." Submit. Card moves to RECENT — ACKNOWLEDGED section with his exact words quoted back.

## Scenarios — Updates

**Normal flow** 93. **Acknowledge a simple policy update.** Type 5+ words. Submit. Moves to acknowledged. 94. **Compliance digest pattern** — one HR update covers 5 related rules. Each rule is expandable. Single ack covers all 5.

**Edge cases** 95. **Cannot acknowledge with fewer than 5 words.** Submit button disabled. Counter shows red. 96. **Network drop on submit.** Queues until reconnect. UI shows "queued." 97. **Acknowledged update later edited by HR.** Ravi gets a new "Re-acknowledge" prompt for the changed version.

**Sprint scope note**

> Updates in this sprint renders the R6 UI shell + word-count gating in the UI. The HRUpdate write path (POST /hr-updates/:id/acknowledge) is part of the HR Pod model that's not yet wired. Honest placeholder: list reads work if any HRUpdate rows exist; submit shows "Coming with HR portal" copy until that backend lands.

---

# Sub-screens (modal overlays from main tabs)

## TerminationScreen

- **Opened from:** Decisions tab → EMPLOYMENT row.
- **Real-life moment:** A worker has crossed the line (5 unexcused absences, theft, repeated misconduct). Ravi is about to fire them. This screen forces a 5-second-slow-down: shows recent 10-day worker history (good days + bad), shows pay implication, requires typed "TERMINATE" phrase, routes to HR for final ack.
- **Scenarios:** 98. **Typed phrase ack works.** Anything other than "TERMINATE" (exact case) keeps Submit disabled. 99. **Recent history is empty.** Show "No recent activity" — Ravi must double-check before terminating. 100. **Termination routed to HR.** Decision shows "AWAITING_HR_ACK" in Activity. 101. **Worker appeal window** — when worker mobile lands (Phase D), worker sees a 7-day appeal banner.

## MultiDayLeaveScreen

- **Opened from:** Decisions tab → PERSONNEL multi-day leave row.
- **Real-life moment:** Suresh requests Mon-Wed leave. Ravi needs to pick a cover worker for each of the 3 days. Different days may need different covers.
- **Scenarios:** 102. **Per-day cover picker.** Three day chips; tap each to pick replacement. WAGES IMPACT card updates as picks are made. 103. **All days picked → Approve enabled.** Sends invites to each replacement (2-min ephemeral timer per invite). 104. **One replacement declines mid-flow.** UI updates that day to "Awaiting another pick." Ravi picks again.

## ReplacementPicker

- **Opened from:** Today site card menu or Decisions row.
- **Real-life moment:** Worker called in sick at 6:45 AM. Site needs 8 staff at 7:00 AM. Ravi opens picker, filters by "available now," picks Anjali, sends 2-min invite. Anjali's phone SMS arrives; she taps accept; clock-in window opens for her.
- **Scenarios:** 105. **Filter chips for preference + skills.** Surface fastest available. 106. **Invite 2-min timer.** If Anjali doesn't respond in 2 min, invite expires, Ravi picks another. 107. **No one available** — empty state with "Try cross-site," shows neighbouring sites' available workers.

## FlaggedReviewSheet

- **Opened from:** Today urgency banner → flagged visit.
- **Real-life moment:** AI flagged a visit because before-photos look identical to after-photos (suggests work wasn't done). Ravi reviews photos side-by-side, decides whether to resolve (confirm AI was wrong) or reject (work wasn't done, route to HR).
- **Scenarios:** 108. **Resolve OK.** Removes flag, worker payroll proceeds normally. 109. **Reject (work wasn't done).** Routes to HR queue + pay deduction. 110. **Flag without AI verification text** (manual flag) — show "Manual flag — no AI reason." Still actionable.

> Sprint scope note: FlaggedReviewSheet renders the R6 design with photos + buttons. Resolve/Reject writes are P1 DWI; for this sprint they render disabled with "Coming with P1 routing" copy (honest skeleton, no log+advance stubs).

## DecisionsTodaySheet

- **Opened from:** Summary timeline row.
- **Real-life moment:** Ravi sees CHANGES TODAY = 12, wants to see the 12 in one place. Sheet slides up showing filtered Decisions for today only, with tier filter chips.
- **Scenarios:** 111. **Default view: all today's decisions sorted by time.** 112. **Tier filter** — tap NOTE chip; sheet narrows.

---

# Cross-cutting scenarios (don't fit one tab — they cut the whole app)

113. **Multi-supervisor coexistence at a single site.** Site Apollo has Ravi as PERMANENT supervisor and Lakshmi as ACTING (because Ravi is on a planned half-day off). The §5.8 precedence rule means Lakshmi is the responsible supervisor during her window. Today on Lakshmi's app shows Apollo; Today on Ravi's app excludes it during the window. Mark-absent attempts by Ravi during Lakshmi's window return 403 NOT_SUPERVISOR. (Verified by Q2=B hardening shipped 2026-05-17.)

114. **End-of-month payroll crunch (28th-1st).** All supervisors review Activity for accuracy. Backend load spikes. Reads must hold p95 < 1s. Reverse window strictness matters — workers and HR are reconciling pay; supervisor edits during this window have outsized financial impact.

115. **Festival day.** Diwali — most workers on leave. Today shows reduced counts honestly. CalendarEntry on each affected site records the holiday. Updates tab may have a recent HR ack like "Diwali pay rules — 1.5x for present workers."

116. **Monsoon outage / 2G zone.** Cached Today snapshot stays usable. Queued mutations sync on reconnect. Banner is honest about last-sync time and disabled actions (REVERSE disabled if stale).

117. **New supervisor onboarding.** First time opening the app — language pick, Today empty state with friendly copy, Decisions empty, Updates empty. App doesn't pretend a queue exists.

118. **Senior supervisor with 30 sites and 200 workers.** All screens hold up — virtualization, pagination, server-side aggregation.

119. **Multi-tenant supervisor.** Ravi works mornings for Surya, evenings for second tenant "Spark Cleaning." Switch Company on Profile re-scopes everything. No tenant-data leak.

120. **Owner watching across all supervisors.** Mr. Reddy's admin dashboard pulls counts from the same data. KPIs match what supervisors see — no drift between supervisor-side and owner-side aggregation.

121. **HR escalation push during shift.** HR pings Ravi mid-shift: "Two EMPLOYMENT decisions overdue — please action." Push arrives; Ravi acks; opens Decisions; clears. Decisions badge updates in real-time.

122. **Sleep hours respected.** Ravi sets do-not-disturb 10 PM–5 AM. Push notifications during that window are deferred to 5 AM (not lost). Emergency-tier (worker incident, security flag) still wakes him — must be opt-out specifically.

123. **App update during shift.** App is updated mid-shift. State persists (chat captures, queued mutations). User isn't reset.

124. **Lost phone / new install.** Ravi's phone is stolen. New install on new phone. Phone+OTP login → Profile shows same context. No data lost; old device session invalidated.

125. **Worker complaint about supervisor.** A worker says Ravi is unfair. HR pulls Ravi's chat history + Activity + Decisions for a date range; everything is auditable, traceable, in his original voice. The app supports this by design.

---

# What's testable end-to-end THIS SPRINT vs deferred

| Scenario range          | Testable this sprint                                                       | Deferred (and reason)                                                                                      |
| ----------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Today (1–24)            | 1–20 fully; 21–24 partial (worker SMS dispatcher)                          | Worker-mobile-side observation (Phase D)                                                                   |
| Decisions (25–41)       | 25–32 with shell; 33–41 once routing slice resumes                         | Routing slice + worker mobile                                                                              |
| Activity (42–60)        | 42–55 with shell; share-to-WhatsApp end-to-end                             | REVERSE write path (routing slice); cross-persona logs (Phase D)                                           |
| Chat (61–76)            | 61–73 end-to-end against deployed Railway                                  | Worker-side propagation, full admin AI-cost UI (Phase C+)                                                  |
| Profile (77–87)         | 77–86 fully                                                                | Language-cascade audit event (low priority)                                                                |
| Summary (88–92)         | 88–91 with new aggregator                                                  | Wage-week math accuracy at 2K-worker scale (validate post-sprint)                                          |
| Updates (93–97)         | 93–94 list reads; 95 word-count UI; submit shows skeleton                  | HRUpdate write path (HR Pod model not wired)                                                               |
| Sub-screens (98–112)    | UI fully; write paths skeleton where backend not ready                     | Backend writes via routing slice                                                                           |
| Cross-cutting (113–125) | 113 verified; 114 partial (load test post-sprint); 115–125 partial-to-full | 115 calendar holiday wiring, 121 push reliability (post-sprint), 124 device-session invalidation hardening |

---

# Done-memo verification table (template the sprint must fill at end)

| #   | Scene                                  | Status | Evidence                           | Notes                 |
| --- | -------------------------------------- | ------ | ---------------------------------- | --------------------- |
| 1   | Ravi opens Today at 5:55 AM pre-shift  | TBD    | screenshot + sandbox-DB inspection |                       |
| 2   | Today at 6:15 with 3 short             | TBD    | screenshot + DB                    |                       |
| ... | ...                                    | ...    | ...                                | ...                   |
| 125 | Worker complaint audit trail traceable | TBD    | spec coverage                      | post-sprint hardening |

> Implementation rule per `feedback_features_explained_with_scenarios.md`: every numbered scene above gets a PASS, FAIL, or DEFERRED status in the done memo with evidence. No scene is silently skipped.

---

# Architecture intent (one-paragraph, so we don't drift mid-sprint)

Permanent code per `feedback_permanent_code_no_patches.md`. R6 design canon per `feedback_r6_is_supervisor_design_canon.md`. Push-to-prod each slice per `feedback_push_to_production_each_slice.md`. Visual verification by my own eyes per `feedback_visual_verification_not_curl.md`. Real-DB tests against Railway sandbox; smoke against the deployed Railway URL; Playwright + Expo Web on Intel Mac per `feedback_no_eas_no_gh_actions_intel_mac.md`. All four personas (worker / supervisor / HR / admin) co-exist; supervisor work cannot break the others. At 2K-worker scale, queries are portfolio-bounded, pages virtualize, server derives state. Backend services have explicit boundaries (today-service.ts, attendance-service.ts, etc.); future swap of OpenAI for Sarvam or MSG91 for Twilio is a one-file change. Tests document behavior as contracts.

---

**Status:** Document awaiting founder review. NO UI implementation begins until this is approved. After approval, each scene is built and verified; the done memo fills in the verification table.
