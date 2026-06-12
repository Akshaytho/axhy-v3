# HR Portal — Complete UI Design Brief

**Date:** 2026-06-13 · **Status:** Ready for design · **Property:** `app.axhy.app/hr` (logged-in)
**Inherits:** the visual direction + token sheet the founder picks in `01-marketing-website-design-brief.md` §4. This brief is direction-agnostic: it specifies structure, screens, states, and components — the chosen tokens style them.
**Rule zero:** nothing from the current admin-web /hr pages is reference material. Fresh thinking.

Written so a designer can deliver **100% complete UI designs without asking a product question.** Scope source: architecture doc §5.1 (extracted from the live API). Lifecycle states below are copied from the real state machines — **the UI may only ever show these states; never invent a status.**

---

## 1. Who HR is, and what their day looks like

Sunita runs HR for a cleaning company with 400 workers across 30 sites. She sits at a desk with a laptop (sometimes only her phone). Her day is **queues**: leave to approve, a complaint to read, a new worker to add before Monday, a supervisor's late-reversal request to judge, a policy to update. She is interrupted constantly. Every screen must answer in two seconds: **"what needs me, and what happens if I press this?"**

Design consequences:

- **Queue-first.** Counts on the home screen; every queue sorted oldest-first; one-tap approve/reject with a required reason where the rules demand one.
- **Nothing is ever lost.** Every action lands in the permanent record (audit trail). Destructive-looking actions (suspend, terminate, anonymise) get confirmation with plain-words consequences.
- **Trustworthy emptiness.** "All caught up" is a designed state, not a blank page.

## 2. The scope rule that shapes everything (do not skip)

**HR visibility is site-anchored.** An HR user sees only workers who have live assignments to sites that this HR owns. A brand-new HR user with no sites sees _empty_ worker/leave lists — **by design, not by bug**. Every list screen therefore needs TWO distinct empty states:

1. **No sites yet:** "You don't manage any sites yet. Ask your owner to assign sites to you — then your workers appear here." (with a link to Sites)
2. **No items:** "No pending leave. You're all caught up." (calm, with a tick motif)

## 3. App shell & navigation

- **Desktop (≥1024px, primary canvas):** left sidebar — AXHY mark · **Home · Workers · Sites · Leave · Swaps · Complaints · Reversals · Policies · Updates · Team · Record** — with pending-count badges on queue items (Leave, Swaps, Complaints, Reversals). Current area highlighted. Bottom of sidebar: user chip (name, company, role) + sign out, visually separated.
- **Mobile (375px):** top app bar (page title + hamburger) opening a sheet with the same 11 items; queue badges visible in the sheet. No bottom tabs (more than 5 destinations).
- **Top bar (all sizes):** breadcrumb on detail pages (`Workers / Ramesh Babu`), global search (workers + sites by name/phone), company name.
- Session expiry → redirect to login with a friendly line; never a dead screen.

## 4. Page templates (design these four once; every screen is an instance)

1. **Dashboard** (Home) — stat cards + queue summaries.
2. **List page** — toolbar (search, filters, primary action button) + data table (desktop) / card list (mobile) + pagination ("50+ rows virtualize" is an engineering note; design the pagination control).
3. **Detail page** — header (name, status chip, primary actions) + tab row or stacked sections + right-rail meta (desktop) that stacks below on mobile.
4. **Queue review** — list of pending cards; clicking opens a **review sheet** (side panel desktop / bottom sheet mobile) with the request, context, an optional-or-required reason field, and Approve / Reject buttons. The sheet pattern is reused by Leave, Swaps, Complaints, and Reversals — design it once, thoroughly.

## 5. Status chips — the exact vocabulary (one chip component, semantic colors from the token sheet)

| Domain    | States the UI may show                                                                                                                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leave     | `REQUESTED` (attention) · `APPROVED` (positive) · `REJECTED` (negative)                                                                                                                                                                                                                                                            |
| Swap      | `SENT` (neutral) · `ACCEPTED` (positive) · `DECLINED` (negative)                                                                                                                                                                                                                                                                   |
| Complaint | `OPEN` (attention) · `IN_HR` (active) · `RESOLVED` (positive) · `DISMISSED` (neutral)                                                                                                                                                                                                                                              |
| Visit     | `SCHEDULED` · `EN_ROUTE` · `ON_SITE` · `IN_PROGRESS` · `PHOTOS_PENDING` · `AWAITING_VERIFICATION` · `VERIFIED` (positive) · `FLAGGED` (warning) · `SUPERVISOR_RESOLVED` · `REJECTED` (negative) · `NO_SHOW` (negative) · `CANCELLED` (neutral) · `ARCHIVED` (muted)                                                                |
| Worker    | `INVITED` · `PENDING_ACTIVATION` · `DOC_PENDING` · `ACTIVE` (positive) · `AT_RISK` (warning) · `ON_LEAVE` · `ON_SUSPENSION` (warning) · `INACTIVE` · `BLOCKED` (negative) · `TRANSFER_PENDING` · `TERMINATION_PENDING` (warning) · `TERMINATED` (negative) · `ANONYMIZATION_REQUESTED` · `ANONYMIZED` (muted) · `ARCHIVED` (muted) |

Chips always pair color with a label (never color alone). Long state names get plain-words display text (e.g. `DOC_PENDING` → "Documents pending") — design both the chip and a legend/tooltip showing the plain meaning.

## 6. Screen-by-screen specification (11 areas)

### 6.1 Home `/hr`

Greeting ("Namaste, Sunita") + date. **Needs-you row:** four tappable stat cards — Pending leave · Open complaints · Swap requests · Reversal requests — each with count and "oldest waiting: 2 days" subtext; zero-count cards render calm/muted. **Today strip:** visits today, verified vs flagged counts (links into Record filtered to today). **Recent activity:** last 10 audit entries, plain words. States: loading skeletons for cards; the two §2 empty states; partial-failure (one card errors → inline retry on that card only).

### 6.2 Workers `/hr/workers`

**List:** search (name/phone), filters (site, status chip), Add Worker button. Table columns: name, phone, primary site, status chip, last visit. Mobile card: name + chip + site.
**Detail `/hr/workers/:id`:** header (name, phone, photo placeholder, worker status chip, actions menu). Sections/tabs: **Profile** (editable fields, languages) · **Sites & shifts** (current assignments, add/end assignment) · **Attendance** (calendar-month view: present/absent/leave/no-show marks — legend mandatory) · **Visits** (table with visit status chips, link into visit detail) · **Leave history** · **Record** (audit trail filtered to this worker).
**Actions (each = confirmation dialog with plain consequences + required reason where noted):** Suspend (reason required) · Lift suspension · Start termination (reason; shows "history is kept permanently") · Anonymise (HR-initiated only; dialog explains personal details are removed but work records stay — irreversible, strongest visual warning).
**Add worker `/hr/workers/new`:** short form — name, phone (+91 prefix fixed), language, site assignment (optional at create). Inline validation on blur; success → detail page with a "worker invited — they log in with WhatsApp code" banner.

### 6.3 Sites `/hr/sites`

**List:** name, area, workers assigned, supervisor, today's status (visits done/total). Add Site.
**Detail `/hr/sites/:id`:** header (name, address) · **Roster** (workers + shift times; add/remove binding; workdays pattern display) · **Supervisor** (assigned supervisor(s)) · **QR code block** — the site's scan code, large, with a Print/Download action and a one-line explainer ("Workers scan this at the site to start a visit") · **Visits** (recent, with chips). Add/edit site form: name, address, geo (optional), shift template.

### 6.4 Leave `/hr/leave-requests`

Queue of `REQUESTED` cards: worker, dates, type, days count, their note, conflict hint if the roster is short that day ("2 others already on leave at Hospital A"). Review sheet: Approve / Reject + reason (required on reject). History tab: all past leave with chips, filterable. Decisions take effect per the rules engine — copy in the sheet must never promise instant roster changes ("applies from tomorrow's roster" where applicable — next-day cutoff is the product rule).

### 6.5 Swaps `/hr/swap-requests`

Same queue+sheet pattern. Card: requester ↔ proposed replacement, site, date/shift. States `SENT/ACCEPTED/DECLINED`. Terminal states are read-only — the sheet shows the outcome, no buttons.

### 6.6 Complaints `/hr/complaints`

Queue (`OPEN`, `IN_HR`) + history (`RESOLVED`, `DISMISSED`). Detail: complaint text, who raised it, about whom/which site, timeline of what happened since. Actions: Take up (→ `IN_HR`), Resolve (resolution note required), Dismiss (reason required). Sensitive-content note for the designer: complaints may name people — generous line length, no truncation of the complaint body.

### 6.7 Reversals `/hr/reversals` (the late-reversal queue)

Supervisors sometimes need to undo an action after its window closed — those requests land HERE. Card: what the supervisor wants undone, their reason, when the original action happened, the AI/visit context if any. Review sheet: Approve undo / Decline + reason. This queue is duplicate-proof server-side; the UI shows one card per request. Empty state: "No reversal requests. Supervisors can undo recent actions themselves — only old ones come to you."

### 6.8 Policies `/hr/policies`

List of company policies (plain-words titles), each with current value and "since" date. Edit flow: change value → confirmation states **"takes effect tomorrow, not immediately"** (the daily-cutoff rule — this copy is mandatory) → policy history (who changed what, when — append-only, no delete affordance ever).

### 6.9 Updates `/hr/updates`

**Compose:** title + body (plain text), audience (company-wide), "requires acknowledgement" toggle → publish confirmation ("Supervisors must read this and reply in their own words — 5 words or more"). **Track:** per-update ack report — who acknowledged (with their typed 5-word ack visible), who hasn't (with a nudge-able list). This is the web side of the mobile "Company updates" screen that shipped 2026-06-12.

### 6.10 Team `/hr/team` (memberships)

List of portal/app accounts: name, phone, role chip (HR / SUPERVISOR / OWNER), status. Invite member (phone + role; supervisors must then be bound to sites — link to the site detail). Remove flows are deliberately conservative: deactivate, never delete (records persist).

### 6.11 Record `/hr/record` (audit trail)

Read-only, filterable (person, site, date range, kind). Each entry: when (IST, en-IN format), who, what — in plain words ("Sunita approved 2 days leave for Ramesh Babu"). **No edit or delete affordance exists anywhere on this screen — its immutability is a feature; the design should make that legible** (e.g. a permanent-record motif from the chosen direction). Pagination by day groups.

## 7. Component inventory (beyond the marketing set)

App shell (sidebar + mobile sheet nav) · stat card (count, label, subtext; attention/calm variants) · data table (header sort, row hover, selected, loading skeleton rows, sticky header) · mobile card-list row · status chip (semantic variants per §5 + legend tooltip) · queue card · **review sheet** (side panel / bottom sheet; approve+reject+reason; required-reason validation) · confirmation dialog (standard + destructive with consequence text) · attendance month calendar (5 mark types + legend) · audit timeline entry · QR code block (screen + print layout) · form set (text, phone with +91, select, date range picker, toggle, textarea with counter) · banner (info/success/warning) · toast · breadcrumb · search-with-results dropdown · pagination · empty states (the §2 pair + per-screen variants) · error state with retry · session-expired interstitial.

## 8. Interaction rules

Same motion grammar as the marketing site (150–300ms, transform/opacity, reduced-motion = static). Queue actions give immediate feedback: button → loading → the card animates out of the queue (or shows inline error WITH the reason kept in the field — never wipe a typed reason on failure). Optimistic UI is allowed ONLY where the action is reversible; approve/reject/suspend always wait for the server and show honest results. Keyboard: full table and sheet operability; `Esc` closes sheets (with confirm if a reason is half-typed); focus returns to the triggering row.

## 9. Responsive, a11y, performance (acceptance criteria)

- Design at **1440px (primary)** and **375px** for every screen; 768px where the table↔card switch happens.
- Tables: never horizontally scroll the whole page on mobile — switch to cards.
- WCAG AA: 16px body, 4.5:1 contrast (check chip colors on their backgrounds), visible focus, 44px touch targets, labels on every field (no placeholder-only), errors below fields, `aria-live` for queue updates noted in the design file.
- Numbers and dates: en-IN format (12 Jun 2026, 2:15 pm), tabular figures in tables.
- Perceived performance: skeletons for every list/detail (no spinners-only); TTI < 4s on a mid Android.

## 10. Designer deliverables checklist ("100% UI design" =)

- [ ] App shell: desktop sidebar (rest/hover/active/badged) + mobile nav sheet
- [ ] The four page templates, fully styled in the chosen direction
- [ ] All 11 areas at 1440px + 375px, including every detail/sub-screen named in §6
- [ ] Status chip sheet — every state in §5 rendered with its plain-words label
- [ ] Review sheet in all states: rest, reason-required error, submitting, success, server-rejected
- [ ] Both §2 empty states + per-screen empties; error+retry; session-expired
- [ ] Attendance calendar with legend; audit timeline; QR block (screen + print)
- [ ] Confirmation dialogs: standard, destructive (suspend/terminate), irreversible (anonymise)
- [ ] Full form-state set (focus, filled, error, disabled, autofilled)

**Out of scope:** Owner portal and System portal (next briefs, `03-` and `04-`), dark mode, hi/te layouts (allow ~30% longer strings), the NEW backend endpoints' exact payloads (engineering doc, not design).
