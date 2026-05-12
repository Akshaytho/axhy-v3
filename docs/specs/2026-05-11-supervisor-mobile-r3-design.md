---
Status: Superseded
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: cfd0891
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
Replaced by: docs/specs/2026-05-12-supervisor-mobile-r6-design.md
---

> **Superseded 2026-05-12 by R6.** Iterated R3 → R4 → R5 → R6 in `claude.ai/design`; final R6 export landed in repo per doc-discipline protocol. The canonical product surface design for the supervisor app is now `docs/specs/2026-05-12-supervisor-mobile-r6-design.md` (Active). This R3 file is preserved verbatim for historical traceability; **do not use for current implementation decisions.** See `docs/index/canonical-truth.md` (In-repo historical section) for the supersession record.

# Supervisor mobile — r3 design pass

**Date:** 2026-05-11
**Iteration:** r3 (working copy at `_supervisor-design-r3/`)
**Reference:** r2 snapshot preserved at `_supervisor-design-r2-snapshot-2026-05-11/`
**Driving input:** founder's friend review of r2 (full text below) + panel response (full alignment, no fork)

---

## TL;DR

r2 is **directionally right but visually too dense**. r3 applies a three-layer information hierarchy to every screen:

```
Layer 1 — SCAN (main surface)    — answer "what matters?" in 3 seconds
Layer 2 — ACT  (next screen)     — one purpose, one primary action
Layer 3 — INSPECT (detail view)  — metadata, proof, full context
```

Plus aggressive use of bottom sheets / drawers for common actions, and "hidden by default" for audit + rule metadata. Familiar tab navigation stays. Visual reference: Rapido / PhonePe / Zomato.

---

## Friend's review (verbatim, for reference)

> We reviewed the current supervisor design preview, and the product direction is now good, but the UI is still too text-heavy and too packed for a real field supervisor to love instantly.
>
> **Main feedback:** Do not make every screen explain everything at once. We need a clearer hierarchy: main screen = scan, next layer = act, next layer = inspect. That means the next design pass should reduce visible density hard.
>
> **What is working:**
>
> - Today / Decisions / Activity / Chat separation
> - Decisions Workspace concept
> - Activity / Proof as a trust surface
> - WhatsApp as communication, Axhy as control
> - warm paper + terracotta visual direction
>
> **What is not working enough yet:**
>
> - too much reading
> - too many equally loud cards
> - too much detail visible too early
> - not enough separation between urgent signal and detailed explanation
>
> A tired supervisor should not have to read paragraphs to know what matters.
>
> **What should stay always visible:**
> site name · worker count · status counts · urgency / issue count · pending decisions count · one primary action · one short reason if needed
>
> **What should move into detail screens:**
> full worker list for a site · long reason text · full proposal explanation · full memory/rule context · detailed proof chain · detailed failure explanation · all source metadata
>
> **What should move into bottom sheets / drawers / action menus:**
> mark absent / late / half-day · amend status · add note · swap/reassign shortcuts · reverse actions · share actions · rare contextual choices
>
> **What should be hidden unless tapped:**
> audit metadata · source explanations · rule section names · scope metadata · repeated labels · long failure blocks · HR detail text unless selected
>
> **Design direction call:** familiar tab navigation + more aggressive splitting + much lower visible density. Think Rapido / PhonePe / Zomato.

## Panel response — full alignment, no fork

> **Sara Park** (UX, ex-Linear): "Friend is right. Three-layer hierarchy (scan / act / inspect) is the iOS-native pattern Linear and Notion both converged on. r2 violated it by putting layer-3 detail on the layer-1 surface."
>
> **Aanya Mehta** (AI/voice): "Pushing structured work out of chat into Decisions is the right call. Chat is a capture surface only — voice in, summary out, structured work owns its own tab."
>
> **Eric Chen** (10-yr arc): "Three-layer information hierarchy is the timeless pattern. Scan/act/inspect maps to mobile patterns every successful field-ops product converged on after 2018."
>
> **Karthik Reddy** (Indian B2B): "Rapido/PhonePe/Zomato is Suresh's muscle memory. The friend is steering toward the right reference. Don't innovate on the nav model; match it."
>
> **Suresh (day 365):** _"Jaise Zomato — restaurant pe tap → detail, dish pe tap → detail, cart pe tap → checkout. Mereko bilkul aisa chahiye. Ek screen pe sab dikhne se mai thak jaata hu."_
>
> **Naina Bansal** (pricing): "Density reduction = supervisor delight = retention = LTV up. Cost-neutral. Take it."
>
> **Mr. Reddy** (day 365): _"Mai owner side se dashboard dekhunga. Suresh ka app jab use karega tab fast lage. Yeh feedback theek hai."_

**Panel verdict: full alignment. No fork. Execute r3 per friend's direction.**

---

## The three-layer hierarchy applied to each tab

### Today tab

**LAYER 1 — Today home (scan in 3 sec)**

Compressed site cards (horizontal scroll OR 2-col grid). Per site card shows ONLY:

```
┌──────────────────────┐
│ [site avatar/logo]   │
│ Apollo Hospital      │   ← site name only
│ ✓ 12 workers (full)  │   ← status counts compressed
│ Green pill           │   ← coverage status
└──────────────────────┘

┌──────────────────────┐
│ [site avatar]         │
│ Mall Lobby            │
│ ⚠ 6 of 8 workers     │   ← gap visible without text
│ Yellow pill           │
└──────────────────────┘
```

Top of screen: **one urgency banner** if any site is red. E.g., _"⚠ Apollo Hospital — 3 absent, 1 site short. Tap to fix."_

What's NOT here: worker names, photos, individual statuses, action buttons. All deferred to layer 2.

**LAYER 2 — Site Detail (tap a site card)**

```
┌────────────────────────────┐
│ ← Apollo Hospital          │
│ ─────────────────────────  │
│ Coverage: 9 of 12          │   ← status chip at top
│                             │
│ Workers today               │
│ ─────────────────────────  │
│ • Mukesh Yadav   [STARTED] │   ← compact rows
│ • Ravi Kumar     [STARTED] │     name + status only
│ • Lakshmi Devi   [ABSENT]  │
│ • Pradeep Singh  [SCHEDULED]│
│ • ...                       │
│                             │
│ Tap row → worker detail     │
│ Long-press → quick actions  │
└────────────────────────────┘
```

Tap row → layer 3 (Worker Detail).
Long-press row → bottom sheet with quick actions: mark absent / late / half-day / swap / add note.

**LAYER 3 — Worker Detail (tap a row)**

Full info: assignments, recent history, audit log, contact, photos. Full proposal explanation if AI suggested anything. Hidden audit metadata expands on tap.

---

### Decisions tab (workspace)

**LAYER 1 — Decisions home (scan in 3 sec)**

Two visually-separate sections, top-to-bottom:

**Section 1 — HR Updates (pinned top, urgent):**

```
┌─────────────────────────────┐
│ 🔔 HR Updates (2)            │
│ ─────────────────────────── │
│ • New chemical safety policy │   ← 1-line summary only
│   from Mrs. Kavitha · 2h ago │   ← who + when, that's all
│   [Ack] →                    │
│                              │
│ • Pradeep performance warning│
│   from HR · 4h ago           │
│   [Ack] →                    │
└─────────────────────────────┘
```

**Section 2 — AI Decisions (below):**

```
┌─────────────────────────────┐
│ Decisions (5)                │
│ ─────────────────────────── │
│ ▣ Mark absent · Mukesh      │   ← compact card
│   Today · OPERATIONAL        │   ← tier color chip
│   No-call                    │   ← 1-line reason
│   [Apply]  [Not now]         │
│   tap for details →          │
│                              │
│ ▣ Swap workers · Apollo     │
│   Tomorrow · OPERATIONAL     │
│   Ravi → Lakshmi             │
│   [Apply]  [Not now]         │
│                              │
│ ▣ Approve leave · Pradeep   │
│   Mon-Wed · PERSONNEL        │
│   Family function            │
│   [Apply]  [Not now]         │
└─────────────────────────────┘
```

What's NOT here: full proposal text, alternative options, AI reasoning, full proof chain, source metadata. All deferred to layer 2.

**LAYER 2 — Decision Detail (tap a card)**

Full DecisionCard layout — all proposed fields, AI reasoning, alternatives (chip picker if conflict), edit-per-field option, Apply / Cancel buttons. Audit metadata behind "Show details" expand.

---

### Activity tab

**LAYER 1 — Activity home (clean timeline)**

```
┌─────────────────────────────┐
│ Activity      ⌕ search       │
│ ─────────────────────────── │
│ ▼ Today (12)                 │
│   09:18 ✓ Mukesh absent      │   ← compact row
│   09:30 ✓ HR update acked    │
│   10:02 ✓ Ravi swap applied  │
│   10:45 ⚠ Lakshmi blocked    │
│   ...                        │
│                              │
│ ▶ Yesterday (8)              │   ← collapsed by default
│ ▶ This week (43)             │
│ ▶ Last week (67)             │
└─────────────────────────────┘
```

**What is REMOVED from layer 1:** the loud "Share to WhatsApp" and "Reverse" buttons on every row. Those buttons made every row scream for attention.

**Subtle row affordance:** small dot icon at right of row, or swipe-right reveals quick share/reverse. Or just tap row → layer 2 → action buttons there.

**LAYER 2 — Event Detail (tap a row)**

```
┌─────────────────────────────┐
│ ← Mukesh absent              │
│ ─────────────────────────── │
│ When: Today, 09:18 AM        │
│ Site: Apollo Hospital        │
│ Reason: No-call              │
│ Pay deduct: ₹500            │
│ Confirmed by: Suresh Kumar   │
│ Method: Voice + AI confirm   │
│                              │
│ [📤 Share to WhatsApp]       │   ← only here
│ [↶ Undo (5 min window)]     │   ← only here
│                              │
│ ▶ Show proof chain           │   ← layer 3 expander
└─────────────────────────────┘
```

**LAYER 3 — Proof chain expansion (tap "Show proof chain")**

Full audit metadata: original voice transcript, AI tool calls, DB writes, outbox topics fired, who else was notified. For HR/owner audit review.

---

### Chat tab

**LAYER 1 — Chat home (capture-only, light)**

```
┌─────────────────────────────┐
│ Chat                        │
│ ─────────────────────────── │
│ (empty state: "Hello,       │
│  Suresh — try saying...")   │
│                              │
│   USER BUBBLE                │
│   AI BUBBLE: "I'll do 5      │
│   things — review →"         │
│         [Review 5 decisions →]│   ← tap goes to Decisions tab
│                              │
│ ┌──────────────────┐         │
│ │ 🎤 mic           │         │
│ └──────────────────┘         │
└─────────────────────────────┘
```

**What is REMOVED from chat:** inline DecisionCards stacked one after another. Compound utterances → AI shows a single bubble with "Review N decisions →" link → tapping pushes to Decisions tab where the new ones appear at top with a "new" badge.

Single-action utterances STILL show a single DecisionCard inline (for the most common case). It's the 3+ case that pushes to Decisions tab.

> **Rule:** chat owns INPUT and conversational explanation. Decisions owns STRUCTURED WORK. Don't dump operational density back into chat.

---

### Bottom sheets / contextual menus

Used for fast, in-context actions that don't deserve a full screen push:

| Sheet                    | Trigger                              | Actions                                                                      |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| **Worker quick actions** | Long-press worker row in Site Detail | Mark absent / late / half-day · Amend status · Add note · Swap · View detail |
| **Site quick actions**   | Long-press site card on Today        | View detail · Add note · Mark site closed · Share status to WhatsApp         |
| **Event row actions**    | Swipe right on Activity row          | Share to WhatsApp · Undo (if within 5 min) · Open detail                     |
| **Decision row actions** | Long-press decision card             | Apply · Not now · Edit · View context                                        |
| **Compose actions**      | Tap "+" floating button on Chat      | New voice memo · Quick mark absent · Quick complaint                         |

Bottom sheets matter because they:

- Don't break the user's current screen context
- Show ONLY the actions relevant to THIS row
- Slide up and dismiss cleanly
- Are familiar from WhatsApp / Zomato / PhonePe

---

### Hidden by default

Hide unless user explicitly taps:

- Audit timestamps (`createdAt`, `updatedAt`)
- Source explanations ("from rule §3.2 of HR policy")
- Rule section names / IDs
- Scope metadata (`companyId`, `supervisorId`, etc.)
- Repeated labels ("Worker: Worker: Mukesh")
- Long failure blocks (stack traces, error chains)
- HR detail text — show 1-line summary, full text on tap

These are layer-3 content. They belong in Detail screens, behind "Show details" expanders, NEVER on layer 1.

---

## Tab nav stays at 5

Per master plan §G.5 lock and friend's "keep familiar navigation":

```
[ Today ] [ Decisions ] [ Activity ] [ Chat ] [ Profile ]
```

No consolidation. No sidebar. The Mission Control direction is rejected (correctly).

What changes is WITHIN each tab — every tab now follows the scan / act / inspect 3-layer pattern.

---

## What's KILLED from r2 explicitly

Per friend's review of what's not working:

| r2 element                                                           | Why it's killed                           | Where it goes                               |
| -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Inline "Share to WhatsApp" + "Reverse" buttons on every Activity row | Equally loud, every row screams           | Bottom sheet on swipe / Event Detail screen |
| Full worker grid on Today home                                       | Too dense, density was visible at layer 1 | Pushed to Site Detail screen                |
| Long reason text in DecisionCard list                                | Reading burden on layer 1                 | Pushed to Decision Detail                   |
| Audit metadata visible everywhere                                    | Wrong layer                               | Layer 3 only                                |
| 3+ stacked DecisionCards in chat                                     | Heavy UI when AI emits batch              | Single bubble + push to Decisions tab       |
| Equally-loud HR Update and AI Decision cards                         | Same visual weight obscured urgency       | HR pinned top section, AI below             |

---

## Visual / token direction (no change)

Per friend "warm paper + terracotta visual direction" — keep current `@axhy/ui-tokens` theme. No color/font work in r3.

What changes: spacing, density, hierarchy of font sizes, layer separation. NOT colors.

---

## What r3 mockup will deliver

I will iterate the HTML mockup in `_supervisor-design-r3/project/` to show:

1. **Today home** — compressed site cards, urgency banner if applicable, NO worker grid inline
2. **Site Detail** — compact worker list, status chips, long-press → bottom sheet
3. **Worker Detail** — full info, audit hidden behind expander
4. **Decisions home** — HR Updates pinned top, AI Decisions below, both layer-1 compact
5. **Decision Detail** — full DecisionCard, alternatives, AI reasoning
6. **Activity home** — clean timeline grouped by day, no inline action buttons
7. **Event Detail** — proof, share, undo as primary actions on detail (not list)
8. **Chat home** — light, capture-only; batch DecisionCards pushed to Decisions tab
9. **Bottom sheet examples** — Worker quick actions / Event row actions

All HTML is preview-only. Live mobile app (Expo) does NOT change yet — that's Wave 4c work after r3 is locked.

---

## Open question for the founder

The friend mentioned: _"Also review the attached visual idea and decide as a panel."_

I don't see an attached visual in this conversation. Possibilities:

- Image/Figma file your friend shared separately (not pasted into this thread)
- Something he showed you in person
- The reference IS the existing r2 HTML preview and "the attached visual idea" was a misread

**Before I start iterating r3 mockup**, please:

- Share the attached visual if it exists, OR
- Confirm we proceed with just the written feedback (no extra visual to reference)

---

## Plan-mode gate (per `feedback_plan_mode_for_medium_major_changes`)

This is a **major design change** — re-architects every screen.

Per the locked rule, I do not edit any HTML until you approve this spec.

**What you sign off on:**

1. Three-layer hierarchy (scan / act / inspect) as the architectural pattern → agree?
2. Five tabs stay (no consolidation, Mission Control killed) → agree?
3. Each tab follows the layer-1 / layer-2 / layer-3 pattern as documented above → agree?
4. Bottom sheets for the listed contextual actions → agree?
5. Hidden-by-default for the listed audit/metadata content → agree?
6. r3 HTML mockup as the deliverable (live Expo app unchanged) → agree?

Either reply _"approved — start r3 mockup"_ or list specific pushbacks per item.

After approval:

1. I iterate `_supervisor-design-r3/project/` per this spec
2. Run Playwright capture + read screenshots
3. Run panel critique on the rendered output (per `feedback_playwright_panel_review_before_founder`)
4. Fix Tier 1 issues
5. THEN surface to you via `http://localhost:8765/` (need to update server target to r3)
6. You + friend re-review
7. Iterate until r3 is locked → r4 if needed
