# Supervisor Context — Self-Contained Spec for AI Tools

> **Audience:** an external AI design / code tool (Claude Design, Lovable, Cursor, Antigravity agent) OR a human developer.
>
> **Purpose:** everything you need to build supervisor screens for Axhy v3 — the domain, the brand, the rules, the data shapes — without browsing the rest of the repo.
>
> **NOT in scope:** visual representation. This doc gives semantic + structural facts only. The visual design tool produces the visual.
>
> **Scope of "supervisor" in this doc:** the supervisor mobile app — 5 tabs (Chat, Today's Plan, Summary, Updates, Profile). Profile tab is the immediate target. The other 4 tabs are documented for context.

---

## 0. Why this doc exists

Axhy v2 had its UI redesigned 4 times AFTER code was already shipped. Each iteration created bugs and wasted weeks. The fix is not a better design tool — it's a self-contained spec, locked BEFORE any code is written, that describes the design constraints precisely enough that a competent design tool produces correct output on round 1.

**Read this doc as binding.** When in doubt, this doc wins. If a section says "tap targets minimum 48pt," do not propose 36pt with a justification. If a section says "no SaaS jargon," do not write "streamline."

The Axhy product follows a panel-decision model: 73 named voices debate decisions, lock them in writing, and don't re-debate without strong evidence. This doc is a snapshot of supervisor-related locks as of 2026-05-08.

---

## 1. Who is a supervisor in Axhy?

### Persona — Ravi (the canonical supervisor)

- **Age:** 32
- **Languages:** Telugu native, functional Hindi, basic English
- **Location:** Hyderabad, India
- **Tenure at job:** 5 years as supervisor for a cleaning company called Surya
- **Team:** 35 workers across 8 sites
- **Device:** ₹10,000 Android phone, cracked screen, 70% storage full
- **WhatsApp groups:** 8+ active
- **Day shape:** wakes 5:30 AM, sleeps 11 PM, drives a scooter between sites
- **Reading level:** Telugu native; functional English; jargon-allergic; trusts gut over dashboards
- **Most-used app:** WhatsApp (voice notes more than typing)

### What Ravi does every day

- 6 AM: checks who hasn't shown up
- Sends replacement workers to cover absentees
- Receives client complaints (currently via WhatsApp)
- Tells HR when a worker takes leave
- Resolves on-site disputes
- Swaps workers between sites
- Notes site-specific rules ("this client doesn't want chemicals near kitchen")

**All of this currently happens across 8+ WhatsApp groups.** Axhy's job is to consolidate it into one app he can use one-handed while walking.

### Pain points (in his own words, paraphrased from interviews)

- "I get blamed when a worker doesn't show up — even when I sent a replacement."
- "Client complaints land on me. I have no record."
- "New apps take time to learn. I don't have time."

### What makes Ravi switch from WhatsApp to Axhy

> "Will switch if voice capture is faster than WhatsApp."

This is the renewal lever. If the supervisor finds the chat tab faster than WhatsApp, the company renews at month 30. If slower, renewal is at risk. **Voice mic ergonomics matter more than visual polish.**

### Decision authority

The system architecture doc categorizes supervisor decisions into 3 tiers:

| Tier            | Examples                                   | Who acts                                   |
| --------------- | ------------------------------------------ | ------------------------------------------ |
| **OPERATIONAL** | Worker swaps, mark absent, flag site issue | Supervisor — immediate                     |
| **PERSONNEL**   | Leave approval, deductions                 | Supervisor approves; HR notified           |
| **EMPLOYMENT**  | Termination, hire, salary change           | HR + Owner only — supervisor never touches |

Decision tier is rendered visually (color-coded; see §6.4 decisionTier tokens).

---

## 2. The 5-tab supervisor mobile app — what's locked

### Layout (Iteration 5 lock, panel-locked, do not change)

**Bottom tab bar with 5 tabs in this order:**

1. **Chat** — primary capture surface
2. **Today's Plan** — read-only live view
3. **Summary** — end-of-day metrics
4. **Updates** — HR rule acknowledgments
5. **Profile** — supervisor's personal info + usage stats

### Per-tab purpose

#### Chat tab

The supervisor speaks or types operational changes ("Raju absent today, send Mukesh to Westfield"). AI (Claude Sonnet 4.6) parses intent into structured **decision cards**. Supervisor reviews cards and taps **Apply All** (atomic batch). Loads supervisor's per-user living-doc context once per day at 3:30 AM into prompt cache. **Voice mic in lower-right (one-handed reach).**

#### Today's Plan tab

Read-only. Shows all assignments across all sites for today: who is working where, who is late, who hasn't clocked in. **No AI calls** — direct DB query. Replacement search is a SEPARATE dedicated screen (PUBG-style invites, 2-min timer), not inline.

#### Summary tab

End-of-day single screen: today's changes count, flagged visits count, leave requests pending, tomorrow's plan summary. Tap any category to drill in. Read-only DB query.

#### Updates tab

HR pushed rule updates show here with red badge for unacknowledged count. Supervisor acknowledges by typing or speaking minimum 5 words — NOT a button tap. AI (Claude Haiku 4.5) extracts intent from the words for HR dashboard. Workers do NOT see HR rules — they see results in their schedule.

#### Profile tab — the immediate build target

Locked content (panel pick Q12-B, founder ack pending): **Profile + voice usage stats.** See §3 below for concrete fields.

### Cross-tab dependencies

- Chat decisions → Today's Plan (assignments update after Apply All)
- Summary → aggregates Chat + Today's Plan data
- Updates → fully isolated workflow, separate notifications
- Profile → informational only; no other tab depends on Profile state

---

## 3. Profile tab content (concrete fields)

The Profile tab has **two sections** per panel lock Q12-B:

### Section A — Personal info

Read-only unless marked editable.

| Field          | Source                               | Editable? | Notes                                                                                      |
| -------------- | ------------------------------------ | --------- | ------------------------------------------------------------------------------------------ |
| Name           | `User.name`                          | YES       | Inline edit on tap                                                                         |
| Phone          | `User.phone`                         | NO        | Tied to OTP login; change requires HR re-invite                                            |
| Locale         | `User.locale`                        | YES       | Picker: `en` / `hi` / `te`                                                                 |
| Active company | `Company.name`                       | NO        | Visible if user has memberships in multiple companies; tap to switch (multi-company login) |
| Active role    | `Membership.role` (= `'SUPERVISOR'`) | NO        | Mode-switcher visible if `availableRoles` includes another role (e.g. `WORKER`)            |
| Member since   | `Membership.createdAt`               | NO        | Display as "Joined March 2025"                                                             |

### Section B — Voice usage stats

Read-only metrics. Computed from supervisor's chat session history.

| Stat                         | Definition                                                                 | Display format                                                        |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Voice ratio (today)          | (voice messages today) / (all messages today)                              | "84%"                                                                 |
| Voice ratio (30-day)         | Rolling 30-day average                                                     | "78%" + sparkline                                                     |
| Avg AI parse confidence      | Mean confidence score of decision cards from this supervisor's voice input | "Excellent" / "Good" / "Under review" — qualitative tier, NOT numeric |
| Total voice minutes (30-day) | Sum of all voice clip durations                                            | "47 min"                                                              |
| Voice → apply-all rate       | Decisions confirmed without manual edit / total parsed decisions           | "92%"                                                                 |

**Critical rule:** AI accuracy is shown as **qualitative tiers only** ("Excellent" / "Good" / "Under review" / "Flagged"). Never show numeric percentages like "94.2% accuracy". Per master plan §A this is a hard reject.

### Section C (smaller) — Settings

| Action                    | Behavior                                                |
| ------------------------- | ------------------------------------------------------- |
| Notifications preferences | Smart defaults (panel pick Q9-A); per-category override |
| Sign out                  | Confirms; revokes refresh token; navigates to login     |
| Switch company            | Visible only when `memberships.length > 1`              |

### What's NOT on Profile tab

- Bank account info (`Worker.bankIfsc`, `Worker.bankAcct`) — HR-only PII; supervisor never sees these even for themselves on this tab. (If a supervisor is also a worker — same person, different role — that's the worker app.)
- Performance reviews, ratings, scores
- Termination history of the people they manage
- Owner contact info

---

## 4. Open questions (still pending founder ack)

The panel has a recommended pick for each. Founder can lock all by saying "your picks all". For supervisor work the relevant open questions are:

| #   | Question                     | Panel pick                                                  | Affects                                           |
| --- | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| Q1  | Chat UI structure            | B — bubbles + parsed card below each user message           | Chat tab                                          |
| Q2  | Apply changes timing         | C — Apply All atomic batch with partial-progress on failure | Chat tab                                          |
| Q3  | Editing parsed change        | C — both (tap card edit + re-record)                        | Chat tab                                          |
| Q6  | Flagged review queue UI      | A — swipeable cards                                         | Today's Plan / a sub-screen                       |
| Q7  | Leave approval flow location | All three combined (inline + dedicated + push-to-detail)    | Today's Plan / push notif                         |
| Q8  | Site priority flagging       | C — voice command + long-press in plan view                 | Today's Plan                                      |
| Q9  | Notification defaults        | A — smart defaults, with per-category override              | Profile (settings)                                |
| Q10 | Offline mode                 | B — capture + pending-sync indicator                        | Chat (offline mode itself deferred to post-pilot) |
| Q11 | Multi-supervisor conflict    | B — show pending change with override option                | Today's Plan                                      |
| Q12 | **Profile tab content**      | **B — profile + voice usage stats**                         | **Profile (this build)**                          |
| Q13 | First-login onboarding       | A — 60-sec video + tooltip                                  | Login flow first-time                             |

For Profile tab specifically: assume Q12-B is locked. If founder explicitly overrides to A or C, redo Section B.

---

## 5. Hard rules — non-negotiable

These come from `v3_hard_rules.md` and master plan §E. Listed with supervisor relevance.

### Multi-tenant isolation

- Every domain table has `companyId` FK
- Backend injects `companyId` from authenticated session — the LLM in chat tab can NEVER pass or override `companyId`
- User content from supervisor wrapped in `<untrusted_user_content>` tags before any downstream LLM sees it
- Postgres Row-Level Security (RLS) as defense in depth

### AI thin-boundary

- AI invoked ONLY at user-input boundary (chat tab voice/text input, HR ack intent extraction)
- Read-only views (Today's Plan, Summary, Profile) NEVER call AI — direct DB query
- Notifications are state-machine-triggered, never AI-triggered
- AI never writes to DB without human confirmation
- AI never makes personnel suggestions ("recommend Arjun") — system shows 2-3 plain options, supervisor picks
- Worker AI rate-limit stricter than supervisor

### Privacy / DPDP

- Voice files deleted within 24 hours of transcription (logged)
- Per-rule visibility ACL: COMPANY / SUPERVISOR_OWN / WORKER_OWN
- Hybrid STT routing: Sarvam for monolingual Hindi/Telugu/Tamil/Marathi (India region), OpenAI Whisper for code-switched (MSA-consented)

### State machines and audit

- Every supervisor action that transitions a domain entity writes an event row to `AuditEvent`
- Supervisor cannot make ad-hoc state mutations — all transitions go through typed XState machines
- Cascade depth capped at 3

### Code quality

- TypeScript strict mode, no `any` types
- No `// TODO` or `// FIXME` in committed code
- Every screen file under 500 lines
- Every screen handles empty / loading / error / success / edge states explicitly

### UX constraints

- Tap targets minimum **48pt** on mobile (matches `tokens.tap.minMobile = 48`)
- One-handed reachability: primary CTAs in lower-right 60% of screen
- AI is **QUIET** by default — only asks on 4 clarification triggers: AMBIGUOUS_WORKER, MISSING_INFO, OFF_TOPIC, CONTRADICTION
- AI replies in **same language as input** (Ravi will speak Telugu/Hindi mix)
- No SaaS jargon in UI copy

### Hosting

- ALL services deploy to Railway. No Vercel, no Cloudflare Workers.
- Mobile ships via EAS Build to Play Store. Internal testing track from week 1; closed testing from week 9.

---

## 6. Brand tokens — the complete palette

**Source of truth:** `packages/ui-tokens/src/index.ts`. Generated CSS variables in `packages/ui-tokens/src/generated/tokens.css`. Imported in web via `@import '@axhy/ui-tokens/tokens.css'` in `apps/admin-web/app/globals.css`.

**For mobile (React Native):** import the flat object from `packages/ui-tokens/src/generated/native.ts`.

**Source lock date:** 2026-05-07. Per ADR-0014 — terracotta + paper system, REPLACES the old gold-on-black system. Use only canonical names below; the old `--gold`, `--black`, `--gray-N` aliases exist for legacy compatibility but new code must NOT use them.

### 6.1 Surface — warm paper family

| Token                    | Hex                      | CSS var       | Use                                 |
| ------------------------ | ------------------------ | ------------- | ----------------------------------- |
| `color.surface.paper`    | `#F6F1E8`                | `--paper`     | Primary page canvas                 |
| `color.surface.paper2`   | `#EFE7D8`                | `--paper-2`   | Recessed panels, sidebar background |
| `color.surface.paper3`   | `#E6DCC8`                | `--paper-3`   | Dividers, chips, hover state        |
| `color.surface.card`     | `#FDFAF3`                | `--card`      | Elevated card surface               |
| `color.surface.cardEdge` | `rgba(40, 30, 20, 0.08)` | `--card-edge` | Card border / hairline divider      |

### 6.2 Ink — carbon text

| Token                   | Hex       | CSS var   | Use                                            |
| ----------------------- | --------- | --------- | ---------------------------------------------- |
| `color.ink.primary`     | `#1A1612` | `--ink`   | Primary text — warm near-black (NOT pure #000) |
| `color.ink.secondary`   | `#4A3F33` | `--ink-2` | Secondary / body text                          |
| `color.ink.tertiary`    | `#7A6B58` | `--ink-3` | Muted labels, metadata                         |
| `color.ink.placeholder` | `#A89880` | `--ink-4` | Ghost text, disabled states                    |

### 6.3 Brand — terracotta accent (one accent color, no exceptions)

| Token                    | Hex       | CSS var         | Use                                     |
| ------------------------ | --------- | --------------- | --------------------------------------- |
| `color.brand.accent`     | `#C0492A` | `--accent`      | Primary CTAs, active states, links, FAB |
| `color.brand.accent2`    | `#A83D20` | `--accent-2`    | Pressed/hover state of accent           |
| `color.brand.accentSoft` | `#F5DAC9` | `--accent-soft` | Tinted chip background, focus ring      |
| `color.brand.accentInk`  | `#6E2410` | `--accent-ink`  | Text ON accent-soft backgrounds         |

### 6.4 Semantic — status colors

| Token                     | Hex       | CSS var       | Use                                   |
| ------------------------- | --------- | ------------- | ------------------------------------- |
| `color.semantic.ok`       | `#4A7C59` | `--ok`        | Success / on-site attendance          |
| `color.semantic.okSoft`   | `#D6E5D0` | `--ok-soft`   | Success chip background               |
| `color.semantic.warn`     | `#B8860B` | `--warn`      | Late workers, caution                 |
| `color.semantic.warnSoft` | `#F0E2B6` | `--warn-soft` | Warning chip background               |
| `color.semantic.bad`      | `#A8341D` | `--bad`       | No-show, errors, danger               |
| `color.semantic.badSoft`  | `#F0C8BD` | `--bad-soft`  | Error chip background                 |
| `color.semantic.infoInk`  | `#2C4A6B` | `--info-ink`  | Informational text (operational tier) |
| `color.semantic.infoSoft` | `#D5DDE6` | `--info-soft` | Informational chip background         |

### 6.5 Decision tier — tier-to-color mappings (used in DecisionCard)

| Tier          | Background      | Text           | Border     | Risk                             |
| ------------- | --------------- | -------------- | ---------- | -------------------------------- |
| `note`        | `--paper-3`     | `--ink-3`      | none       | Lowest — logged event, no action |
| `operational` | `--info-soft`   | `--info-ink`   | none       | Medium — reassignment            |
| `personnel`   | `--accent-soft` | `--accent-ink` | `--accent` | High — leave approval            |
| `employment`  | `--bad-soft`    | `--bad`        | `--bad`    | Highest — termination            |

### 6.6 Typography — font stack

- `font.body` → `var(--font-body)` = Inter → Noto Sans Devanagari → Noto Sans Telugu → system-ui
- `font.mono` → `var(--font-mono)` = JetBrains Mono → ui-monospace → SF Mono → Menlo
- All loaded via `next/font/google` (web) or `expo-google-fonts` (mobile).
- No local font files. No custom fonts.

### 6.7 Type scale

| Token       | Size px | Line height | Weight | Tracking          | Use                             |
| ----------- | ------- | ----------- | ------ | ----------------- | ------------------------------- |
| `displayXl` | 56      | 1.05        | 600    | -1.4px            | Marketing hero                  |
| `displayL`  | 40      | 1.05        | 600    | -1.0px            | Marketing section               |
| `display`   | 28      | 1.10        | 600    | -0.6px            | Screen heading                  |
| `heading`   | 22      | 1.20        | 600    | -0.3px            | Card title                      |
| `subhead`   | 18      | 1.30        | 500    | -0.1px            | Supporting context              |
| `body`      | 15      | 1.50        | 400    | 0                 | Primary readable prose          |
| `bodySm`    | 13      | 1.45        | 500    | 0                 | Worker/site rows                |
| `caption`   | 11      | 1.40        | 600    | +0.06em UPPERCASE | Section eyebrows                |
| `monoL`     | 15      | 1.40        | 500    | —                 | Large numerics (prices, counts) |
| `mono`      | 13      | 1.40        | 500    | —                 | Code paths, IDs, phone numbers  |
| `monoSm`    | 11      | 1.40        | 500    | —                 | Small metadata                  |

### 6.8 Weights

| Token             | Value | Use                    |
| ----------------- | ----- | ---------------------- |
| `weight.regular`  | 400   | Body copy              |
| `weight.medium`   | 500   | Labels, mono           |
| `weight.semibold` | 600   | Headings, active items |
| `weight.bold`     | 700   | Emphasis, nav, buttons |

**No 300/light** — renders thin on low-end Android (Ravi's phone).
**Body weight floor:** 700 in marketing/auth pages (`globals.css` html/body). In-app screens use 400 body / 500 labels / 600 headings.

### 6.9 Radius

| Token        | Value | Use                                           |
| ------------ | ----- | --------------------------------------------- |
| `radius.r1`  | 6px   | Chips, mini badges                            |
| `radius.r2`  | 10px  | Inputs, search, action links, section headers |
| `radius.r3`  | 14px  | Cards, buttons, modals, banners               |
| `radius.r4`  | 20px  | Overlays, bottom sheets                       |
| (full round) | 999px | Pills, FAB, avatars                           |

### 6.10 Shadow

All shadows use warm ink (`rgba(40, 30, 20, …)`), never pure black.

| Token        | Value                                                             | Use                 |
| ------------ | ----------------------------------------------------------------- | ------------------- |
| `shadow.sh1` | `0 1px 2px rgba(40,30,20,0.06)`                                   | Cards — subtle lift |
| `shadow.sh2` | `0 1px 3px rgba(40,30,20,0.08), 0 4px 12px rgba(40,30,20,0.06)`   | Modals, dropdowns   |
| `shadow.sh3` | `0 4px 16px rgba(40,30,20,0.12), 0 12px 32px rgba(40,30,20,0.08)` | Sheets, overlays    |

### 6.11 Spacing — 4px base grid

`space.0=0, space.1=4, space.2=8, space.3=12, space.4=16, space.5=20, space.6=24, space.7=32, space.8=40, space.9=48, space.10=64, space.11=80, space.12=128`

`space.9` (48px) = minimum mobile tap target.
`space.11` (56px) = preferred primary action height.

### 6.12 Motion

| Token                | Value                                | Use                                    |
| -------------------- | ------------------------------------ | -------------------------------------- |
| `motion.durFast`     | 120ms                                | `--dur-fast` — button press, hover     |
| `motion.dur`         | 200ms                                | `--dur` — sheets, tabs, fades          |
| `motion.durSlow`     | 320ms                                | `--dur-slow` — modals, important moves |
| `motion.easeNatural` | `cubic-bezier(0.32, 0.72, 0, 1)`     | `--ease-natural`                       |
| `motion.easePaper`   | `cubic-bezier(0.165, 0.84, 0.44, 1)` | `--ease-paper`                         |

**Banned animations:** bounces on confirms; skeuomorphic ripples; parallax; animated counters. Animation must serve clarity, not decoration.

### 6.13 Layout

| CSS var    | Value                       | Purpose                    |
| ---------- | --------------------------- | -------------------------- |
| `--max`    | 1120px                      | Max content width (web)    |
| `--gutter` | 24px (web) / 20px on ≤720px | Default horizontal padding |

---

## 7. Layout rules — supervisor mobile

- **Tab bar:** fixed bottom. 5 tabs. Heights: 56–60px tab bar. Active tab uses `--accent` for label + indicator dot.
- **Header:** sticky top. ~52–60px. Contains greeting (date, name) on Profile tab.
- **Voice mic FAB:** position `bottom: 96px, right: 20px` — this is the lower-right one-handed-reach position. 64×64px. `--accent` background. Boxshadow `0 1px 0 rgba(0,0,0,0.1), 0 8px 24px rgba(192,73,42,0.4)`.
- **Decision cards in chat:** stack vertically with 12–16px gap. Each card is `radius.r3` (14px), padding 16px.
- **Pull-to-refresh:** YES on Today's Plan + Summary tabs.
- **Swipe gestures:** swipe-right to delete a flagged item (mark as resolved). Swipe-left undoes. Long-press on a worker/site reveals quick actions menu.

### Reachability cones

The bottom-right 60% of the screen is the safe one-handed-reach zone. Primary CTAs (Apply All, Approve, Confirm) MUST be in this zone. Destructive or complex actions can be elsewhere — they're intentionally harder to hit.

### Type sizing on mobile

Density variant `t-field-mobile` bumps body and heading by 1px vs web. Use `body` (15→16px on mobile), `heading` (22→23px on mobile).

---

## 8. Locked copy — supervisor strings

**Source of truth (when populated):** `packages/copy/src/index.ts` + locale catalogs at `packages/copy/locales/{en,hi,te}.json`.

**Current state:** the package is scaffolded; locale catalogs are NOT yet populated. The strings below are extracted from design prototypes (`apps/admin-web/public/design-review/supervisor-mobile.jsx`) and are the locked reference until the catalogs ship.

### Greeting (Profile tab + Chat tab home)

| Key                   | English                                        |
| --------------------- | ---------------------------------------------- |
| `greeting.timestamp`  | `"TUESDAY · 9:41 AM"` (caption style, dynamic) |
| `greeting.salutation` | `"Namaste, {name}."`                           |
| `greeting.overview`   | `"3 sites · 14 workers active"`                |

### Section headers (caption style — ALL CAPS, +0.06em tracking)

| Key                | English                         |
| ------------------ | ------------------------------- |
| `pulse.header`     | `"FLOOR PULSE"`                 |
| `decisions.header` | `"PENDING DECISIONS · {count}"` |
| `quick.header`     | `"QUICK"`                       |

### Profile sections (this build)

| Key                             | English                                            |
| ------------------------------- | -------------------------------------------------- |
| `profile.section.personal`      | `"PROFILE"`                                        |
| `profile.section.voice`         | `"VOICE USAGE"`                                    |
| `profile.section.settings`      | `"SETTINGS"`                                       |
| `profile.field.name`            | `"Name"`                                           |
| `profile.field.phone`           | `"Phone"`                                          |
| `profile.field.locale`          | `"Language"`                                       |
| `profile.field.activeCompany`   | `"Company"`                                        |
| `profile.field.activeRole`      | `"Role"`                                           |
| `profile.field.memberSince`     | `"Joined"`                                         |
| `profile.voice.ratioToday`      | `"Voice today"`                                    |
| `profile.voice.ratio30d`        | `"Voice (30 days)"`                                |
| `profile.voice.minutes30d`      | `"Voice minutes (30 days)"`                        |
| `profile.voice.parseConfidence` | `"AI parse quality"`                               |
| `profile.voice.applyRate`       | `"Voice → Apply rate"`                             |
| `profile.action.signOut`        | `"Sign out"`                                       |
| `profile.action.switchCompany`  | `"Switch company"`                                 |
| `profile.action.notifications`  | `"Notification preferences"`                       |
| `profile.signOut.confirmTitle`  | `"Sign out?"`                                      |
| `profile.signOut.confirmBody`   | `"You'll need to enter your phone and OTP again."` |
| `profile.signOut.confirmAction` | `"Sign out"`                                       |
| `profile.signOut.cancel`        | `"Cancel"`                                         |

### Voice quality tiers (qualitative only — never numeric)

| Tier                | English          | Show when               |
| ------------------- | ---------------- | ----------------------- |
| `quality.excellent` | `"Excellent"`    | Apply rate ≥ 90%        |
| `quality.good`      | `"Good"`         | Apply rate 70-89%       |
| `quality.review`    | `"Under review"` | Apply rate 50-69%       |
| `quality.flagged`   | `"Flagged"`      | Apply rate < 50% (rare) |

### Tab bar labels

| Key            | English     |
| -------------- | ----------- |
| `tabs.chat`    | `"Chat"`    |
| `tabs.today`   | `"Today"`   |
| `tabs.summary` | `"Summary"` |
| `tabs.updates` | `"Updates"` |
| `tabs.profile` | `"Profile"` |

### Decision tier labels (chat decision cards)

| Key                     | English         |
| ----------------------- | --------------- |
| `tierLabel.note`        | `"Note"`        |
| `tierLabel.operational` | `"Operational"` |
| `tierLabel.personnel`   | `"Personnel"`   |
| `tierLabel.employment`  | `"Employment"`  |

### Voice / tone rules

- Local language forms: `"Namaste"` not `"Hello"`
- Money in Indian format: `"₹500"`, `"₹ 1,24,300"`
- Decision body text: terse — one sentence of context, one sentence of consequence
- Captions ALL-CAPS mono
- Termination requires typing `'TERMINATE'` to confirm — friction is intentional
- AI replies in same language as input
- AI is QUIET by default

---

## 9. Backend routes

### Currently implemented (Phase A — auth only)

| Method | Path                | Source                               | Purpose                                     | Auth       |
| ------ | ------------------- | ------------------------------------ | ------------------------------------------- | ---------- |
| POST   | `/auth/otp/request` | `apps/backend/src/routes/auth.ts:30` | Request OTP via MSG91 SMS                   | none       |
| POST   | `/auth/otp/verify`  | `apps/backend/src/routes/auth.ts:53` | Verify OTP, return JWT                      | none       |
| GET    | `/me`               | `apps/backend/src/routes/me.ts:17`   | Return current user + active company + role | Bearer JWT |
| GET    | `/health`           | `apps/backend/src/server.ts:49`      | Health check                                | none       |

### Phase B — supervisor routes (planned, NOT yet implemented)

The supervisor app needs these endpoints. They DO NOT EXIST YET. When Phase B builds them they MUST follow the `requireAuth` preHandler pattern + check `req.auth.role === 'SUPERVISOR'`.

| Method | Path                          | Purpose                           | Reads                             | Writes                                                 |
| ------ | ----------------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------------ |
| GET    | `/me/profile`                 | Profile tab Section A data        | User, Membership, Company         | —                                                      |
| PATCH  | `/me/profile`                 | Update name + locale              | —                                 | User                                                   |
| GET    | `/me/voice-stats`             | Profile tab Section B data        | SupervisorChatMessage (aggregate) | —                                                      |
| POST   | `/me/sign-out`                | Revoke refresh token              | —                                 | (tokens table)                                         |
| GET    | `/supervisor/today`           | Today's Plan tab                  | Visit, Worker, Site, Assignment   | —                                                      |
| GET    | `/supervisor/summary`         | Summary tab                       | Visit, Attendance                 | —                                                      |
| GET    | `/supervisor/updates`         | Updates tab                       | HRUpdate                          | —                                                      |
| POST   | `/supervisor/updates/:id/ack` | Acknowledge HR update             | HRUpdate, AuditEvent              | (with AI ack-intent extraction)                        |
| POST   | `/supervisor/chat/message`    | Chat capture (voice or text)      | SupervisorChat, living-doc        | SupervisorChatMessage, SupervisorDecision              |
| POST   | `/supervisor/chat/apply-all`  | Atomic Apply All                  | parsed decisions                  | various (per decision)                                 |
| POST   | `/visits/:id/resolve`         | Supervisor resolves flagged visit | Visit                             | Visit (state via VisitState SUPERVISOR_RESOLVED event) |
| POST   | `/leave-requests/:id/decide`  | Approve or reject leave           | LeaveRequest, Worker              | LeaveRequest                                           |
| GET    | `/workers`                    | Team roster                       | Worker, Membership                | —                                                      |

For Profile tab specifically: `GET /me/profile`, `PATCH /me/profile`, `GET /me/voice-stats`, `POST /me/sign-out` are the 4 endpoints needed.

---

## 10. DB tables — what supervisor reads/writes

**Source of truth:** `packages/shared-schema/prisma/schema.prisma`. All tables in `axhy` Postgres schema. All IDs are UUID v4.

### User (the supervisor's own identity)

```
id          String    UUID @id
phone       String    UNIQUE              /// @personal
name        String?                       /// @personal
locale      String    @default("en")      /// @personal
status      String    @default("ACTIVE")
companyId   String?
createdAt   DateTime
updatedAt   DateTime
```

**Profile tab: editable `name`, `locale`. Read-only everything else.**

### Membership (links user to companies + roles)

```
id          String    UUID @id
companyId   String    FK → Company.id
userId      String    FK → User.id
role        String    'WORKER' | 'SUPERVISOR' | 'OWNER' | 'HR' | 'SUPER_ADMIN'
status      String    @default("ACTIVE")
@@unique([companyId, userId, role])
```

**Profile tab: read-only.** Used for active role display + mode-switcher.

### Worker (the supervisor's team — NOT the supervisor themselves)

```
id              String    UUID @id
companyId       String    FK
userId          String?   FK to User (optional, unique)
name            String                         /// @personal
phone           String                         /// @personal
bankIfsc        String?                        /// @personal — HR-ONLY
bankAcct        String?                        /// @personal — HR-ONLY
state           String    @default("INVITED")  // → WorkerState
baseSalaryPaise Int       @default(0)
joinedAt        DateTime
@@unique([companyId, phone])
```

**Supervisor sees:** all fields EXCEPT `bankIfsc`, `bankAcct` (financial PII — HR-only).
**Supervisor writes:** `state` only (via WorkerState transitions).

### Visit (today's plan, summary, flagged review)

```
id                  String    UUID @id
companyId           String    FK
workerId            String    FK
siteId              String    FK
state               String    @default("SCHEDULED")  // → VisitState
scheduledFor        DateTime
startedAt           DateTime?
completedAt         DateTime?
photosBefore        Int       @default(0)
photosAfter         Int       @default(0)
voiceKey            String?   // R2 key
verificationText    String?
flagged             Boolean   @default(false)
```

**Supervisor reads:** all fields.
**Supervisor writes:** state via SUPERVISOR_RESOLVED, CANCEL, MARK_NO_SHOW events.
**Index used:** `[companyId, flagged]` for flagged-review queries.

### Site (location info)

```
id          String    UUID @id
companyId   String    FK
name        String
address     String?                          /// @personal
latitude    Decimal?
longitude   Decimal?
state       String    @default("DRAFT")
workdays    String    @default("MTWTFS")
```

**Supervisor reads:** all fields. Read-only from mobile.

### LeaveRequest (approval flow)

```
id              String    UUID @id
companyId       String    FK
workerId        String    FK
fromDate        Date
toDate          Date
reason          String
state           String    @default("REQUESTED")  // 12-state LeaveRequestState (planned)
decidedBy       String?   FK to User
decidedAt       DateTime?
decisionNote    String?                          /// @personal
```

**Supervisor reads:** all fields for their team.
**Supervisor writes:** `state` (APPROVED/REJECTED), `decidedBy`, `decidedAt`, `decisionNote`.

### Tables NOT yet in schema (planned for Phase B)

These are referenced in master plan / BOUNDARY.md but absent from `schema.prisma` today: `SupervisorChat`, `SupervisorChatMessage`, `SupervisorDecision`, `HRUpdate`, `SwapRequest`, `Attendance`, `Complaint`, `AssignmentConfig`, `Device`, `AuditEvent`. The Profile tab does NOT depend on any of these — it can be built against existing tables (User, Membership, Company).

### PII discipline

| Field                                     | Visibility                                        |
| ----------------------------------------- | ------------------------------------------------- |
| `User.phone`, `User.name`, `User.locale`  | Supervisor sees their own                         |
| `Worker.name`, `Worker.phone`             | Supervisor sees workers on their team             |
| `Worker.bankIfsc`, `Worker.bankAcct`      | HR ONLY — supervisor never sees these             |
| `Site.address`                            | Supervisor sees their company's sites             |
| `LeaveRequest.decisionNote`               | Only the deciding supervisor sees their own notes |
| `Company.ownerPhone`, `Company.ownerName` | Supervisor never sees these                       |

---

## 11. State machines

**Source:** `packages/state-machines/src/`. XState v5 via `setup(...).createMachine(...)`.

### VisitState (implemented in `visit.ts`)

12 states. Initial: `SCHEDULED`.

```
SCHEDULED → NOTIFIED → EN_ROUTE → ON_SITE → IN_PROGRESS
  → PHOTOS_PENDING → AWAITING_VERIFICATION → VERIFIED
                                            → FLAGGED
SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS → CANCELLED
NOTIFIED, EN_ROUTE → NO_SHOW
VERIFIED, CANCELLED, NO_SHOW → ARCHIVED (final)
```

**Supervisor-specific events:**

- `SUPERVISOR_RESOLVED { outcome: 'OK' | 'REJECT' }` — primary action on FLAGGED visits → VERIFIED or CANCELLED
- `CANCEL { by: 'supervisor', reason: string }` — from any pre-completion state → CANCELLED
- `MARK_NO_SHOW` — from NOTIFIED or EN_ROUTE → NO_SHOW

**Billable states:** VERIFIED, FLAGGED, CANCELLED, NO_SHOW.

### WorkerState (implemented in `worker.ts`)

15 states. Initial: `INVITED`.

```
INVITED → PENDING_ACTIVATION → DOC_PENDING → ACTIVE
ACTIVE → ON_LEAVE | ON_SUSPENSION | ABSENT | AT_RISK | BLOCKED | TRANSFER_PENDING
       → INACTIVE → TERMINATION_PENDING → TERMINATED → ARCHIVED → ANONYMIZED (final)
```

**Supervisor-triggered transitions from ACTIVE:**

- `LEAVE_APPROVED { days }` → ON_LEAVE
- `SUSPEND { reason, until? }` → ON_SUSPENSION
- `NO_SHOW` → ABSENT
- `FLAG_AT_RISK { reason }` → AT_RISK
- `BLOCK { reason }` → BLOCKED

**Supervisor recovery transitions:**

- ON_LEAVE + LEAVE_RETURNED → ACTIVE
- ON_SUSPENSION + SUSPENSION_LIFTED → ACTIVE
- ABSENT + CHECK_IN → ACTIVE
- AT_RISK + CLEAR_AT_RISK → ACTIVE
- BLOCKED + UNBLOCK → ACTIVE

**Supervisor cannot fire:** `TERMINATE` (HR/Owner only).

### SupervisorDayState (planned, NOT yet implemented)

```
NOT_LOADED → LOADED_AT_330AM → WORKING → WRAPPED_UP
```

When built, lives at `packages/state-machines/src/supervisor-day.ts`. Used by Chat tab to indicate context-loaded state.

### Other planned machines

`SiteState` (14 states), `LeaveRequestState` (12 states), `Device` machine, `AssignmentConfig` machine — all referenced in schema comments but not yet implemented.

### Supervisor profile tab and state machines

Profile tab does NOT directly transition any state machine. It's a read + minor edit screen on User + Membership data. State machines are relevant to other tabs.

---

## 12. Auth flow + JWT shape

**Source:** ADR-0007 + `apps/backend/src/lib/jwt.ts` + `apps/admin-web/app/login/page.tsx`.

### Flow

1. Client → `POST /auth/otp/request { phone: "+919999..." }` → backend stores hashed OTP (5-min TTL), MSG91 sends SMS.
2. Client → `POST /auth/otp/verify { phone, code }` → backend issues `jose` JWTs.
3. Returns:

```json
{
  "ok": true,
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "memberships": [{ "companyId": "uuid", "companyName": "...", "role": "SUPERVISOR" }]
}
```

4. If `memberships.length > 1`, app shows company picker before proceeding.

### Token TTLs

- Access token: **900 seconds (15 minutes)**
- Refresh token: **2,592,000 seconds (30 days)**
- Algorithm: **HS256** via `jose` library
- Secret: `JWT_SECRET` env, min 32 chars

### Access token payload

```ts
{
  sub: string,           // User.id (UUID)
  companyId: string,     // active Company.id
  role: 'WORKER' | 'SUPERVISOR' | 'OWNER' | 'HR' | 'SUPER_ADMIN',
  availableRoles: Role[], // all roles across all memberships (for mode-switcher)
  locale: string,        // 'en' | 'hi' | 'te' (min 2, max 8)
  iat: number,
  exp: number,
  kind: 'access'         // distinguishes from refresh
}
```

### Refresh token payload

```ts
{
  sub: string,
  iat: number,
  exp: number,
  kind: 'refresh'
}
```

(No companyId, no role — refresh just proves identity.)

### Token storage

- **Mobile (RN/Expo):** `expo-secure-store` (native keychain-backed). In-memory mirror via `zustand` store. Token persisted across app restarts.
- **Web (admin-web):** strategy still in panel debate — not yet picked.

### Authorization header pattern

Every authenticated request:

```
Authorization: Bearer <accessToken>
```

Backend's `requireAuth` middleware reads it, verifies with `jose.jwtVerify`, sets `req.auth = { userId, companyId, role, ... }`. Then `withTenantContext` sets Postgres GUC `axhy.current_company_id` for RLS.

---

## 13. API client + fetch pattern

### `@axhy/api-client` (planned, currently a stub)

Per ADR-0011, all HTTP clients are auto-generated from backend OpenAPI spec. The generation pipeline is NOT yet built. Mobile already declares `@axhy/api-client` and `@tanstack/react-query` as deps.

When using it (after Phase B wiring):

```ts
import { apiClient } from '@axhy/api-client';
import { useQuery, useMutation } from '@tanstack/react-query';

// Read
const { data, error, isLoading } = useQuery({
  queryKey: ['me', 'profile'],
  queryFn: () => apiClient.me.getProfile(),
});

// Write
const mutation = useMutation({
  mutationFn: (input: { name?: string; locale?: string }) => apiClient.me.updateProfile(input),
});
```

### Raw fetch pattern (use until apiClient exists)

From `apps/admin-web/app/login/page.tsx`:

```ts
const API_URL = process.env.NEXT_PUBLIC_AXHY_API_URL!;

const res = await fetch(`${API_URL}/me/profile`, {
  method: 'GET',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${accessToken}`,
  },
});

if (res.status === 401) {
  // refresh token + retry
}
if (!res.ok) {
  // handle error per status code
}
const data = await res.json();
```

Error codes the supervisor app must handle:

- 400 `BAD_INPUT` — invalid request body
- 401 `OTP_INVALID` / token expired → refresh + retry once → otherwise sign out
- 403 `NO_MEMBERSHIPS` → show "No active company" empty state
- 429 `OTP_RATE_LIMITED` → backoff, show "try again in N seconds"
- 500 `OTP_FAILED` / generic → show "Something went wrong, retry" toast

### Mobile: keep token attachment uniform

Wrap the fetch (or the apiClient) so every authenticated call adds the Authorization header from a single source. Don't sprinkle `Bearer ${token}` across screens.

---

## 14. Existing patterns to mimic

These are real patterns from the codebase that a new supervisor screen should copy.

### 14.1 Form input pattern

Source: `apps/admin-web/app/login/page.tsx` lines 175-198.

- `noValidate` on form
- Controlled input
- Inline error beneath field with `role="alert"`
- Submit button `disabled` while async in flight
- Copy changes during loading: `"Send OTP"` → `"Sending…"`

```tsx
<form onSubmit={handleSubmit} noValidate>
  <div className="login-field">
    <label htmlFor="name">Name</label>
    <input
      id="name"
      type="text"
      value={name}
      onChange={(e) => handleNameInput(e.target.value)}
      placeholder="Your name"
      className={nameError ? 'login-input login-input-error' : 'login-input'}
    />
    {nameError && (
      <p className="login-field-error" role="alert">
        <ErrorIcon /> {nameError}
      </p>
    )}
  </div>
  <button type="submit" className="btn btn-primary login-submit" disabled={saving}>
    {saving ? 'Saving…' : 'Save'}
  </button>
</form>
```

### 14.2 Loading / error / data state pattern

Source: `apps/admin-web/app/system/map/page.tsx` lines 61-84.

Three-state pattern. Render page chrome (header) in all states to avoid layout shift.

```tsx
if (loading)
  return (
    <Shell>
      <Header data={null} />
      <LoadingState />
    </Shell>
  );
if (error || !data)
  return (
    <Shell>
      <Header data={null} />
      <ErrorState error={error} />
    </Shell>
  );
return (
  <Shell>
    <Header data={data} />
    <Body data={data} />
  </Shell>
);
```

### 14.3 Collapsible card section

Source: `apps/admin-web/app/system/map/_components/Section.tsx`.

Reusable. Title bar + count badge + arrow + collapsible body. Two variants (normal + warn-styled for employment-tier).

```tsx
<Section title="Profile" count={5} icon="👤" defaultOpen>
  {/* ... rows ... */}
</Section>
```

### 14.4 Sticky header

Source: `apps/admin-web/app/system/map/page.tsx`.

Header is a separate component above the body grid. Sticky via CSS. Receives data so it can render breadcrumbs + counts.

### 14.5 Empty state

Source: `apps/admin-web/app/system/map/page.tsx` lines 162-176.

Three-line empty state:

1. Directional arrow / icon (32px)
2. Title
3. Hint with counts or instructions

For Profile tab: when voice stats have no data ("you haven't used voice yet"), show this pattern with copy "Try the chat tab — say something to get started."

### 14.6 Button styles

In-app primary action (decision card "Confirm"):

```tsx
{
  flex: 1,
  padding: '10px 0',
  borderRadius: 'var(--r-2)',  // 10px
  background: 'var(--accent)',  // #C0492A
  color: '#fdfaf3',
  border: 'none',
  fontSize: 14,
  fontWeight: 600,
}
```

In-app secondary/ghost ("Not now"):

```tsx
{
  flex: 1,
  padding: '10px 0',
  borderRadius: 'var(--r-2)',
  background: 'transparent',
  color: 'var(--ink-2)',
  border: '1px solid var(--card-edge)',
  fontSize: 14,
  fontWeight: 500,
}
```

### 14.7 Input styles

Login input (full):

```css
.login-input {
  width: 100%;
  background: var(--paper-2); /* #EFE7D8 */
  border: 1px solid var(--ink-4); /* #A89880 */
  border-radius: 10px;
  color: var(--ink); /* #1A1612 */
  font-weight: 700;
  font-size: 17px;
  padding: 16px 18px;
  height: 56px;
  outline: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.login-input:focus {
  border-color: var(--accent); /* #C0492A */
  background: var(--card); /* #FDFAF3 */
  box-shadow: 0 0 0 4px var(--accent-soft);
}
.login-input::placeholder {
  color: var(--ink-3);
  font-weight: 700;
}
```

OTP variant: `font-family: var(--font-mono); letter-spacing: 0.4em; text-align: center;`.

---

## 15. Anti-patterns — what NOT to do

These are HARD-REJECTED. Do not propose these even with justification.

### Content / copy

- ❌ SaaS jargon: "synergy", "leverage", "actionable insights", "streamline", "empower"
- ❌ Fake or stock customer testimonials — only real signed customers
- ❌ AI using sales language. AI is a tool, not a cheerleader.
- ❌ Showing numeric AI accuracy ("94.2% accurate") — qualitative tiers only

### AI behavior

- ❌ AI recommending a person: "I recommend Arjun for this slot" — banned. System shows 2-3 plain options; supervisor picks.
- ❌ AI being proactively chatty. Quiet by default.
- ❌ AI auto-applying changes. Every parsed decision needs explicit Apply All confirmation.
- ❌ AI calls inside state-machine cascades (panel-locked: AI only at user-input boundary).

### UX

- ❌ HSL theme slider — killed. Single fixed theme: terracotta+paper.
- ❌ QR code scanning for site verification — killed. GPS check only.
- ❌ Per-task pricing display for workers — killed. Workers are salary-only.
- ❌ Tap targets under 48pt.
- ❌ Body weight under 400 (no light/300 weight — renders thin on Ravi's phone).
- ❌ Pure black `#000000` — use `--ink` (`#1A1612`) instead.
- ❌ Pure white `#FFFFFF` — use `--card` (`#FDFAF3`) or `--paper` (`#F6F1E8`).
- ❌ Inline hex values anywhere — always tokens.

### Engineering

- ❌ Hardcoded API URLs, phone numbers, role strings, company names, secrets.
- ❌ `any` TypeScript types.
- ❌ `// TODO` or `// FIXME` in committed code.
- ❌ Skipped tests.
- ❌ Empty catch blocks.
- ❌ Mocks in integration tests — use real DB on `axhy-sandbox` Railway tenant.
- ❌ Raw AI model strings at call sites — use `modelFor(surface)` from `@axhy/ai-tools`.
- ❌ Shadcn/ui in mobile. Use `@axhy/ui-native` (RN Reusables wrapper).
- ❌ Supervisor screen importing from worker layout (`apps/mobile/app/(worker)/*`) — ESLint rule blocks this.

### Workflow / process

- ❌ Bypassing the panel debate before adding new files.
- ❌ Pushing without panel-approved design.
- ❌ Adding new MD files without checking existing ones first.
- ❌ Deferring a feature without explicit founder approval.

---

## 16. File path conventions

### Where new supervisor profile screen code lives

**Active:** `apps/mobile/app/(supervisor)/profile/index.tsx`

Per ADR-0021 (single mobile app, role-based UI), the mobile app uses Expo Router's group folders:

```
apps/mobile/app/
├── _layout.tsx                  # role-based router (reads JWT, picks layout)
├── (worker)/                    # worker app
│   ├── _layout.tsx
│   ├── home.tsx
│   ├── visit/[id].tsx
│   └── ...
├── (supervisor)/                # supervisor app — NEW supervisor work goes here
│   ├── _layout.tsx              # supervisor tab bar
│   ├── chat.tsx                 # tab 1
│   ├── today.tsx                # tab 2
│   ├── summary.tsx              # tab 3
│   ├── updates.tsx              # tab 4
│   └── profile/
│       ├── index.tsx            # tab 5 — THIS IS THE BUILD TARGET
│       └── _components/         # local components (per Next.js convention)
│           ├── PersonalSection.tsx
│           ├── VoiceStatsSection.tsx
│           └── SettingsSection.tsx
└── (owner)/                     # owner app
    └── ...
```

### Where supporting code goes

| Code                                   | Location                                               |
| -------------------------------------- | ------------------------------------------------------ |
| Reusable cross-app primitives          | `packages/ui-native/src/` (RN Reusables wrappers)      |
| API call wrappers                      | `packages/api-client/src/` (when generated)            |
| Shared types                           | `packages/shared-schema/src/`                          |
| Brand tokens                           | `packages/ui-tokens/src/` (do not edit; consume only)  |
| Locked copy                            | `packages/copy/src/` (locale catalogs to be populated) |
| Business rule constants (pricing etc.) | `packages/business-rules/src/`                         |

### Where NOT to put supervisor code

- ❌ `apps/mobile/app/(worker)/` — ESLint rule blocks supervisor importing from worker
- ❌ `apps/admin-web/` — that's the web admin, not mobile
- ❌ `apps/supervisor-preview/` — was a throwaway prototype, now deleted
- ❌ `packages/ui-tokens/` — tokens are read-only, do not edit

---

## 17. Operating invariants for AI tools

**Before generating any supervisor screen output, verify you have:**

1. ☐ Read §6 — used ONLY tokens from the canonical list (no hex, no Tailwind named colors)
2. ☐ Read §7 — applied tap target ≥48pt, primary CTA in lower-right zone, body weight ≥400
3. ☐ Read §8 — used copy keys from the locked list, no SaaS jargon, qualitative not numeric AI quality
4. ☐ Read §10 — used field names exactly as in `schema.prisma`, marked PII fields appropriately, blocked HR-only fields from supervisor view
5. ☐ Read §15 — checked output against every anti-pattern; produced output violates none
6. ☐ Read §16 — placed new code at `apps/mobile/app/(supervisor)/profile/`

**If any of the above is uncertain, ask a clarifying question instead of guessing.** Ambiguity is the failure mode that caused 4 v2 redesign cycles.

---

## 18. Source files referenced (verified paths)

### Code

- `apps/backend/src/routes/auth.ts` — OTP login
- `apps/backend/src/routes/me.ts` — /me endpoint
- `apps/backend/src/middleware/tenant-context.ts` — JWT + RLS pattern
- `apps/admin-web/app/login/page.tsx` — login form pattern, raw fetch pattern
- `apps/admin-web/app/globals.css` — CSS tokens + button styles + login-input styles
- `apps/admin-web/app/system/map/page.tsx` — loading/error/empty states, sticky header
- `apps/admin-web/app/system/map/_components/Section.tsx` — collapsible card pattern
- `apps/admin-web/app/_components/WhatsAppButton.tsx` — primary button example
- `apps/admin-web/public/design-review/supervisor-mobile.jsx` — design prototype reference (not production code)
- `apps/admin-web/public/design-review/token-sheet.jsx` — token reference artboard
- `packages/ui-tokens/src/index.ts` — canonical token definitions
- `packages/ui-tokens/src/generated/tokens.css` — CSS variables
- `packages/ui-tokens/src/generated/native.ts` — flat object for RN
- `packages/copy/src/index.ts` — locale enum
- `packages/copy/BOUNDARY.md` — copy package contract
- `packages/state-machines/src/visit.ts` — VisitState
- `packages/state-machines/src/worker.ts` — WorkerState
- `packages/shared-schema/prisma/schema.prisma` — DB schema source of truth

### Decisions (ADRs)

- `docs/decisions/0007-phone-otp-jose-jwt.md`
- `docs/decisions/0010-ai-thin-boundary.md`
- `docs/decisions/0011-auto-generated-clients.md`
- `docs/decisions/0013-cloudflare-r2.md`
- `docs/decisions/0014-token-driven-design.md`
- `docs/decisions/0015-shadcn-ui-over-mui.md`
- `docs/decisions/0016-rn-reusables-mobile.md`
- `docs/decisions/0021-single-mobile-app.md`
- `docs/decisions/0023-ai-model-policy.md`

---

_This doc is sanitized — contains no DB credentials, no JWT secrets, no Railway URLs. Safe to share with external AI tools._

_Last updated: 2026-05-08. If a section appears stale (file paths broken, hex values don't match `packages/ui-tokens/`), regenerate from the connectedness map at `/system/map` or rerun the source-file scripts in `scripts/`._
