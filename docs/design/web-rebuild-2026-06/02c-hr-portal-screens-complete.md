# HR Portal — Complete Screen Specification (verified against source)

**Date:** 2026-06-13 · **Status:** Authoritative · **Property:** `app.axhy.app/hr` · **Review draft — NOT committed**
**Method:** 24 agents wrote then adversarially re-verified every screen against the real Prisma schema, route handlers, services, and state machines. 59 defects were caught and corrected before this assembly. Every field traces to an exact `Model.field`; every action to a verified endpoint (EXISTS) or a flagged unbuilt one (NEW); every state to a real machine.

**Brand (founder-locked):** warm terracotta + paper(cream). One accent terracotta `#9A3412`; cream bg `#FFFBEB`; ink `#0F172A`; verified-green `#059669` for positive only; flagged-amber `#D97706` for attention only. Inter + Noto Sans Devanagari/Telugu + mono. Lucide icons, no emoji. Desktop-first (1440 primary), holds at 375. WCAG AA.

**The one fact:** the backend is supervisor-first. **Leave is the only fully-backed HR area today.** Every other screen mixes EXISTS reads/writes with NEW endpoints that must be built — each tagged inline. A screen with no backing endpoint renders its coming-soon/empty state until built.

---

## Contents

1. Login, OTP, session, app shell & navigation _(confidence: high; 11 defects corrected)_
2. Home / HR dashboard _(confidence: high; 4 defects corrected)_
3. Workers list + worker detail (6 tabs) + add worker _(confidence: high; 14 defects corrected)_
4. Sites list + site detail (roster, supervisor bindings, QR) + add site + assignments _(confidence: high; 4 defects corrected)_
5. Leave queue + detail + approve/reject (FULLY BACKED) — HR portal screen spec _(confidence: high; 1 defects corrected)_
6. Swaps queue (HR read = NEW) + decide _(confidence: high; 1 defects corrected)_
7. Complaints list + thread + reply + resolve/dismiss _(confidence: high; 3 defects corrected)_
8. Late-reversal review queue (HR side = entirely NEW) _(confidence: high; 8 defects corrected)_
9. Company policies (set EXISTS; read+history = NEW) _(confidence: medium; 2 defects corrected)_
10. Company updates author + ack report (HR authoring = NEW) _(confidence: high; 3 defects corrected)_
11. Team / memberships list + invite + (detail/edit/revoke = NEW) _(confidence: high; 4 defects corrected)_
12. Audit Record (read surface = NEW) + flagged-visit reference _(confidence: medium; 4 defects corrected)_

---

## Login, OTP, session, app shell & navigation

> **Scope.** The browser entry to the AXHY HR portal at `app.axhy.app/hr`: phone login, OTP verification, the post-login app shell (sidebar + topbar + queue badges), session-expiry handling, sign-out, and the notification-preferences panel. Supervisor and worker stay on mobile (locked) — none of these screens render for them. Desktop-first (1440 primary); every screen must also hold at 375px. WCAG AA.
>
> **Brand contract applied throughout.** Background cream `#FFFBEB`; ink text `#0F172A`; the single accent terracotta `#9A3412` (hover `#C2410C`) for primary buttons, active nav, focus rings, links. `verified-green #059669` ONLY for positive/verified states. `flagged-amber #D97706` ONLY for flagged/attention (including queue badges that demand action). Inter for UI, Noto Sans Devanagari/Telugu for hi/te locales, mono for data labels (counts, phone, IDs, timestamps). Lucide icons only, no emoji.
>
> **Global API facts.** Base `/v1`. Auth context `req.auth = {userId, companyId, role, membershipId, epoch}` is server-derived from the JWT — **the client never sends `companyId`**. Gate order: `requireAuth` → `requireRole('HR'|'OWNER'|'SUPERVISOR'…)`. `401 {error:'AUTH_REQUIRED'}` = no/expired session; `403 {error:'FORBIDDEN_WRONG_ROLE'}` = wrong role. Success bodies are the object directly; errors are `{error:'CODE', message?}` + HTTP status. Timestamps ISO, dates `YYYY-MM-DD`, money paise-int; **display** en-IN (`13 Jun 2026, 2:15 pm`; `50000 paise → Rs 500`).
>
> **EXISTS vs NEW (this area).**
>
> - **EXISTS:** `POST /auth/otp/request`, `POST /auth/otp/verify`, `GET /me`, `PATCH /me/notification-prefs`, `POST /auth/sign-out`.
> - **NEW (must be built; render coming-soon/empty until live):** every sidebar destination route (`GET /hr/workers`, `GET /hr/sites`, `GET /hr/leave`, `GET /hr/swaps`, `GET /hr/complaints`, `GET /hr/reversals`, `GET /hr/policies`, `GET /hr/updates`, `GET /hr/team`, `GET /hr/record`), **`GET /hr/overview`** for sidebar queue-badge counts, **locale-change endpoint** (PATCH endpoint; `user.locale` field EXISTS but no write endpoint today), and every sidebar destination route beyond the shell (Workers, Sites, Leave, Swaps, Complaints, Reversals, Policies, Updates, Team, Record are separate spec areas).

---

### 0. Cross-screen foundations

#### 0.1 Session model (browser portal — NEW httpOnly session NOT YET IMPLEMENTED; uses JWT in JSON body like mobile)

| Fact          | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport     | On `POST /auth/otp/verify`, the backend returns **`{ok:true, accessToken, refreshToken, memberships[]}`** in the JSON response body (VerifyOTPOutput schema). **httpOnly cookie session is NOT YET IMPLEMENTED** — both mobile and browser receive the same JWT pair. Portal design must treat the session as holding these tokens in-memory (do NOT render or persist raw tokens in localStorage per security best-practice); refresh logic is the app's responsibility until a server-side cookie session is built (NEW, tracked for Wave 2+). For now, the SPA receives accessToken + refreshToken in JSON and must manage them securely (in-memory, cleared on sign-out, never logged). |
| Identity load | After OTP verify succeeds, the SPA calls `GET /me` (EXISTS) with the received JWT to hydrate user, active company, role, available roles, memberships, notification prefs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Role admitted | Portal admits sessions whose `activeRole` is `HR` (and `OWNER` where a route allows `'OWNER','HR'`). A session with only `WORKER`/`SUPERVISOR` available roles is shown the "wrong surface" interstitial (§7) — they belong on mobile.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Expiry signal | Any `/v1` call returning `401 {error:'AUTH_REQUIRED'}` triggers the session-expired interstitial (§7). The SPA refreshes via `POST /auth/refresh` (using the refresh token) or falls back to re-login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Sign-out      | `POST /auth/sign-out` (EXISTS) accepts the refresh token, revokes it server-side, and the SPA then clears local state and returns to Login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

#### 0.2 HR site-anchoring (governs every list in the portal)

| Fact              | Detail                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rule              | HR sees only workers with an `Assignment(state ∈ ACTIVE\|DRAFT)` to a `Site` where `Site.ownerHrUserId = me`. `getHrSiteIds(prisma, userId, companyId)` resolves those sites (exists in backend middleware).                                       |
| No sites          | An HR who owns **zero** sites sees **empty lists by design** — not an error. The shell still renders; every list shows the "no sites assigned" empty state (§6.2-B). This is founder-locked (2026-06-08, one HR per worker, site-based; NOT pods). |
| Badge consequence | `GET /hr/overview` (NEW — not yet built) counts are likewise scoped to the caller's owned sites; a no-site HR would see all badges at `0` once the endpoint ships. **Until built, all badge slots must remain hidden/zero.**                       |

#### 0.3 Standard state chips (plain-words labels, used portal-wide)

| Machine state             | Chip label      | Color token                   | Where it appears             |
| ------------------------- | --------------- | ----------------------------- | ---------------------------- |
| ACTIVE                    | Active          | verified-green `#059669`      | memberships, assignments     |
| DRAFT                     | Draft           | ink on cream, hairline border | assignments not yet active   |
| Flagged / needs-attention | Needs attention | flagged-amber `#D97706`       | queue badges, attention rows |
| Terminal/closed (generic) | Closed          | neutral grey `#64748B`        | resolved/terminal items      |

> Chips elsewhere (leave/swap/complaint machines) are specified in their own areas; this area only owns ACTIVE/DRAFT/attention.

#### 0.4 Money & date formatting (display rules)

| Raw                             | Display                                                                |
| ------------------------------- | ---------------------------------------------------------------------- |
| `baseSalaryPaise = 50000`       | `Rs 500` (paise ÷ 100, en-IN grouping, no decimals when whole)         |
| ISO `2026-06-13T14:15:00+05:30` | `13 Jun 2026, 2:15 pm`                                                 |
| `YYYY-MM-DD` date               | `13 Jun 2026`                                                          |
| phone (E.164)                   | shown verbatim in mono, e.g. `+91 98765 43210` grouped for readability |

---

### 1. Login (phone)

**Purpose & placement.** Unauthenticated root of the portal. Reached at `app.axhy.app/hr/login` or by redirect from any guarded route when no session exists. Single job: capture an E.164 phone and request an OTP.

**Layout — desktop 1440.** Centered single-column card (max-width 420px) on full cream `#FFFBEB` field. Left/empty space is intentional whitespace, not a marketing panel (enterprise admin, not consumer). Card: AXHY wordmark (terracotta), H1 "Sign in to AXHY HR", subline "Enter the phone number registered with your company.", phone field, primary button "Send code", a thin legal/footer line (support contact). No password field anywhere — phone+OTP only.

**Layout — 375px.** Same card, full-bleed with 16px gutters; wordmark and H1 stack; button full-width and thumb-reachable.

**Fields.**

| Display label | Source                                          | Type / values                   | Notes                                                                                                                      |
| ------------- | ----------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Phone number  | client input → `POST /auth/otp/request {phone}` | E.164 string, `@db.VarChar(16)` | Country defaults to +91 (India). Mono font. Client-side: strip spaces, require leading `+`. No `companyId` ever collected. |

**Actions.**

| Action    | Method+path                       | Request fields | State machine  | DB writes + AuditEvent                                                                 | Idempotency / double-submit                                                                                                   | Result UI                                                                                                       |
| --------- | --------------------------------- | -------------- | -------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Send code | `POST /auth/otp/request` (EXISTS) | `{phone}`      | n/a (issuance) | None in product tables; OTP lives in Redis (hashed, salted, 5-min TTL). No AuditEvent. | **DISABLE button during request**; OTP per-phone cap is enforced server-side (Redis). No idempotency key — single click only. | On `{ok:true, resendInSeconds}` → advance to OTP screen (§2), seed the 60s resend timer from `resendInSeconds`. |

**States.**

| State         | Trigger                          | UI                                                                                                                                                                              |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle          | default                          | Button enabled when phone passes E.164 shape.                                                                                                                                   |
| Submitting    | click                            | Button → spinner + "Sending…", disabled; field locked.                                                                                                                          |
| Invalid input | `400 {error:'BAD_INPUT'}`        | Inline field error: "Enter a valid phone number with country code." Re-enable.                                                                                                  |
| Rate limited  | `429 {error:'OTP_RATE_LIMITED'}` | Inline notice in flagged-amber: "Too many codes requested. Try again in a few minutes." (prod cap: 3 OTPs / 15 min per phone). Button disabled until a client cooldown elapses. |
| Server error  | `500 {error:'OTP_FAILED'}`       | Toast: "Couldn't send the code. Try again." + retry.                                                                                                                            |

> **No "not registered" leak here.** Whether the phone maps to a user is only revealed at verify (`403 NO_MEMBERSHIPS`), never at request — keep messaging neutral.

**Design notes.** The ONE accent is the "Send code" button (terracotta, white text) and the focus ring on the phone field. No green/amber except the amber rate-limit notice. Card on cream, ink text, mono phone input. Generous vertical rhythm; this is the calmest screen in the product.

---

### 2. OTP entry

**Purpose & placement.** Immediately follows a successful `otp/request`. Verifies the 6-digit code and establishes the session.

**Layout — desktop 1440.** Same centered 420px card. H1 "Enter the 6-digit code", subline "We sent a code to **+91 98765 43210**" (the phone, mono, with a "Change number" text-link back to §1). A **6-cell segmented code input** (one digit per cell, auto-advance, paste-fills all six). Primary button "Verify & continue". Below: a resend row — "Didn't get it? **Resend code**" with a live countdown ("Resend in 0:47") driven by `resendInSeconds`.

**Layout — 375px.** Code cells shrink to fit one row at 375px (6 × ~44px). Numeric keyboard (`inputmode="numeric"`). Resend row stacks under the button.

**Fields.**

| Display label | Source                                              | Type / values     | Notes                                                    |
| ------------- | --------------------------------------------------- | ----------------- | -------------------------------------------------------- |
| Code          | client input → `POST /auth/otp/verify {phone,code}` | 6-digit string    | Mono, one digit per cell. Server: 5-min TTL, single-use. |
| Phone (echo)  | carried from §1                                     | E.164             | Read-only display; "Change number" returns to §1.        |
| Resend timer  | `RequestOTPOutput.resendInSeconds` (EXISTS)         | int seconds (=60) | Counts down; "Resend code" disabled until it hits 0.     |

**Actions.**

| Action            | Method+path                       | Request fields  | State machine                                                                                                                                                                                                                                                                                   | DB writes + AuditEvent                                                                                                                                                                                                         | Idempotency / double-submit                                                                                                                           | Result UI                                                                       |
| ----------------- | --------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Verify & continue | `POST /auth/otp/verify` (EXISTS)  | `{phone, code}` | Worker-only side effect server-side: if active role is WORKER, the backend fires the `OTP_VERIFIED` event on the Worker state machine, transitioning `PENDING_ACTIVATION → DOC_PENDING` (worker.ts line 99). This is **not** applied to HR/OWNER/SUPERVISOR sessions — they have no Worker row. | On success the server appends **`AuditEvent kind:'AUTH_LOGIN'`** (actor=userId, scoped to active company, `payload.via:'otp'`). Browser receives `{ok:true, accessToken, refreshToken, memberships[]}` in JSON (not a cookie). | **DISABLE button during request.** No idempotency key on auth — the UI must not double-submit; a second click is suppressed until the first resolves. | On success, store JWTs securely (in-memory), call `GET /me`, land on Home (§3). |
| Resend code       | `POST /auth/otp/request` (EXISTS) | `{phone}`       | n/a                                                                                                                                                                                                                                                                                             | None                                                                                                                                                                                                                           | Disabled until countdown = 0; disabled again during its own request.                                                                                  | Re-arms 60s timer; clears entered cells; toast "New code sent."                 |
| Change number     | client nav                        | —               | —                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                              | —                                                                                                                                                     | Returns to §1 with phone prefilled.                                             |

**States.**

| State                                  | Trigger                                              | UI                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle                                   | code incomplete                                      | Verify disabled until 6 digits entered.                                                                                                                                                                                                                                                     |
| Submitting                             | click                                                | Button spinner "Verifying…", cells locked.                                                                                                                                                                                                                                                  |
| Wrong/expired code                     | `401 {error:'OTP_INVALID'}`                          | Cells flash error border (ink, not red-brand — use a neutral error treatment), message "That code is wrong or expired. Check and try again." After **5 wrong attempts / 15 min** the stored OTP is invalidated server-side → prompt "Too many tries. Request a new code." and force resend. |
| Bad input                              | `400 {error:'BAD_INPUT'}`                            | Inline "Enter all six digits."                                                                                                                                                                                                                                                              |
| Not a member                           | `403 {error:'NO_MEMBERSHIPS'}`                       | Full-card message: "This phone isn't a member of any company. Ask Axhy support to invite you." No retry loop; offer "Use a different number."                                                                                                                                               |
| Wrong surface (worker/supervisor only) | verify ok but `availableRoles` excludes `HR`/`OWNER` | Route to §7 "wrong surface" interstitial — they sign in on mobile, not here.                                                                                                                                                                                                                |

**Design notes.** Accent on the active code cell's focus ring and the "Verify" button. The "Resend code" link is terracotta when armed, muted grey when counting down. No green until the user is actually in the shell. Keep the error treatment calm and non-alarming (ink/grey), reserving brand-amber/green for in-app state.

---

### 3. HR app shell (sidebar + topbar)

**Purpose & placement.** The persistent frame wrapping every authenticated HR screen. Owns navigation, queue-badge counts, breadcrumb, global search, company identity, and the user menu. Rendered once after a healthy `GET /me`.

**Layout — desktop 1440 (three regions).**

- **Left sidebar (fixed ~256px):** AXHY HR wordmark top; vertical nav list (icons + labels) with queue badges; collapsible to a 64px icon-rail.
- **Topbar (sticky, full width minus sidebar):** breadcrumb (left) · global search (center, ~480px) · company chip + user menu (right).
- **Content well:** cream background, the active screen renders here.

**Layout — 375px.** Sidebar collapses behind a hamburger (Lucide `menu`) in the topbar; opens as a left drawer over a scrim. Breadcrumb truncates to current page only. Global search collapses to a search icon that expands full-width on tap. Company chip moves inside the user menu.

#### 3.1 Sidebar nav items

Order and labels exactly as specified. Each row: Lucide icon + label + optional queue badge. Active item: terracotta left-border (3px) + terracotta label + subtle cream-tint fill. Badges are **flagged-amber** when count > 0 (these demand action), neutral/hidden at 0.

| #   | Label      | Icon (Lucide)            | Destination      | EXISTS/NEW                      | Badge source (NEW `GET /hr/overview` — not yet built) | Badge meaning                      |
| --- | ---------- | ------------------------ | ---------------- | ------------------------------- | ----------------------------------------------------- | ---------------------------------- |
| 1   | Home       | `home`                   | `/hr` (overview) | shell EXISTS; overview data NEW | —                                                     | no badge                           |
| 2   | Workers    | `users`                  | `/hr/workers`    | NEW                             | —                                                     | no badge (roster, not a queue)     |
| 3   | Sites      | `building-2`             | `/hr/sites`      | NEW                             | —                                                     | no badge                           |
| 4   | Leave      | `calendar-off`           | `/hr/leave`      | NEW                             | `overview.leave.pending` (NEW)                        | pending leave requests awaiting HR |
| 5   | Swaps      | `arrow-left-right`       | `/hr/swaps`      | NEW                             | `overview.swaps.pending` (NEW)                        | swap requests awaiting decision    |
| 6   | Complaints | `message-square-warning` | `/hr/complaints` | NEW                             | `overview.complaints.open` (NEW)                      | open complaint threads             |
| 7   | Reversals  | `undo-2`                 | `/hr/reversals`  | NEW                             | `overview.reversals.pending` (NEW)                    | activity reversals awaiting review |
| 8   | Policies   | `scroll-text`            | `/hr/policies`   | NEW                             | —                                                     | no badge                           |
| 9   | Updates    | `megaphone`              | `/hr/updates`    | NEW                             | —                                                     | no badge                           |
| 10  | Team       | `user-cog`               | `/hr/team`       | NEW                             | —                                                     | no badge                           |
| 11  | Record     | `archive`                | `/hr/record`     | NEW                             | —                                                     | no badge (audit/history view)      |

> **Badge field names are placeholders pending `GET /hr/overview` build.** The designer must treat all badge counts as **NEW**; until the endpoint ships, badges render hidden/zero and the destination screens show their coming-soon state. Do not imply these counts are live.

**`GET /hr/overview` (NEW — not yet implemented; when built, response shape):**

| Display          | Source                             | Type | Notes                               |
| ---------------- | ---------------------------------- | ---- | ----------------------------------- |
| Leave badge      | `overview.leave.pending` (NEW)     | int  | site-scoped to caller's owned sites |
| Swaps badge      | `overview.swaps.pending` (NEW)     | int  | site-scoped                         |
| Complaints badge | `overview.complaints.open` (NEW)   | int  | site-scoped                         |
| Reversals badge  | `overview.reversals.pending` (NEW) | int  | site-scoped                         |

Badge display rule: show number up to `99`, then `99+`. Mono font. Amber pill. Zero → no pill. **Until this endpoint exists, render all badges as 0 / hidden.**

#### 3.2 Topbar fields & controls

| Display label     | Source                                         | Type / values                           | Notes                                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breadcrumb        | DERIVED from route                             | text path, e.g. `Home / Workers / Asha` | Current segment ink-bold; ancestors are terracotta links.                                                                                                                                                                                                                          |
| Global search     | NEW                                            | text input                              | Searches workers/sites/etc. across the caller's owned scope. **NEW** — until built, the field is present but shows "Search coming soon" on focus, or is hidden by feature flag. Do not imply it queries live.                                                                      |
| Company chip      | `GET /me → activeCompany.name` (EXISTS)        | `Company.name`                          | Read-only label. Company **switching is NOT in scope here** — `/auth/switch` is mobile-only; portal shows the single active company. If `availableRoles`/memberships span multiple companies, show name only (no switcher) unless a switch endpoint is later added (would be NEW). |
| User menu trigger | `GET /me → user.name \|\| user.phone` (EXISTS) | `User.name?` / `User.phone`             | Avatar = initials from `name`, else a generic `user` icon. Shows `activeRole` ("HR") as a small label.                                                                                                                                                                             |

#### 3.3 User menu (dropdown)

| Item                     | Source / action                                         | EXISTS/NEW                               | Result                                                                           |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| Name + phone header      | `user.name`, `user.phone` (EXISTS)                      | EXISTS                                   | display only; phone in mono                                                      |
| Active company + role    | `activeCompany.name`, `activeRole` (EXISTS)             | EXISTS                                   | display only                                                                     |
| Notification preferences | opens §8 panel                                          | EXISTS (`PATCH /me/notification-prefs`)  | inline panel or modal                                                            |
| Language                 | `user.locale` (EXISTS, free `String(8)`, defaults `en`) | field EXISTS; locale-change endpoint NEW | show current locale; "Change" is NEW (no write endpoint for locale in this area) |
| Sign out                 | `POST /auth/sign-out` (EXISTS)                          | EXISTS                                   | §5 flow                                                                          |

**Shell states.**

| State                                       | UI                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Loading (`GET /me` in flight)               | Shell chrome renders with skeleton: greyed sidebar labels, shimmer on company chip + user menu, content well shows a generic skeleton. |
| Healthy                                     | Full shell; badges hidden/zero (or populated from `GET /hr/overview` when live).                                                       |
| `GET /me` 404 (orphan user/company)         | Full-screen error: "Your account isn't linked to a company. Contact Axhy support." + Sign out.                                         |
| `GET /me` 401                               | Session-expired interstitial (§7).                                                                                                     |
| Overview fetch fails (when endpoint exists) | Badges silently hide (fail-soft); nav still works; no blocking error.                                                                  |
| No-site HR                                  | Shell normal, all badges 0; destination lists show §6.2-B empty state.                                                                 |

**Design notes.** Sidebar uses the ONE accent only for the active item + badges-as-amber. Company chip and user menu are neutral ink-on-cream. Density: 40px nav rows on desktop, 48px on mobile drawer. Mono for all counts, phone, IDs. Keep the content well visually dominant — chrome recedes. Focus rings terracotta, visible (WCAG AA), on every interactive element.

---

### 4. (Lists — global behavior reference)

> This area has no data lists of its own, but it sets the contract every other HR area inherits. Stated here once so the designer applies it consistently.

| Concern          | Rule                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pagination       | Cursor only: request `?cursor=<id>&limit=<n>`; response `{items, nextCursor}`. "Load more" or infinite scroll appends; **no page numbers** (cursor pagination has no total/last page). |
| Order            | `createdAt DESC, id DESC` (newest first), stable tiebreak on `id`.                                                                                                                     |
| Empty (no data)  | "Nothing here yet." neutral state per list.                                                                                                                                            |
| Empty (no sites) | §6.2-B: "No sites assigned to you yet." (HR site-anchoring).                                                                                                                           |
| Error + retry    | Inline error row + "Try again" that re-issues the same cursor request.                                                                                                                 |

---

### 5. Sign-out

**Purpose & placement.** From the user menu (§3.3). Ends the session and returns to Login.

**Action.**

| Action   | Method+path                    | Request fields                                                                                             | State machine                                     | DB writes + AuditEvent                                                                                                                                                     | Idempotency / double-submit                                                                                                   | Result UI                                                                                    |
| -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Sign out | `POST /auth/sign-out` (EXISTS) | `{refreshToken}` (from the SPA's in-memory state; the client sends the refresh token in the request body). | Revokes refresh family (`revokedReason: LOGOUT`). | RefreshToken family marked revoked. **No product AuditEvent** in this handler (sign-out is best-effort and idempotent — even an unknown/legacy token returns `{ok:true}`). | Endpoint is **safe to retry** (always `{ok:true}`). UI still disables the button during the request to avoid a double dialog. | On `{ok:true}` clear SPA state (in-memory tokens), redirect to §1 Login. Toast "Signed out." |

**States.** Confirm dialog ("Sign out of AXHY HR?") → Submitting (button spinner) → redirect. Network failure: still clear local state and return to Login (the refresh token is invalidated server-side or will expire); show "Signed out" — never trap the user in an authenticated shell on a failed sign-out.

**Design notes.** Destructive-but-routine: confirm dialog uses ink text, primary "Sign out" button in terracotta (this is the user's intended action, not a danger action — no red exists in the palette). Cancel is a ghost button.

---

### 6. List empty/loading states (canonical, referenced by all areas)

#### 6.1 Loading skeleton

Sidebar + topbar render immediately; content well shows shimmer rows (table) or shimmer cards. No spinner-only screens — preserve layout to avoid shift.

#### 6.2 Two empty states

- **A — No data yet:** list endpoint returns `{items:[], nextCursor:null}` and caller owns sites. Copy: "Nothing here yet." + a one-line hint about what populates it.
- **B — No sites assigned (HR anchoring):** caller owns zero sites (`getHrSiteIds` empty). Copy: "No sites assigned to you yet. Once the owner assigns you a site, your workers and queues appear here." Lucide `building-2` muted. This is **by design**, not an error — never show a retry or an error color.

#### 6.3 Error + retry

Inline error band (neutral, not brand-red): "Couldn't load this. Try again." with a terracotta "Try again" link that re-issues the request with the same cursor.

---

### 7. Session-expired / wrong-surface interstitial

**Purpose & placement.** A full-screen modal-over-scrim that appears whenever a `/v1` call returns `401 {error:'AUTH_REQUIRED'}` (session expired/revoked), or immediately after verify when the role is wrong for this surface.

**Two variants.**

| Variant         | Trigger                                                                                  | Copy                                                                                 | Primary action                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Session expired | any `401 {error:'AUTH_REQUIRED'}` while in the shell                                     | "Your session ended. Sign in again to continue."                                     | "Sign in" → §1 Login (preserve intended route to deep-link back after re-auth). |
| Wrong surface   | verify ok but `availableRoles` lacks `HR`/`OWNER` (worker/supervisor only)               | "This portal is for HR and owners. Workers and supervisors use the AXHY mobile app." | "Back to sign-in" → §1; secondary link to app stores.                           |
| Forbidden route | `403 {error:'FORBIDDEN_WRONG_ROLE'}` mid-session (role lacks access to a specific route) | "You don't have access to this section."                                             | "Back to Home" → §3.1 #1. Does NOT sign the user out.                           |

**States.** The interstitial blocks interaction with the stale shell beneath. No data is shown (the session is gone). On "Sign in", clear SPA state first so no stale `/me` data leaks.

**Design notes.** Centered card on a dimmed scrim over the (frozen) shell. Lucide `lock` icon in ink. Single terracotta primary button. Calm, non-alarming — expiry is routine.

---

### 8. Notification preferences (in user menu)

**Purpose & placement.** Opened from the user menu (§3.3). Lets the caller toggle their **own active-membership** notification channels. Keyed server-side by `auth.membershipId` — a user can only edit their own.

**Layout.** A compact panel/modal (≤480px): title "Notifications", a one-line scope note ("How AXHY reaches you for HR activity."), three toggle rows. Footer: changes save per-toggle (optimistic) or via a single "Save" — see action handling below.

**Fields.**

| Display label | Source                                      | Type / values          | Notes                                                       |
| ------------- | ------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| Push          | `GET /me → notificationPrefs.push` (EXISTS) | boolean (default true) | Empty stored `{}` reads as all-true (server merge default). |
| WhatsApp      | `notificationPrefs.whatsapp` (EXISTS)       | boolean (default true) |                                                             |
| Email         | `notificationPrefs.email` (EXISTS)          | boolean (default true) |                                                             |

**Action.**

| Action           | Method+path                             | Request fields                                                                                                              | State machine | DB writes + AuditEvent                                                                                                                                                  | Idempotency / double-submit                                                                                                                                            | Result UI                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle a channel | `PATCH /me/notification-prefs` (EXISTS) | partial body, e.g. `{push:false}` (server merges over current full prefs; client never sends `companyId` or `membershipId`) | n/a           | Writes `Membership.notificationPrefs` for `auth.membershipId`; appends **`AuditEvent kind:'MEMBERSHIP_NOTIFICATION_PREFS_UPDATED'`** (`payload.prefs` = merged result). | **No idempotency key** on this write — **disable the toggle during the in-flight request** to prevent double-submit; re-enable on response. Send only the changed key. | On `{ok:true, notificationPrefs}` reflect the returned full prefs (source of truth). On `400 NO_MEMBERSHIP` (legacy/SUPER_ADMIN session, no membership) show "This session can't change notifications." On `404 MEMBERSHIP_NOT_FOUND` show "Couldn't find your membership." On `500 INTERNAL` revert the toggle + toast "Couldn't save. Try again." |

**States.**

| State               | UI                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading             | three skeleton toggle rows (prefs come from the `GET /me` already loaded by the shell — usually instant).                                                              |
| Saving              | the toggled row shows a small inline spinner; that toggle is disabled; others remain interactive.                                                                      |
| Saved               | toggle settles to returned value; subtle inline "Saved" affirmation (may use verified-green `#059669` for the checkmark — this is a legitimate positive/verified use). |
| Error               | revert toggle to prior value; inline error text; no data loss.                                                                                                         |
| No membership (400) | disable all toggles, show the scope note explaining why.                                                                                                               |

**Design notes.** Toggles in the ON state use the terracotta accent (the ONE accent) — not green; green is reserved strictly for the transient "Saved" verified checkmark. Labels in Inter, the channel descriptions muted ink. Panel on cream. Each row ≥44px touch target for 375px.

---

### 9. Accuracy guarantees (designer must not deviate)

| Guarantee                                                                          | Enforced by                                                                                                                                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client never sends `companyId`                                                     | `req.auth.companyId` is server-derived from JWT (or cookie session once that's built); designs collect company only via `GET /me` display.                        |
| No password anywhere                                                               | auth is phone + OTP only (`/auth/otp/request` → `/auth/otp/verify`).                                                                                              |
| OTP: 6 digits, 5-min TTL, 60s resend, 3/15min request cap, 5 wrong-verify attempts | `otp-store.ts` constants; surfaced exactly in §1–§2 copy and timers.                                                                                              |
| Browser tokens are in-memory (not httpOnly cookies yet)                            | VerifyOTPOutput returns accessToken + refreshToken in JSON body; SPA must manage them securely in-memory. httpOnly cookie session is NEW and not yet implemented. |
| Worker OTP_VERIFIED transitions PENDING_ACTIVATION → DOC_PENDING (not ACTIVE)      | worker.ts line 99: OTP_VERIFIED: 'DOC_PENDING' is the next state. Worker must complete document upload before reaching ACTIVE.                                    |
| Empty lists for no-site HR are by design                                           | `getHrSiteIds` empty → empty (not error); §6.2-B.                                                                                                                 |
| Every write is audited, never edited/deleted                                       | `AUTH_LOGIN`, `MEMBERSHIP_NOTIFICATION_PREFS_UPDATED` are INSERT-only AuditEvents; portal exposes no edit/delete of history.                                      |
| Badges + global search + locale-change + overview are NEW                          | render hidden/coming-soon until their endpoints ship; never imply they are live.                                                                                  |

**Files referenced (authoritative):**

- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/auth.ts` (OTP request/verify, token issuance, login audit)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/me.ts` (GET /me, PATCH notification-prefs)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/middleware/role-gates.ts` (requireRole, role-gating)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/otp-store.ts` (OTP constants, rate limits, verification)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/hr-site-invariant.ts` (worker-HR invariant)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/middleware/hr-site-scope.ts` (getHrSiteIds implementation)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/worker.ts` (Worker state machine; OTP_VERIFIED → DOC_PENDING)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` (User, Membership, Company, Site models)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/auth.ts` (auth request/response shapes)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/me.ts` (notification prefs schema)

---

## Home / HR dashboard

### 1. Purpose + placement

The HR portal landing page at `app.axhy.app/hr` (route `/hr` or `/hr/overview`). First screen after HR login. Single job: surface the four queues that **need the HR person now**, plus today's visit health and a plain-words activity log. It is a triage launchpad, not a workspace — every card deep-links into its full queue screen. It is **HR site-anchored**: the HR sees only workers/complaints/visits tied to sites where `Site.ownerHrUserId = me`. If the HR owns no sites, this screen is intentionally empty (the "no-sites" state), founder-locked 2026-06-08, one-HR-per-worker site-based model (NOT pods).

Sits at the top of the HR left-nav, above Leave, Complaints, Swaps, Reversals, Visits, Workers.

---

### 2. Layout / sections

**Desktop 1440 (primary)**

- Left rail nav (240px): AXHY mark, nav items (Home active), HR name + sign-out at base. Mono data-label font on counts.
- Main column (max ~1120px, centered with 24px gutters):
  1. **Greeting row** — `Good morning, {firstName}` (time-of-day derived) + dated sub-line `Thursday, 13 Jun 2026`. Right-aligned: small "Last updated 2:15 pm" + manual refresh icon (Lucide `RefreshCw`).
  2. **Needs-you queue** — section header "Needs you". 4 stat-cards in a single row (4-up grid, each ~260px, 16px gap). Cards: Pending leave / Open complaints / Swap requests / Reversal requests. Each card = big count + label + oldest-waiting sub-line + chevron. Whole card is the click target into that queue.
  3. **Today strip** — full-width band: "Today's visits" with two inline figures: Verified (green dot) and Flagged (amber dot), plus total. Click → Visits screen filtered to today.
  4. **Recent activity** — section header "Recent activity" + "View all" link. Last 10 audit rows as a dense list (icon, plain-words sentence, relative time). No table chrome; row dividers only.

**375px mobile note**

- Left rail collapses to a top app-bar with a hamburger drawer.
- Greeting stacks; "Last updated" drops under the date.
- 4 stat-cards stack vertically (1-up), full-width, 12px gap; oldest-waiting stays on its own line.
- Today strip becomes a 2-column mini-grid (Verified | Flagged) with total below.
- Recent activity unchanged (already a single-column list); truncate long site/worker names with ellipsis, never wrap to 3 lines.

---

### 3. Page-level data fields

Primary source is the **aggregate `GET /hr/overview` — NEW (not built)**. Until built, the screen MUST hydrate from the per-queue list calls (all EXISTS) and compute counts/oldest client-side. Tag every field with which path supplies it.

| Display label           | Source (aggregate / fallback)                                                                     | Type / values  | Notes                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greeting name           | `req.auth` user → DERIVED firstName                                                               | string         | From session profile, not from `/hr/overview`. Client never sends companyId.                                                                                                                                                      |
| Today's date            | DERIVED (client clock)                                                                            | date           | en-IN `Thursday, 13 Jun 2026`.                                                                                                                                                                                                    |
| Last updated            | DERIVED (fetch completion time)                                                                   | timestamp      | en-IN time `2:15 pm`.                                                                                                                                                                                                             |
| Pending leave count     | `GET /hr/overview`→`leavePending` (NEW) / fallback `GET /leave-requests` page count (EXISTS)      | int ≥ 0        | Fallback: count items where `state=REQUESTED` (route already filters to REQUESTED). For an exact count beyond one page, page through `nextCursor`; if uncounted, show `20+`. Response shape: `{items, nextCursor}`.               |
| Open complaints count   | `GET /hr/overview`→`complaintsOpen` (NEW) / fallback `GET /complaints?state=OPEN` (EXISTS)        | int ≥ 0        | Also surface `IN_HR` if product wants "needs HR" — but ground-truth aggregate names it `complaintsOpen`; use `state=OPEN`. Response shape: `{complaints, nextCursor}` (note: `complaints` key, not `items`). `20+` rule as above. |
| Swap requests count     | `GET /hr/overview`→`swapsPending` (NEW) / fallback **NO HR swaps list endpoint verified**         | int ≥ 0        | Swaps list for HR is **NEW**. Until built, render card in coming-soon state (see §6), not a fake count.                                                                                                                           |
| Reversal requests count | `GET /hr/overview`→`reversalsPending` (NEW) / fallback **NO HR reversals list endpoint verified** | int ≥ 0        | Reversal queue for HR is **NEW**. Coming-soon state until built.                                                                                                                                                                  |
| Visits verified today   | `GET /hr/overview`→`visitsToday.verified` (NEW)                                                   | int ≥ 0        | No verified live HR visits-today list endpoint; this figure is aggregate-only. Until built → "—".                                                                                                                                 |
| Visits flagged today    | `GET /hr/overview`→`visitsToday.flagged` (NEW)                                                    | int ≥ 0        | Derived from `Visit.flagged=true` scheduled today on HR's sites. Aggregate-only.                                                                                                                                                  |
| Recent activity rows    | `GET /hr/overview`→`recentActivity[]` (NEW)                                                       | array (max 10) | Reads `AuditEvent` (`kind`,`actorId`,`payload`,`createdAt`). No standalone HR audit-feed endpoint verified → aggregate-only; until built show coming-soon row block.                                                              |

---

### 4. Stat-card fields (each of the 4 cards)

| Display label      | Source                                     | Type / values      | Notes                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Count (big number) | per-card count above                       | int ≥ 0            | Mono font. Zero → muted ink, no badge.                                                                                                                                                                                      |
| Card title         | static                                     | string             | "Pending leave", "Open complaints", "Swap requests", "Reversal requests".                                                                                                                                                   |
| Oldest waiting     | DERIVED from oldest queue item `createdAt` | relative duration  | List is `createdAt DESC` → oldest = **last** item on the last page. With one page + `nextCursor`, the true oldest is unknown; label "Oldest: 3d+" or page to the end for exact. en-IN tooltip shows `11 Jun 2026, 9:40 am`. |
| Urgency hint       | DERIVED (oldest-waiting age)               | none / "attention" | If oldest > a product threshold (e.g. 48h), title gets amber dot. Amber ONLY here for attention; never terracotta.                                                                                                          |
| Action affordance  | static                                     | —                  | Whole card clickable; chevron `ChevronRight`.                                                                                                                                                                               |

**Leave card** maps to `LeaveRequest` (`state=REQUESTED`). **Complaints card** to `Complaint` (`state=OPEN`). **Swap card** to `SwapRequest` (`state=DRAFT` — list endpoint NEW). **Reversal card** to activity reversal queue (endpoint NEW).

---

### 5. Today strip fields

| Display label  | Source                             | Type / values | Notes                                                                         |
| -------------- | ---------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| Verified today | `visitsToday.verified` (NEW)       | int ≥ 0       | Green dot (`#059669`) — positive/verified only.                               |
| Flagged today  | `visitsToday.flagged` (NEW)        | int ≥ 0       | Amber dot (`#D97706`) — flagged/attention only. Maps to `Visit.flagged=true`. |
| Total today    | DERIVED `verified + flagged` (NEW) | int ≥ 0       | Or aggregate may return total separately; if so use it.                       |

---

### 6. Recent-activity list columns

Each row renders one `AuditEvent` translated into a plain-English sentence. No raw enum shown.

| Column   | Source                                      | Type / values | Notes                                                                                                                                                           |
| -------- | ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon     | DERIVED from `AuditEvent.kind`              | Lucide icon   | e.g. `LEAVE_APPROVED`→`CalendarCheck`, `LEAVE_REJECTED`→`CalendarX`, complaint kinds→`MessageSquare`. No emoji.                                                 |
| Sentence | DERIVED from `kind` + `payload`             | string        | Plain words. `LEAVE_APPROVED` → "You approved {payload.workerName}'s leave, {payload.fromDate}–{payload.toDate}." Dates en-IN. Names from `payload.workerName`. |
| Actor    | `AuditEvent.actorId` → DERIVED display name | string        | "You" if `actorId == auth.userId`, else resolved name (resolution is NEW; until then show role or "A teammate").                                                |
| Time     | `AuditEvent.createdAt`                      | timestamp     | Relative ("2h ago"); tooltip en-IN `13 Jun 2026, 2:15 pm`.                                                                                                      |

Known `kind` values to translate (from verified routes/schema): `LEAVE_APPROVED`, `LEAVE_REJECTED`, plus complaint/visit/swap kinds as they appear. Unknown `kind` → safe fallback "An action was recorded." Never invent a sentence implying an action the backend didn't record.

---

### 7. Actions

Home is **read-only**. The only "actions" are navigation and refresh — no writes, no state-machine transitions, no AuditEvent from this screen. Listed for completeness:

| Action                | Method+path                                                                | Request                               | State-machine | DB writes + AuditEvent | Idempotency / double-submit                                          | Result UI                                                     |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------- | ------------- | ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Open Leave queue      | navigate `/hr/leave` → `GET /leave-requests?limit=20` (EXISTS)             | `cursor?`,`limit`                     | none (read)   | none                   | n/a (GET)                                                            | Leave queue screen.                                           |
| Open Complaints queue | navigate `/hr/complaints` → `GET /complaints?state=OPEN&limit=20` (EXISTS) | `state?`,`siteId?`,`cursor?`,`limit?` | none          | none                   | n/a                                                                  | Complaints queue. Response shape: `{complaints, nextCursor}`. |
| Open Swaps queue      | navigate `/hr/swaps` → **list endpoint NEW**                               | TBD                                   | none          | none                   | n/a                                                                  | Coming-soon screen until built.                               |
| Open Reversals queue  | navigate `/hr/reversals` → **list endpoint NEW**                           | TBD                                   | none          | none                   | n/a                                                                  | Coming-soon until built.                                      |
| Open today's visits   | navigate `/hr/visits?date=today` → **HR visits list NEW**                  | TBD                                   | none          | none                   | n/a                                                                  | Coming-soon until built.                                      |
| View all activity     | navigate `/hr/activity` → **audit feed NEW**                               | TBD                                   | none          | none                   | n/a                                                                  | Coming-soon until built.                                      |
| Refresh               | re-fire `GET /hr/overview` (NEW) / re-fire fallback list calls (EXISTS)    | none                                  | none          | none                   | Disable refresh icon while in flight; no double-submit risk (reads). | Spinner on icon → counts re-render.                           |

> Note on writes elsewhere: any decide action (approve/reject leave, resolve complaint) happens on the **queue/detail** screens, not Home. Per ground truth, leave/swap writes have **no idempotency key** → those screens MUST disable the submit button during the request. Complaints reply/resolve are idempotency-wrapped. Home never mutates, so it carries no double-submit handling beyond the refresh guard.

---

### 8. States

**Loading skeleton**

- Greeting renders immediately from session (no fetch).
- 4 stat-cards → skeleton blocks: shimmer rectangle for the number, two grey bars (title, oldest-line). Card stays clickable-disabled (no chevron) until loaded.
- Today strip → two skeleton pills.
- Recent activity → 5 skeleton rows (icon circle + 2 text bars).
- Use paper-cream surfaces with a soft terracotta-tinted shimmer; never a blue spinner.

**Empty state A — no sites (by design)**
Triggered when `getHrSiteIds` returns empty → all lists empty BY DESIGN.

- Full-page centered illustration (Lucide `MapPinOff`), heading "No sites assigned to you yet", body "When the owner assigns you a site, the workers, leaves, complaints and visits for that site show up here." No retry button (this is not an error). Quiet ink, no amber/green.
- Distinguish from error: this is a calm informational state, terracotta link "Contact the owner" optional.

**Empty state B — all caught up**
Triggered when HR owns sites but every queue count = 0.

- Stat-cards still render showing `0` (muted), no oldest-line.
- A reassuring banner above the cards: green check (`CheckCircle2`, `#059669` allowed — positive) "You're all caught up. Nothing needs you right now." Green used here legitimately (positive state).
- Recent activity still shows the last 10 rows if any exist; if truly none, "No activity yet."

**Error + retry (per-card partial failure)**
Because counts come from separate calls (until the aggregate ships), each card can fail independently.

- A failed card shows an inline error face: small `AlertTriangle` (amber), "Couldn't load", and a terracotta text-button **"Retry"** that re-fires only that card's call. Other cards stay live.
- Aggregate path: if `GET /hr/overview` itself fails, show a single page-level retry banner; cards render in error state with one "Retry all".
- Map backend errors: `401`→redirect to login; `403`→"You don't have access" (wrong role); `400 QUERY_INVALID`/`400 CURSOR_INVALID`/`400 BAD_CURSOR`→silent reset to first page + retry; `429` (rate limit 100/min/tenant)→"Too many requests, retrying…" with backoff, auto-retry once. Never surface a raw error code to the HR user; log the `{error,message}` payload.

**Machine-state chips (plain-words labels)**
Counts on Home represent these machine states; the chips appear on the queue screens, but Home's oldest-waiting tooltips and any inline labels use the same plain words:

| Entity         | Machine state  | Plain-words chip | Color                             |
| -------------- | -------------- | ---------------- | --------------------------------- |
| `LeaveRequest` | `REQUESTED`    | "Waiting on you" | neutral ink (count is the signal) |
| `LeaveRequest` | `APPROVED`     | "Approved"       | green `#059669`                   |
| `LeaveRequest` | `REJECTED`     | "Rejected"       | neutral/muted ink                 |
| `Complaint`    | `OPEN`         | "Open"           | terracotta count, neutral chip    |
| `Complaint`    | `IN_HR`        | "With HR"        | neutral                           |
| `Complaint`    | `RESOLVED`     | "Resolved"       | green `#059669`                   |
| `Complaint`    | `DISMISSED`    | "Dismissed"      | muted ink                         |
| `Visit`        | `flagged=true` | "Flagged"        | amber `#D97706`                   |
| `Visit`        | verified       | "Verified"       | green `#059669`                   |
| `SwapRequest`  | `DRAFT`        | "Pending"        | neutral (list NEW)                |

Green ONLY for positive/verified/resolved/approved. Amber ONLY for flagged/attention/error-face. Terracotta is the single accent for counts that need you + links + active nav — never for status semantics.

---

### 9. Filters / search / pagination (exact)

Home itself has **no filters or search** — it is a fixed triage view.

The list calls it hydrates from use cursor pagination, ordered `createdAt DESC, id DESC`:

| Endpoint                       | Query params                                                             | Response shape             | Notes                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /leave-requests` (EXISTS) | `cursor?` (opaque base64url `<iso>:<id>`), `limit` (1–100, default 20)   | `{items, nextCursor}`      | Already filtered to `state=REQUESTED` + HR site scope. Bad cursor → `400 CURSOR_INVALID`; bad query → `400 QUERY_INVALID`. |
| `GET /complaints` (EXISTS)     | `state?` (OPEN/IN_HR/RESOLVED/DISMISSED), `siteId?`, `cursor?`, `limit?` | `{complaints, nextCursor}` | HR scope = sites HR owns (`siteId IN getHrSiteIds`). Bad cursor → `400 BAD_CURSOR`. For Home, call `state=OPEN`.           |

For Home counts: fire each with `limit=20`. If `nextCursor` is non-null, the exact count exceeds the page — display `20+` rather than a wrong total, OR page to the end for an exact figure (product call; default `20+` for speed). Once `GET /hr/overview` (NEW) ships, it returns exact counts in one call and the `20+` fallback disappears.

---

### 10. Format rules applied on this screen

- **Money**: none on Home today. If any future card surfaces money, render paise→Rupees (`50000` → "Rs 500"), mono font, no decimals when whole.
- **Dates**: `YYYY-MM-DD` from API (`fromDate`,`toDate`) → display en-IN `13 Jun 2026`. Timestamps ISO → display en-IN `13 Jun 2026, 2:15 pm`. Relative times in activity feed; absolute on tooltip.
- **Counts**: integers, mono. `20+` cap rule until aggregate ships.

---

### 11. Design notes (locked terracotta / paper brand)

- **Surface**: cream `#FFFBEB` page; cards = white/paper with a hairline border (`#0F172A` at ~8% alpha), 12px radius, subtle shadow. Ink `#0F172A` for text.
- **The ONE accent (terracotta `#9A3412`, hover `#C2410C`)**: active nav item, all clickable card chevrons/links, "Retry"/"View all" text-buttons, the non-zero count number, focus rings. Nowhere else.
- **Green `#059669`** allowed ONLY: verified-today figure + dot, "all caught up" banner check, Resolved/Approved chips. Never decorative.
- **Amber `#D97706`** allowed ONLY: flagged-today figure + dot, oldest-waiting "attention" dot when stale, the per-card error face. Never as a general highlight.
- **Density**: desktop-first dense — 4 cards in one row, activity rows ~44px tall with 1px dividers, generous but tight 16px gaps. Still legible and tap-safe at 375px (min 44px targets).
- **Typography**: Inter for all UI text; mono (data-label font) for counts and any IDs/durations; Noto Sans Devanagari/Telugu auto-swapped for hi/te locales. Section headers small-caps-weight Inter 600.
- **Icons**: Lucide only, 1.5px stroke, ink color (accent only on interactive). No emoji anywhere.
- **Accessibility (WCAG AA)**: count + label always paired (never color-only meaning); green/amber dots always accompanied by text ("Verified", "Flagged"); focus-visible terracotta ring; skeleton announced via `aria-busy`; error faces use `role="alert"` with the plain-words string, not the error code.

---

**Build-status callout for the designer**: only `GET /leave-requests` and `GET /complaints` are live (EXISTS). The home aggregate `GET /hr/overview`, plus HR swaps list, HR reversals list, HR visits-today list, and the HR audit feed are all **NEW** — design their cards/sections with first-class coming-soon empty states (muted card, "Coming soon" sub-line, disabled chevron) so the page never implies an endpoint exists before it ships. The Leave and Complaints cards are fully wireable today.

Sources: [Designing Admin Dashboards That Users Actually Love — Medium](https://medium.com/@CarlosSmith24/designing-admin-dashboards-that-users-actually-love-256534af551c), [Dashboard UI best practices — LogRocket](https://blog.logrocket.com/ux-design/dashboard-ui-best-practices-examples/), [Koha queues: priorities-then-oldest split — GitLab](https://gitlab.com/koha-community/koha-dashboard/-/issues/17)

---

## Workers list + worker detail (6 tabs) + add worker

> HR portal area at `app.axhy.app/hr/workers`. Desktop-first enterprise admin (dense tables, detail pages); must hold at 375px. All data is tenant-scoped server-side — the client NEVER sends `companyId`. Auth context `req.auth={userId,companyId,role,membershipId,epoch}` is implicit. Base API `/v1`. Brand: warm terracotta accent `#9A3412` (hover `#C2410C`), cream bg `#FFFBEB`, ink `#0F172A`, verified-green `#059669` (positive/verified only), flagged-amber `#D97706` (flagged/attention only). Inter UI, Noto Sans Devanagari/Telugu for hi/te, mono for data labels. Lucide icons, no emoji. WCAG AA.

> **EXISTS** = endpoint verified live in `apps/backend/src/routes/admin-workers.ts`. **NEW** = must be built; the screen renders an empty / "Coming soon" state until then, and never implies the endpoint exists.

> **Site-anchoring (founder-locked 2026-06-08, NOT pods):** HR sees only workers who have an Assignment in state `ACTIVE` or `DRAFT` to a site they own (`Site.ownerHrUserId = me`). An HR who owns no sites sees an **empty list by design** — this is correct, not a bug. OWNER sees all workers tenant-wide. This shapes every empty state below.

---

### 1. Workers list

**1.1 Purpose + placement.** Primary landing of `/hr/workers`. The roster of every worker the signed-in HR is responsible for (or, for OWNER, every worker in the company). Entry point to worker detail and to Add Worker. Left-nav item "Workers" (Lucide `users`), active state in terracotta.

**1.2 Layout — desktop 1440 (primary).**

- **Top bar (sticky):** page title "Workers" (mono-tagged count chip e.g. `48 workers` once loaded) · right-aligned primary button **Add worker** (terracotta `#9A3412`, Lucide `user-plus`).
- **Filter/search row (sticky under top bar):** search input (`Search by name or phone`, Lucide `search`) — **NEW**, see §1.7 · status filter dropdown (`status`, Membership.status values) — **NEW** · state filter dropdown (15 worker states) — **NEW**. Until NEW filter endpoints land, render the controls **disabled with a "Filtering coming soon" tooltip** — do NOT imply they work.
- **Table:** dense, 10 columns (§1.4), zebra-free, 44px rows, 1px `#E7E0CF` row dividers on cream. Sticky header. Row hover = cream-tint `#FFF7E0`; whole row is the click target to detail.
- **Footer:** **Load more** button (cursor pagination, §1.6); no page numbers.

**1.3 Layout — 375px mobile.** Top bar collapses: title + Add-worker icon button. Table becomes a stacked card list — each card shows Name (bold), state chip, phone (mono), status; remaining columns (pod, created, IDs) hidden behind a card tap → detail. Search full-width above the list.

**1.4 List columns (10).** Source: `GET /admin/workers` items[]. **EXISTS.**

| #   | Column label      | Source (exact)                            | Type / enum                                               | Notes                                                                                                                                                                                                                                                                  |
| --- | ----------------- | ----------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Name              | `items[].name`                            | string \| null                                            | If null show `—` (mono muted). Anonymized rows may carry a masked name.                                                                                                                                                                                                |
| 2   | Phone             | `items[].phone`                           | string (E.164) \| null                                    | Mono. If `items[].anonymizedPhone === true`, mask as `Resigned` badge + hide digits (phone is prefixed `anon:`); never render the raw `anon:` string.                                                                                                                  |
| 3   | Worker state      | `items[].state` — **NOT in list payload** | —                                                         | **Not present in list items.** The list payload has NO `state` field; only `GET /admin/workers/:id` returns `state`. Render a state chip column ONLY if a NEW list-state field ships; until then **omit this column or show `—`**. Do not fabricate state in the list. |
| 4   | Membership status | `items[].status`                          | string (`ACTIVE` default; other Membership.status values) | Chip; plain word ("Active").                                                                                                                                                                                                                                           |
| 5   | Resigned          | DERIVED `items[].anonymizedPhone`         | boolean                                                   | If true, amber-free neutral grey "Resigned" badge (resignation is neutral, not "attention" — do NOT use amber/green).                                                                                                                                                  |
| 6   | Pod               | `items[].podId`                           | uuid \| null                                              | Legacy field; HR is site-anchored not pod-anchored. Show `—` when null. Low priority; collapsible.                                                                                                                                                                     |
| 7   | Added             | `items[].createdAt`                       | ISO timestamp                                             | Display en-IN `13 Jun 2026` (membership createdAt).                                                                                                                                                                                                                    |
| 8   | Worker ID         | `items[].workerId`                        | uuid (Worker.id)                                          | Mono, truncated `a1b2…`, copy-on-click. This is **Worker.id**, the identity used by all detail/action routes — never User.id.                                                                                                                                          |
| 9   | User ID           | `items[].userId`                          | uuid (User.id)                                            | Mono, truncated, copy-on-click. Secondary.                                                                                                                                                                                                                             |
| 10  | Membership ID     | `items[].membershipId`                    | uuid                                                      | Mono, truncated, copy-on-click. Secondary; collapsible.                                                                                                                                                                                                                |

> Identity rule (parent-brief 2026-05-29, enforced in route): every actionable id is **Worker.id** (`workerId`). Memberships whose User has no Worker row are dropped server-side — they never appear. Row click navigates by `workerId`.

**1.5 States.**

- **Loading:** 8–10 skeleton rows (shimmer bars sized to columns); header solid; Add-worker button live.
- **Empty — HR owns no sites:** illustration + headline "No workers yet" + body "You're not assigned to any site yet, so there are no workers to manage. Ask the owner to assign you a site." This is the **by-design empty** (HR with zero owned sites). Show Add-worker disabled-with-tooltip "Assign a site first" only if creation also requires a site; otherwise keep Add-worker live. No retry — this is expected.
- **Empty — sites owned, zero matching workers:** "No workers on your sites yet" + body "Add your first worker to get started." + live **Add worker** CTA.
- **Empty — filtered to zero (NEW filters):** "No workers match these filters" + **Clear filters**.
- **Error:** inline banner "Couldn't load workers." + **Retry** (re-calls `GET /admin/workers`). `400 QUERY_INVALID` / `400 CURSOR_INVALID` → same banner; clear the bad cursor and retry from start. `401` → bounce to login. `403` → "You don't have access to workers" (wrong role; HR/OWNER required).

**1.6 Pagination (exact).** `GET /admin/workers?cursor&limit`. `limit` default **20**, min 1, max **100**. Ordered `createdAt DESC, id DESC`. Response `{items, nextCursor}`. Cursor is opaque base64url (`<ISO createdAt>:<uuid id>`) — store and replay verbatim, never parse. **Load more** appends; hide the button when `nextCursor === null`. On `CURSOR_INVALID` (400) reset to first page.

**1.7 Search / filter (NEW).** "worker search filter" is **NEW** — not yet live. Spec the UI (name/phone search, status filter, state filter) but render disabled with "coming soon" affordance until the endpoint ships. Do not wire to the existing list endpoint (it has no search params).

**1.8 Design notes.** The single accent (terracotta) appears only on: Add-worker button, active nav, row-hover focus ring, and copy-confirm flash. State/status chips use neutral ink + light fills; green/amber reserved exclusively for verified/flagged semantics elsewhere — a plain "Active" membership status is **not** green. Mono font on every id, phone, and the count chip.

---

### 2. Worker detail — header + 6 tabs

**2.1 Purpose + placement.** `/hr/workers/:workerId` where `:workerId` is **Worker.id**. Single source for one worker. Source for header: `GET /admin/workers/:id` (**EXISTS**) → adds `state` over the list shape. 404 → not-found page (server returns `WORKER_NOT_FOUND` for cross-tenant, orphan-membership, or out-of-HR-scope; existence is never leaked).

**2.2 Header (sticky).**

| Element           | Source (exact)            | Type / enum           | Notes                                                                                                                                                      |
| ----------------- | ------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name              | `name`                    | string                | Worker.name. H1.                                                                                                                                           |
| Phone             | `phone`                   | string (E.164)        | Mono. If `anonymizedPhone===true` → "Resigned worker" + hide digits.                                                                                       |
| Worker state chip | `state`                   | 15-state enum (§2.10) | Plain-word label + tooltip; color rules in §2.10.                                                                                                          |
| Membership status | `status`                  | string \| null        | null when anonymized (no membership join). Secondary chip.                                                                                                 |
| Resigned badge    | DERIVED `anonymizedPhone` | boolean               | Neutral grey badge when true.                                                                                                                              |
| Pod               | `podId`                   | uuid \| null          | Secondary; `—` when null.                                                                                                                                  |
| Joined            | `createdAt`               | ISO timestamp         | en-IN date. (This is membership createdAt; anonymized → epoch `1 Jan 1970`, render `—`.)                                                                   |
| Worker ID         | `workerId`                | uuid                  | Mono, copyable.                                                                                                                                            |
| User ID           | `userId`                  | uuid \| null          | Mono. null when anonymized.                                                                                                                                |
| Membership ID     | `membershipId`            | uuid \| null          | Mono. null when anonymized.                                                                                                                                |
| **Actions menu**  | —                         | —                     | Lucide `more-horizontal`; opens §3 actions. Most actions are **NEW** → render disabled with "Coming soon"; only **Anonymise/Resign** is EXISTS-gated (§3). |

**2.3 Tab bar.** Six tabs, terracotta underline on active: **Profile · Sites & shifts · Attendance · Visits · Leave · Record**. Loading skeleton per tab; each tab fetches lazily on first open.

---

#### Tab 1 — Profile (editable)

**Purpose:** view + edit core worker fields. **Edit is NEW** (`PUT /admin/workers/:id` not yet live). Render fields **read-only** with an "Edit (coming soon)" disabled button until the endpoint ships; never imply edit works.

| Display label      | Source (exact)               | Type / enum                                                          | Notes                                                                                                                                                                                   |
| ------------------ | ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | `Worker.name` (`name`)       | string, 1–120 chars                                                  | Read-only until edit ships.                                                                                                                                                             |
| Phone              | `Worker.phone` (`phone`)     | string E.164 `^\+\d{8,15}$`                                          | Mono. Login identity — likely non-editable even after edit ships.                                                                                                                       |
| Worker state       | `Worker.state` (`state`)     | 15-state enum                                                        | Chip; changed only via transition action (§3), NOT inline edit.                                                                                                                         |
| Preferred language | `Worker.preferredLanguage`   | ISO-639-1, 2 lower-case letters (`hi` default; `te`/`en`/`bn`/`ta`…) | Dropdown when edit ships. Default `hi`.                                                                                                                                                 |
| Base salary        | `Membership.baseSalaryPaise` | int paise, 0…2,000,000,000                                           | **Money:** display Rupees from paise (`50000 paise → Rs 500`). Mono. NOT in the detail GET payload today → **NEW** field; show "—" / "Coming soon" until a profile endpoint returns it. |
| Bank IFSC          | `Membership.bankIfsc`        | string ≤16 \| null                                                   | Sensitive; masked by default, reveal-on-click. NEW in payload.                                                                                                                          |
| Bank account       | `Membership.bankAcct`        | string ≤40 \| null                                                   | Sensitive; masked. NEW in payload.                                                                                                                                                      |
| Pod                | `Membership.podId` (`podId`) | uuid \| null                                                         | Read-only.                                                                                                                                                                              |

**Edit action (NEW):** `PUT /admin/workers/:id` — request fields TBD (likely subset of name, preferredLanguage, baseSalaryPaise, bankIfsc, bankAcct). State machine: **none** (profile edit is not a state transition). DB written: `Worker` and/or `Membership` + immutable `AuditEvent` (kind TBD, e.g. `WORKER_PROFILE_UPDATED`). Idempotency: **NO key** — disable Submit during the request, re-enable on response; rely on DB constraints. Result UI: optimistic field flash + toast "Saved". Until live: entire tab read-only.

**States:** loading skeleton (label/value pairs); no list so no list-empty; error banner + Retry on header GET failure.

---

#### Tab 2 — Sites & shifts (Assignment rows)

**Purpose:** which sites this worker is assigned to and the shift pattern. **List source NEW** (`GET /admin/workers/:id/assignments` not live) → render "Coming soon" empty until it ships. Columns spec'd from `Assignment` model so the designer is ready.

| Column label      | Source (exact)                         | Type / enum                          | Notes                                                           |
| ----------------- | -------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| Site              | `Assignment.siteId` → site name (join) | uuid → name                          | Show site name; mono id on hover.                               |
| Shift start       | `Assignment.shiftStart`                | string `"HH:mm"`                     | Display 12-h en-IN `9:00 am`.                                   |
| Shift end         | `Assignment.shiftEnd`                  | string `"HH:mm"`                     | en-IN.                                                          |
| Days              | `Assignment.dayMask`                   | 7-char mask `"MTWTFS_"`              | Render as Mon–Sun pills; lit = scheduled, `_` = off.            |
| Valid from        | `Assignment.validFrom`                 | date                                 | en-IN `13 Jun 2026`.                                            |
| Valid until       | `Assignment.validUntil`                | date \| null                         | null = "Open-ended".                                            |
| State             | `Assignment.state`                     | enum `DRAFT \| ACTIVE \| TERMINATED` | Chip: DRAFT neutral, ACTIVE neutral-positive, TERMINATED muted. |
| Terminated reason | `Assignment.terminatedReason`          | string \| null                       | Only on TERMINATED rows.                                        |
| Terminated by     | `Assignment.terminatedBy`              | uuid (Membership) \| null            | Resolve to name if available.                                   |
| Created           | `Assignment.createdAt`                 | timestamp                            | en-IN.                                                          |

> The HR-visible scope itself is defined by these rows: ACTIVE/DRAFT assignments to HR-owned sites are why the worker appears at all.

**States:** loading skeleton rows · empty (no assignments) "No sites assigned yet" · empty-by-design n/a · error + Retry · NEW-not-built: "Sites & shifts — coming soon" panel.

**Actions:** none in this area today (assignment create/terminate lives in supervisor/site flows, out of scope here).

---

#### Tab 3 — Attendance (month calendar, 5 statuses, read-only)

**Purpose:** month grid of attendance. **Read-only here** — attendance is written by `POST /workers/:id/mark-absent` (supervisor flow, **NOT HR**); HR never writes attendance. **List source NEW** (`GET /admin/workers/:id/attendance`) → "Coming soon" until live.

**Layout:** month calendar (desktop), prev/next month arrows, "Today" jump. Each day cell shows a status dot + (on hover/tap) the deduction. 375px: vertical day list per month.

| Field per day | Source (exact)                    | Type / enum                                                                  | Notes                                                                             |
| ------------- | --------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Date          | `Attendance.date`                 | date                                                                         | Cell. en-IN.                                                                      |
| Status        | `Attendance.status`               | `PRESENT \| ABSENT_NO_CALL \| ABSENT_APPROVED_LEAVE \| HALF_DAY \| ON_BREAK` | 5 statuses, color rules below.                                                    |
| Pay deduction | `Attendance.payDeductPaise`       | int paise (0 for PRESENT)                                                    | **Money:** Rupees from paise (`50000 → Rs 500`). Shown on absence/half-day cells. |
| Marked by     | `Attendance.markedBySupervisorId` | uuid (supervisor User.id)                                                    | Tooltip "Marked by …"; resolve to name if available.                              |
| Reason        | `Attendance.reason`               | string \| null                                                               | Tooltip.                                                                          |

**Status legend (5, plain words):**
| Status | Plain label | Color rule |
|---|---|---|
| `PRESENT` | Present | verified-green `#059669` (this is the one positive use) |
| `ABSENT_NO_CALL` | Absent (no call) | flagged-amber `#D97706` (attention) |
| `ABSENT_APPROVED_LEAVE` | On approved leave | neutral ink / grey |
| `HALF_DAY` | Half day | neutral / light terracotta tint |
| `ON_BREAK` | On break | neutral grey |

**States:** loading skeleton calendar · empty "No attendance recorded yet" · error + Retry · NEW-not-built panel · note banner: "Attendance is recorded by supervisors on site. View-only here."

---

#### Tab 4 — Visits (13 states, not 12)

**Purpose:** the worker's visit history. **List source NEW** (`GET /admin/workers/:id/visits`) → "Coming soon" until live. Read-only for HR (visit resolve/reject are supervisor flows).

| Column label    | Source (exact)                             | Type / enum                                                              | Notes                         |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------- |
| Date / time     | `Visit.scheduledFor`                       | timestamp                                                                | en-IN `13 Jun 2026, 2:15 pm`. |
| Site            | `Visit.siteId` → name                      | uuid → name                                                              | Join.                         |
| State           | `Visit.state`                              | 13-state enum (legend below)                                             | Chip.                         |
| Started         | `Visit.startedAt`                          | timestamp \| null                                                        | en-IN; `—` if null.           |
| Completed       | `Visit.completedAt`                        | timestamp \| null                                                        | en-IN; `—`.                   |
| Photos          | `Visit.photosBefore` / `Visit.photosAfter` | int 0–16 each                                                            | `B 4 / A 4`.                  |
| Flagged         | `Visit.flagged`                            | boolean                                                                  | Amber dot only when true.     |
| AI verification | `Visit.verificationText`                   | string \| null                                                           | Truncated, expand-on-click.   |
| Correction      | `Visit.correctionReason`                   | `wrong-site \| wrong-time \| duplicate \| wrong-worker \| other` \| null | Badge on corrected rows.      |

**13 visit states — chips with plain words + legend:**
| State | Plain label | Color rule |
|---|---|---|
| `SCHEDULED` | Scheduled | neutral grey |
| `NOTIFIED` | Worker notified | neutral |
| `EN_ROUTE` | On the way | neutral |
| `ON_SITE` | Arrived | neutral |
| `IN_PROGRESS` | Cleaning | neutral / light terracotta |
| `PHOTOS_PENDING` | Photos pending | neutral |
| `AWAITING_VERIFICATION` | Checking photos | neutral |
| `VERIFIED` | Verified | verified-green `#059669` |
| `FLAGGED` | Needs review | flagged-amber `#D97706` |
| `CANCELLED` | Cancelled | muted grey |
| `REJECTED` | Rejected | muted grey + ink |
| `NO_SHOW` | No-show | flagged-amber |
| `ARCHIVED` | Archived | muted grey |

**States:** loading skeleton table · empty "No visits yet" · error + Retry (note: visit resolve/reject endpoints carry idempotency keys, but those are supervisor actions, not surfaced here) · NEW-not-built panel.

---

#### Tab 5 — Leave (3 states, not "12-state placeholder")

**Purpose:** the worker's leave requests. **List source NEW** (`GET /admin/workers/:id` does not return leaves; no leave-list-by-worker HR endpoint verified) → "Coming soon" until live. HR decisioning of leave is a separate flow (leave-requests routes), out of this area's scope.

| Column label  | Source (exact)              | Type / enum                                 | Notes                                                                                                        |
| ------------- | --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| From          | `LeaveRequest.fromDate`     | date                                        | en-IN.                                                                                                       |
| To            | `LeaveRequest.toDate`       | date                                        | en-IN.                                                                                                       |
| Reason        | `LeaveRequest.reason`       | string                                      | Truncate.                                                                                                    |
| State         | `LeaveRequest.state`        | 3-state `REQUESTED \| APPROVED \| REJECTED` | Chip; legend below. (Schema comment says "12-state placeholder" — the real machine is 3 states only; use 3.) |
| Decided by    | `LeaveRequest.decidedBy`    | uuid \| null                                | Resolve to name.                                                                                             |
| Decided at    | `LeaveRequest.decidedAt`    | timestamp \| null                           | en-IN.                                                                                                       |
| Decision note | `LeaveRequest.decisionNote` | string \| null                              | Tooltip.                                                                                                     |
| Requested     | `LeaveRequest.createdAt`    | timestamp                                   | en-IN.                                                                                                       |

**Leave state legend (3, plain words):**
| State | Plain label | Color rule |
|---|---|---|
| `REQUESTED` | Waiting | neutral grey |
| `APPROVED` | Approved | verified-green `#059669` |
| `REJECTED` | Rejected | muted grey + ink |

> Re-deciding a terminal leave returns **409 ALREADY_DECIDED** server-side — if a decide action is ever surfaced here, map that to a "This leave was already decided" toast and refresh the row. APPROVED/REJECTED are terminal (no transition out).

**States:** loading · empty "No leave requests" · error + Retry · NEW-not-built panel.

---

#### Tab 6 — Record (audit trail)

**Purpose:** immutable history of every write touching this worker. **List source NEW** (`GET /admin/workers/:id/audit`) → "Coming soon" until live. Append-only by definition (`AuditEvent` is INSERT-only; no edit, no delete anywhere in the product; Company→AuditEvent FK RESTRICT, migration 031).

| Column label | Source (exact)         | Type / enum                                                                                     | Notes                                                                                    |
| ------------ | ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| When         | `AuditEvent.createdAt` | timestamp                                                                                       | en-IN `13 Jun 2026, 2:15 pm`.                                                            |
| Event        | `AuditEvent.kind`      | string taxonomy (`WORKER_CREATED`, `WORKER_PROFILE_UPDATED`, anonymize kind, transition kinds…) | Map to plain words ("Worker added", "Profile updated", "Resigned").                      |
| Actor        | `AuditEvent.actorId`   | uuid (User.id; not a FK)                                                                        | Resolve to name when possible; else mono id. May reference a deleted user — never break. |
| Target       | `AuditEvent.targetId`  | string \| null                                                                                  | Usually this Worker.id.                                                                  |
| Details      | `AuditEvent.payload`   | JSON                                                                                            | Expandable JSON viewer (read-only).                                                      |

**States:** loading timeline skeleton · empty "No history yet" (rare — creation always writes one row) · error + Retry · NEW-not-built panel. Render strictly **read-only**: no edit, no delete affordances anywhere — they do not exist in the product.

---

### 3. Actions menu (worker detail)

Triggered from header `more-horizontal`. Each action tagged EXISTS/NEW. **Only Anonymise/Resign is live today.** All NEW actions render in the menu **disabled with a "Coming soon" tag** — never imply they work.

| Action                 | Method + path                              | EXISTS/NEW           | Request fields                                         | State machine (worker: from→to)                                                                            | DB written + AuditEvent kind                                                                                   | Idempotency / double-submit                                                      | Result UI                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------ | -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anonymise / Resign** | `POST /admin/workers/:id/anonymize`        | **EXISTS** (HR only) | `{ reason: string 1–500, effectiveAt?: ISO datetime }` | `TERMINATION_PENDING → TERMINATED` (service requires the worker be in TERMINATION_PENDING first; else 409) | `Worker` (state→TERMINATED, `userId→null`, `phone` prefixed `anon:`) + immutable `AuditEvent` (anonymize kind) | **NO idempotency key** → disable Submit during request; rely on DB + state guard | Confirm modal (typed reason required) → on success toast "Worker resigned" + header flips to Resigned badge, `state=TERMINATED`, membership fields blank. Errors: `404 WORKER_NOT_FOUND` (also = out-of-scope; no existence leak) → "Worker not found"; `409 WORKER_ALREADY_TERMINATED` → "Already resigned"; `409 WORKER_NOT_PENDING_TERMINATION` → "Start termination first, then resign"; `400 BAD_INPUT` → field error. |
| **Invite again**       | `POST /admin/workers/:id/transition` (NEW) | **NEW**              | reason?                                                | likely re-trigger invite/activation path                                                                   | `Worker` + `AuditEvent`                                                                                        | NO key → disable Submit                                                          | Disabled "Coming soon" until built.                                                                                                                                                                                                                                                                                                                                                                                         |
| **Suspend**            | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'SUSPEND', reason: string, until?: date }`   | `ACTIVE \| ON_LEAVE \| AT_RISK → ON_SUSPENSION`                                                            | `Worker.state` + `AuditEvent`                                                                                  | NO key → disable Submit                                                          | Coming soon. On build: confirm + reason.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Lift suspension**    | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'SUSPENSION_LIFTED' }`                       | `ON_SUSPENSION → ACTIVE`                                                                                   | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Flag at-risk**       | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'FLAG_AT_RISK', reason }`                    | `ACTIVE \| ABSENT → AT_RISK`                                                                               | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Clear at-risk**      | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'CLEAR_AT_RISK' }`                           | `AT_RISK → ACTIVE`                                                                                         | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Block**              | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'BLOCK', reason }`                           | `ACTIVE → BLOCKED`                                                                                         | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Unblock**            | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'UNBLOCK' }`                                 | `BLOCKED → ACTIVE`                                                                                         | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Terminate**          | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'TERMINATE', reason, lastDay: date }`        | `ACTIVE \| ON_LEAVE \| ON_SUSPENSION \| ABSENT \| AT_RISK \| BLOCKED \| INACTIVE → TERMINATION_PENDING`    | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon. **Note:** Terminate moves to TERMINATION_PENDING; the live **Anonymise** action then finalizes TERMINATION_PENDING→TERMINATED.                                                                                                                                                                                                                                                                                 |
| **Transfer**           | `POST /admin/workers/:id/transition`       | **NEW**              | `{ event: 'TRANSFER_INITIATED', targetCompanyId }`     | `ACTIVE → TRANSFER_PENDING`                                                                                | `Worker.state` + `AuditEvent`                                                                                  | NO key                                                                           | Coming soon.                                                                                                                                                                                                                                                                                                                                                                                                                |

> **Menu gating by state:** show only actions whose `from` matches the worker's current `state` (read from header `state`). E.g. "Lift suspension" appears only in `ON_SUSPENSION`; "Unblock" only in `BLOCKED`. Terminal states `TERMINATED`/`ARCHIVED`/`ANONYMIZED` show no destructive actions. Confirm modals required for Suspend, Block, Terminate, Transfer, Anonymise; each requires a typed reason where the event carries `reason`.

> **Rate limit / retry:** global 100 req/min/tenant + per-route Redis sliding window (fail-open). On 429 show "Too many requests, try again in a moment." All worker writes lack idempotency keys → the UI MUST disable the submit button for the whole request lifecycle and never double-submit; rely on DB unique constraints + state-machine guards.

---

### 4. Add Worker form

**4.1 Purpose + placement.** Modal (desktop) or full-screen sheet (375px) launched from the list/detail "Add worker" button. **EXISTS:** `POST /admin/workers` (HR only). Creates User (or reuses existing non-anon User by phone) + Membership(WORKER, status ACTIVE) + Worker in **PENDING_ACTIVATION**.

**4.2 Form fields.** Validation mirrors `AdminCreateWorkerInput` (Zod) exactly.

| Display label      | Source / request field | Type / constraint (exact)                             | Notes                                                                                                                 |
| ------------------ | ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Phone              | `phone`                | string, regex `^\+\d{8,15}$` (E.164, required)        | Mono input. Helper "Include country code, e.g. +91…". Inline error "Enter a valid phone (e.g. +91…)" on regex fail.   |
| Name               | `name`                 | string, 1–120 chars, required                         | —                                                                                                                     |
| Base salary (Rs)   | `baseSalaryPaise`      | int, 0…2,000,000,000, required                        | **Money UX:** user types Rupees; client multiplies ×100 → paise before send (`Rs 500 → 50000`). Show "/ month". Mono. |
| Bank IFSC          | `bankIfsc`             | string ≤16, optional                                  | Uppercase.                                                                                                            |
| Bank account       | `bankAcct`             | string ≤40, optional                                  | Sensitive; masked confirm.                                                                                            |
| Preferred language | `preferredLanguage`    | string regex `^[a-z]{2}$`, optional, **default `hi`** | Dropdown (हिन्दी/తెలుగు/English…); defaults to Hindi.                                                                 |

**4.3 Submit.**

- Method/path: `POST /admin/workers` (**EXISTS**). Request body = above fields. Client never sends companyId.
- State machine: worker created at entry state **`PENDING_ACTIVATION`** (response `state:'PENDING_ACTIVATION'`). Activation to ACTIVE happens later via the worker's OTP-verify flow, not here. **CRITICAL:** OTP_VERIFIED transitions PENDING_ACTIVATION→DOC_PENDING (NOT to ACTIVE); DOCS_PROVIDED transitions DOC_PENDING→ACTIVE.
- DB written: `User` (created or reused), `Membership` (role WORKER, status ACTIVE), `Worker` (state PENDING_ACTIVATION) + immutable `AuditEvent` kind **`WORKER_CREATED`** (payload: workerId, userId, membershipId, name).
- Idempotency: **NO key** — disable Submit for the whole request; do not double-submit. Duplicate phone is caught by DB unique (`Worker @@unique([companyId, phone])`, Membership unique) → service returns `ALREADY_EXISTS`.
- Result UI: success → close modal, toast "Worker added", new row appears with state PENDING_ACTIVATION. Errors: `409 WORKER_ALREADY_EXISTS` → inline on phone field "A worker with this phone already exists in this company"; `400 BAD_INPUT` (with `message`) → field-level errors; `401` → login; `403` → "Only HR can add workers" (gate is HR-only — OWNER cannot create here).

**4.4 States.** Idle form · submitting (Submit shows spinner, disabled, all fields locked) · success toast · validation errors inline · server error banner. No loading-list / empty states (it's a form).

**4.5 Response payload (success).** `{ workerId, userId, membershipId, state: 'PENDING_ACTIVATION' }` — all uuids mono; navigate to `/hr/workers/:workerId` (Worker.id) on "Open worker".

---

### 5. Worker state machine — 15 states, chips + legend

Single source: `@axhy/state-machines` `workerMachine`. Chips use plain words + a legend block on the detail page. Color rule: **green only** for healthy/active; **amber only** for attention (at-risk/absent/blocked); everything procedural/terminal is neutral grey. Resignation/termination is neutral, not amber.

| State (exact)         | Plain-word chip     | Color rule                 | Meaning                                                          |
| --------------------- | ------------------- | -------------------------- | ---------------------------------------------------------------- |
| `INVITED`             | Invited             | neutral                    | Invite sent, not accepted.                                       |
| `PENDING_ACTIVATION`  | Activating          | neutral / light terracotta | Added by HR; awaiting OTP verify (entry state from Add Worker).  |
| `DOC_PENDING`         | Documents pending   | flagged-amber `#D97706`    | Needs documents. (OTP_VERIFIED transitions here, NOT to ACTIVE.) |
| `ACTIVE`              | Active              | verified-green `#059669`   | Working normally.                                                |
| `ON_LEAVE`            | On leave            | neutral grey               | Approved leave.                                                  |
| `ON_SUSPENSION`       | Suspended           | flagged-amber              | Suspended.                                                       |
| `ABSENT`              | Absent              | flagged-amber              | No-show / unexcused absence.                                     |
| `AT_RISK`             | At risk             | flagged-amber              | Flagged at-risk.                                                 |
| `BLOCKED`             | Blocked             | flagged-amber              | Blocked from work.                                               |
| `TRANSFER_PENDING`    | Transfer pending    | neutral                    | Transfer in progress.                                            |
| `INACTIVE`            | Inactive            | neutral grey               | Deactivated, reactivatable.                                      |
| `TERMINATION_PENDING` | Termination started | neutral grey               | Termination begun; resign/anonymise finalizes it.                |
| `TERMINATED`          | Terminated          | muted grey                 | Terminated (anonymise sets this).                                |
| `ARCHIVED`            | Archived            | muted grey                 | Archived after threshold.                                        |
| `ANONYMIZED`          | Anonymised          | muted grey                 | Final; PII scrubbed (`phone` = `anon:`, `userId` null).          |

**Legend block** (collapsible, detail page): three swatches — green "Healthy/active", amber "Needs attention", grey "Procedural/closed" — with the mapping above. No emoji; Lucide dot icons only.

---

### 6. Cross-cutting rules (apply to every screen above)

- **Money:** all `*Paise` int → display Rupees (`paise / 100`, `50000 → Rs 500`); inputs convert Rupees→paise (×100) before send. Mono on all money.
- **Dates/times:** dates `YYYY-MM-DD` over the wire → display en-IN `13 Jun 2026`; timestamps ISO → display en-IN `13 Jun 2026, 2:15 pm`.
- **Errors:** success = the object directly; error = `{error:'CODE',message?}` + HTTP status. Surfaced codes here: `QUERY_INVALID`/`CURSOR_INVALID`/`BAD_INPUT` 400, `WORKER_ALREADY_EXISTS`/`WORKER_ALREADY_TERMINATED`/`WORKER_NOT_PENDING_TERMINATION`/`ALREADY_DECIDED` 409, `WORKER_NOT_FOUND` 404, `401` no session, `403` wrong role.
- **No edit / no delete** affordances anywhere on audit, attendance, visits — append-only product reality.
- **Double-submit:** every write button disables for its full request lifecycle (no idempotency keys on worker/leave/membership writes).
- **Honesty tags:** EXISTS today = `GET /admin/workers`, `GET /admin/workers/:id`, `POST /admin/workers`, `POST /admin/workers/:id/anonymize`. Everything else (edit, transitions, assignments/attendance/visits/audit list endpoints, search/filter) is **NEW** and must render an empty/"Coming soon" state — never imply it exists.

---

Source files used (absolute paths): `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/admin-workers.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/admin-worker-service.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/worker.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/visit.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/leave-request.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/admin-workers.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` (models User L93, Membership L132, Worker L262, Visit L296, Assignment L376, LeaveRequest L528, AuditEvent L564, Attendance L715).

---

## Sites list + site detail (roster, supervisor bindings, QR) + add site + assignments

> HR portal area at **app.axhy.app/hr**. Desktop-first enterprise admin (dense tables, detail pages, queues); must also work at 375 px. Base API **`/v1`**. Auth context `req.auth = {userId, companyId, role, membershipId, epoch}`; the client **NEVER** sends `companyId`. WCAG AA. All endpoints below are tagged **EXISTS** (verified live) or **NEW** (build pending — render an empty/coming-soon state, never imply it works).

---

### 0. Area-wide ground rules (apply to every screen)

| Rule                        | Concrete behaviour                                                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth gate                   | `401 {error:'AUTH_REQUIRED'}` no session → bounce to login. `403` wrong role → "You don't have access to this."                                                                                                                                                                                                                  |
| Roles on these routes       | Sites read/write: **OWNER, HR**. Assignment create: **SUPERVISOR, HR**. Site→HR ownership: **OWNER only**.                                                                                                                                                                                                                       |
| HR site-anchoring           | HR sees **only sites where `Site.ownerHrUserId = my userId`**. An HR with no owned sites gets **genuinely empty lists by design** (founder-locked 2026-06-08, one-HR-per-worker, site-based — NOT pods). This is the _no-sites-assigned_ empty state, distinct from _zero-results_. OWNER sees all company sites.                |
| Tenant isolation            | Server sets Postgres GUC `axhy.current_company_id`; RLS FORCE on 27 tables; reads also `WHERE companyId = auth.companyId`. Cross-tenant id → opaque **404 `SITE_NOT_FOUND`** (never leak existence). Cross-HR site for an HR → same opaque **404**.                                                                              |
| Success shape               | The object **directly** (no envelope). Lists → `{items, nextCursor}`.                                                                                                                                                                                                                                                            |
| Error shape                 | `{error:'CODE', message?}` + HTTP status. Known codes: `QUERY_INVALID` 400, `CURSOR_INVALID` 400, `BAD_INPUT` 400, `SITE_NOT_FOUND` 404, `SUPERVISOR_NOT_FOUND` 404, `HR_NOT_FOUND` 404, `WORKER_NOT_FOUND` 404, `WORKER_DIFFERENT_HR` 409, `WOULD_SPLIT_WORKER` 409, `NOT_YOUR_SITE` 403, `AUTH_REQUIRED` 401.                  |
| Pagination                  | Cursor only: `?cursor&limit` (**limit ≤ 50, default 50**). Response `{items, nextCursor}`. `nextCursor=null` → last page. Order **`createdAt DESC, id DESC`**. Cursor is opaque base64url; pass back verbatim. Bad cursor → 400 `CURSOR_INVALID`.                                                                                |
| Dates / time                | Storage: dates `YYYY-MM-DD`, timestamps ISO. **Display en-IN**: `13 Jun 2026`, time `2:15 pm`.                                                                                                                                                                                                                                   |
| Money                       | Stored **paise int**; display Rupees: `50000 paise → Rs 500`. (No money in this area's primary objects; rule stands if salary is surfaced from Membership.)                                                                                                                                                                      |
| Audit                       | Every write appends an immutable `AuditEvent` (INSERT-only; `Company→AuditEvent` FK RESTRICT, migration 031). **No edit, no delete anywhere in the product.** UI must never show an Edit/Delete on already-committed audited rows except where a NEW edit endpoint is explicitly listed.                                         |
| Idempotency / double-submit | `withIdempotency` wraps ONLY complaints-reply, activity reverse/soft-flag, visit resolve/reject. **Site / binding / assignment writes have NO idempotency key** — they rely on DB unique constraints + state-machine guards. **The UI MUST disable the submit button for the full request duration and must not double-submit.** |
| Rate limit                  | Global 100 req/min/tenant + per-route Redis sliding window (fail-open). On 429 → "Too many requests, try again in a moment."                                                                                                                                                                                                     |

**Brand tokens (founder-locked, no exceptions).** Accent terracotta `#9A3412` (hover `#C2410C`) — the **single** accent; primary buttons, active nav, focus rings, key links. Bg cream `#FFFBEB`; ink `#0F172A`. Verified-green `#059669` **only** for positive/verified (e.g. ACTIVE assignment, geocoded). Flagged-amber `#D97706` **only** for flagged/attention (e.g. DRAFT pending, ungeocoded, flagged visit). Fonts: Inter (UI), Noto Sans Devanagari/Telugu (hi/te), mono for data labels/IDs/coords. Lucide icons, **no emoji**. Dense desktop tables, comfortable touch targets at 375 px.

**State chips (plain words, used everywhere):**

| Machine value                  | Chip label          | Colour                             | Meaning                                                                                                                                                 |
| ------------------------------ | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assignment `DRAFT`             | "Draft"             | amber `#D97706`                    | Created, not yet activated                                                                                                                              |
| Assignment `ACTIVE`            | "Active"            | green `#059669`                    | Confirmed, live                                                                                                                                         |
| Assignment `TERMINATED`        | "Ended"             | ink `#0F172A` 60% on grey          | Terminal, no further transitions                                                                                                                        |
| Site `state` (default `DRAFT`) | "Draft" / raw value | amber for DRAFT, neutral otherwise | 14-state SiteState; backend currently default-`DRAFT`. **Render the raw `state` string; do NOT invent labels for states the backend has not produced.** |

---

### 1. Sites list — `/hr/sites`

**1.1 Purpose & placement.** Landing screen of the HR portal Sites area; top-level left-nav item "Sites". Lists the sites this user can act on (HR: owned sites only; OWNER: all). Entry point to every site detail, add-site, and (from detail) assignments.

**1.2 Layout — desktop 1440 (primary).**

- Left nav rail (240 px): Sites (active), plus other HR areas (out of scope).
- Page header row: H1 "Sites" (Inter 24/semibold ink) · right-aligned primary button **"Add site"** (terracotta).
- Toolbar row: result count ("12 sites") · client-side text filter input (name/address — see 1.7). No server search endpoint exists.
- Data table, full width, dense (row height 44 px, 13 px body). Sticky header.
- Footer: **"Load more"** button (cursor pagination) — no page numbers.

**375 px note.** Header stacks; "Add site" becomes a full-width button under H1. Table collapses to stacked cards: line 1 site name + state chip; line 2 address (truncate 1 line); line 3 mono `workdays` + relative created date. Whole card tappable → detail.

**1.3 List columns** — `GET /admin/sites` **(EXISTS)** → `items[]`:

| Column       | Source (`Model.field`)                          | Type / values                                       | Notes                                                                                                                                                                                            |
| ------------ | ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site name    | `Site.name`                                     | string (1–120)                                      | Bold, links to detail. Primary click target.                                                                                                                                                     |
| State        | `Site.state`                                    | string, default `"DRAFT"` (14-state SiteState)      | Render as chip; amber if `DRAFT`, neutral otherwise. Show raw value.                                                                                                                             |
| Address      | `Site.address`                                  | string \| null (≤500)                               | Truncate to 1 line + tooltip. Null → em-dash "—".                                                                                                                                                |
| Location     | DERIVED from `Site.latitude` + `Site.longitude` | both Decimal(9,6) **returned as strings** or `null` | If both present: small green "Geocoded" tag + mono `lat, lng`. If either null: amber "No location". Backend returns `latitude`/`longitude` as **strings** (e.g. `"17.385044"`) or `null`.        |
| Workdays     | `Site.workdays`                                 | string `^[MTWFSU_]{7}$`, default `"MTWTFS_"`        | Mono. Render letters in green, `_` muted. Tooltip expands to weekday names (M=Mon, T=Tue, W=Wed, T=Thu, F=Fri, S=Sat, U=Sun). **Letter set is `MTWFSU_`** (U=Sunday) per the create-input regex. |
| Created      | `Site.createdAt`                                | ISO timestamp                                       | Display en-IN `13 Jun 2026`; tooltip full `13 Jun 2026, 2:15 pm`.                                                                                                                                |
| (row action) | —                                               | —                                                   | Chevron → detail. No inline edit/delete (audited, immutable).                                                                                                                                    |

> Fields **not** returned by the list and therefore not shown here: `ownerHrUserId`, `updatedAt` (the latter is in detail only).

**1.4 Actions**

| Action      | Method + path                                             | Req fields        | State machine | DB writes + AuditEvent | Idempotency / double-submit | Result UI                                         |
| ----------- | --------------------------------------------------------- | ----------------- | ------------- | ---------------------- | --------------------------- | ------------------------------------------------- |
| Open list   | `GET /admin/sites?cursor&limit` **(EXISTS)**              | query only        | none          | none (read)            | n/a                         | Renders table.                                    |
| Load more   | `GET /admin/sites?cursor=<nextCursor>&limit` **(EXISTS)** | `cursor`, `limit` | none          | none                   | n/a                         | Appends rows; hide button when `nextCursor=null`. |
| Add site    | navigate → `/hr/sites/new`                                | —                 | —             | —                      | —                           | Opens Add-site form (§4).                         |
| Open detail | navigate → `/hr/sites/:id`                                | —                 | —             | —                      | —                           | Site detail (§2).                                 |

**1.5 States**

- **Loading:** 6–8 skeleton rows (shimmer in cream/terracotta-tint), sticky header visible.
- **Empty — no sites assigned (HR):** illustration + "No sites assigned to you yet. Sites you own will appear here." Sub-line: "Ask your owner to assign you a site, or create one." Primary "Add site". _(This is the by-design HR-anchoring empty state — never an error.)_
- **Empty — zero results (filter):** "No sites match '<query>'." + "Clear filter".
- **Error + retry:** banner "Couldn't load sites." + **Retry** button (re-issues same request). On 401 → re-auth. On 429 → "Too many requests…".

**1.6 Filters / search / pagination.** No server-side search/filter endpoint. Text filter is **client-side over loaded rows only** (name + address substring, case-insensitive) — label it "Filter loaded sites" so users know it doesn't search un-loaded pages. Pagination is cursor-only as in 1.4; **never show page numbers or total-count-across-pages** (cursor pagination can't supply them; the "N sites" count reflects loaded rows).

---

### 2. Site detail — `/hr/sites/:id`

**2.1 Purpose & placement.** Single site's command center. Reached from Sites list. Five blocks: **Header**, **Roster** (workers + assignments), **Supervisor bindings**, **QR-code block**, **Recent visits**. Tabs on desktop; accordion sections on mobile.

**2.2 Layout — desktop 1440.**

- Breadcrumb: Sites / **<site name>**.
- **Header card** (full width): site name (H1) + state chip · address line · mono `lat, lng` (or amber "No location") · `workdays` strip · created/updated meta · right cluster of actions ("Edit site" NEW, "Assign worker", "Add supervisor binding"). Owner-only: "Site HR" control.
- **Tab bar** (terracotta active underline): Roster · Supervisors · QR code · Visits.
- Tab body fills below. Each list tab has its own toolbar + Load-more.

**375 px note.** Header card stacks vertically; action buttons become a full-width stacked group (primary "Assign worker" terracotta, rest secondary). Tabs become a horizontally-scrollable segmented control; bodies render as stacked cards.

**2.3 Header fields** — `GET /admin/sites/:id` **(EXISTS)**:

| Display label | Source               | Type / values                | Notes                                                                                                                                                                                                                                                                                                                                |
| ------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site name     | `Site.name`          | string                       | H1.                                                                                                                                                                                                                                                                                                                                  |
| State         | `Site.state`         | string default `DRAFT`       | Chip (amber if DRAFT).                                                                                                                                                                                                                                                                                                               |
| Address       | `Site.address`       | string \| null               | Null → "No address on file".                                                                                                                                                                                                                                                                                                         |
| Latitude      | `Site.latitude`      | string \| null (Decimal 9,6) | Mono.                                                                                                                                                                                                                                                                                                                                |
| Longitude     | `Site.longitude`     | string \| null               | Mono. Both null → amber "No location set" (blocks future geofence; informational only here).                                                                                                                                                                                                                                         |
| Workdays      | `Site.workdays`      | string (7-char)              | Mono strip; legend on hover.                                                                                                                                                                                                                                                                                                         |
| Created       | `Site.createdAt`     | ISO                          | en-IN.                                                                                                                                                                                                                                                                                                                               |
| Updated       | `Site.updatedAt`     | ISO                          | en-IN; **detail-only** (not in list).                                                                                                                                                                                                                                                                                                |
| Site HR owner | `Site.ownerHrUserId` | uuid \| null                 | **NOT returned by any GET endpoint.** The detail response (GET /admin/sites/:id) explicitly excludes it (route select() lines 141-151). To read the current owner name, a NEW read endpoint must be built. To assign the HR owner, use the OWNER-only PATCH /admin/sites/:id/hr action (§2.4) which returns the hrUserId on success. |

**2.4 Header actions**

| Action                 | Method + path                            | Req fields                                                                        | State machine    | DB writes + AuditEvent                               | Idempotency / double-submit                                   | Result UI                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit site              | `PATCH /admin/sites/:id` **(NEW)**       | `{name?, address?, latitude?, longitude?, workdays?}` (expected mirror of create) | none (Site here) | Site row update + `AuditEvent` (kind TBD by backend) | No idem key → **disable Save during request**; rely on server | Until built: "Edit site" opens form in **read-only "Coming soon"** state OR is hidden behind a feature flag. Never submit to an unbuilt route.                                                                                                                                                                                                                                                                 |
| Assign HR (OWNER only) | `PATCH /admin/sites/:id/hr` **(EXISTS)** | `{hrUserId: uuid \| null}` (null = unassign)                                      | none             | Site.ownerHrUserId set + audit (server)              | No idem key → disable button during request                   | Success `{siteId, hrUserId}` → toast "Site HR updated." Errors: 404 `SITE_NOT_FOUND`, 404 `HR_NOT_FOUND` ("That user is not an active HR in this company"), **409 `WOULD_SPLIT_WORKER`** → modal: "Reassigning this site would put a worker under two HRs. Move their other sites first." + lists returned `workerIds`. Needs an HR-picker; **no list-HRs endpoint is specified here** → picker source is NEW. |
| Assign worker          | navigate → assignment form (§5)          | —                                                                                 | —                | —                                                    | —                                                             | Opens Add-assignment with `siteId` prefilled.                                                                                                                                                                                                                                                                                                                                                                  |
| Add supervisor binding | navigate → binding form (§3 action)      | —                                                                                 | —                | —                                                    | —                                                             | Opens binding form with `siteId` prefilled.                                                                                                                                                                                                                                                                                                                                                                    |

---

### 3. Site detail · Supervisors tab (bindings)

**3.1 Purpose.** Who supervises this site, including temporary "acting" coverage. List + create. **No edit/delete** — corrections are new rows; the schema records `endedAt`/`endedReason` but **no terminate-binding endpoint is specified**, so the UI shows ended bindings read-only and offers no "end binding" button (would be NEW).

**3.2 List columns** — `GET /admin/sites/:id/bindings?cursor&limit` **(EXISTS)** → `items[]`:

| Column          | Source                                           | Type / values                      | Notes                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supervisor      | `supervisorName` (DERIVED, joined `User.name`)   | string \| null                     | Bold. Null → mono `supervisorUserId` fallback.                                                                                                                                                                    |
| Phone           | `supervisorPhone` (DERIVED, joined `User.phone`) | string \| null (E.164)             | Mono; tel: link on mobile.                                                                                                                                                                                        |
| Type            | DERIVED from `actingForUserId`                   | "Permanent" if null, else "Acting" | "Acting" tag in amber; "Permanent" neutral.                                                                                                                                                                       |
| Acting for      | `actingForUserId`                                | uuid \| null                       | uuid only — **no name join provided for the covered user**; show mono id or "—". A name lookup would be NEW.                                                                                                      |
| Effective from  | `effectiveFrom`                                  | ISO timestamp                      | en-IN date+time.                                                                                                                                                                                                  |
| Effective until | `effectiveUntil`                                 | ISO \| null                        | Null → "Open-ended". For acting it's always present.                                                                                                                                                              |
| Ended           | `endedAt`                                        | ISO \| null                        | Null → active row; non-null → "Ended <date>" chip.                                                                                                                                                                |
| Reason          | `reason`                                         | string (1–1000)                    | Truncate + tooltip. **This is the creation reason only.** The schema field `endedReason` (reason for early termination) exists but is NOT returned by this endpoint — a NEW read would be required to surface it. |
| Created         | `createdAt`                                      | ISO                                | en-IN.                                                                                                                                                                                                            |

> **NOT returned by this endpoint:** `createdBy` (exists in schema SiteSupervisorBinding.createdBy, but the route's select() does not project it). `endedReason` (exists in schema, not returned). To show "created by" or "ended reason", NEW reads must be built.

**3.3 Action — create binding**

| Field                           | Description                                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action                          | **Add supervisor binding**                                                                                                                                                                                                                                                          |
| Method + path                   | `POST /admin/sites/:id/bindings` **(EXISTS, roles OWNER + HR)**                                                                                                                                                                                                                     |
| Request fields                  | `{supervisorUserId: uuid (req), effectiveFrom: ISO datetime (req), effectiveUntil?: ISO datetime, actingForUserId?: uuid, reason: string 1–1000 (req)}`                                                                                                                             |
| Validation rule (client mirror) | If `actingForUserId` is set, **`effectiveUntil` is required** (Zod refine at admin-bindings.ts line 20). Enforce in form before enabling Submit.                                                                                                                                    |
| State machine                   | none (binding has no machine in this area).                                                                                                                                                                                                                                         |
| DB writes + Audit               | `SiteSupervisorBinding` INSERT + immutable `AuditEvent` (server).                                                                                                                                                                                                                   |
| Idempotency / double-submit     | **No idem key** → disable Submit for full request; do not double-submit. DB constraints + the HR-owns-site 404 guard backstop.                                                                                                                                                      |
| Result UI                       | Success `{bindingId}` → toast "Supervisor binding added." + prepend row. Errors: 400 `BAD_INPUT` (show `message`), 404 `SITE_NOT_FOUND` (cross-tenant / HR not owner — opaque), 404 `SUPERVISOR_NOT_FOUND` ("Supervisor with that userId is not an active member of this company"). |
| Picker note                     | `supervisorUserId` and `actingForUserId` need a **supervisor-of-this-company picker**; **no list endpoint is given here → picker source is NEW** (until then, a raw uuid field or coming-soon picker).                                                                              |

**3.4 States.** Loading: 5 skeleton rows. Empty (zero bindings): "No supervisors bound to this site yet." + "Add supervisor binding". Empty (HR not owner): handled as opaque **404** at site level (whole detail 404s, not this tab). Error + Retry banner.

---

### 4. Add site — `/hr/sites/new`

**4.1 Purpose.** Create a new site (state starts `DRAFT`). Single-column form, max-width 640 on desktop; full-width on mobile.

**4.2 Fields** — body for `POST /admin/sites` **(EXISTS)**:

| Field label | Source / key | Type / constraints                             | Required       | Notes                                                                                                                                                                                                                                                                   |
| ----------- | ------------ | ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site name   | `name`       | string, **1–120**                              | Yes            | Inline error if empty/over.                                                                                                                                                                                                                                             |
| Address     | `address`    | string, **≤500**                               | No             | Textarea, char counter.                                                                                                                                                                                                                                                 |
| Latitude    | `latitude`   | number, **−90…90**                             | No             | Decimal input; mono. If one of lat/lng given, prompt for the other (both needed to geocode).                                                                                                                                                                            |
| Longitude   | `longitude`  | number, **−180…180**                           | No             | Decimal input; mono.                                                                                                                                                                                                                                                    |
| Workdays    | `workdays`   | string `^[MTWFSU_]{7}$`, **default `MTWTFS_`** | No (defaulted) | 7-toggle weekday picker Mon→Sun; each toggle writes its letter (M,T,W,T,F,S,U order shown below) or `_`. **Letter alphabet `MTWFSU_`** per schema regex (Sun = U, NOT the assignment dayMask alphabet). Positions are Mon..Sun. Live mono preview of the 7-char string. |

> Weekday-letter mapping for **SITE workdays ONLY** (lock to backend regex `MTWFSU_`): position 1 Mon `M`, 2 Tue `T`, 3 Wed `W`, 4 Thu `T`, 5 Fri `F`, 6 Sat `S`, 7 Sun `U`. Default `MTWTFS_` = Mon–Sat on, Sun off. **CRITICAL: This is NOT the same as assignment dayMask**, which uses different letters (see §5.3 note). Do NOT reuse the same widget for both.

**4.3 Action**

| Action      | Method + path                    | Req fields | State machine                 | DB writes + Audit                     | Idempotency / double-submit                                                | Result UI                                                                                                                                              |
| ----------- | -------------------------------- | ---------- | ----------------------------- | ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create site | `POST /admin/sites` **(EXISTS)** | as 4.2     | Site enters `DRAFT` (default) | `Site` INSERT + `AuditEvent` (server) | **No idem key → disable "Create site" for full request, no double-submit** | Success `{siteId, state:'DRAFT'}` → toast "Site created." → navigate to `/hr/sites/:siteId`. Error 400 `BAD_INPUT` → show `message`, keep form values. |

**4.4 Edit site (NEW).** `PATCH /admin/sites/:id` is **NEW** (not built). The Edit form reuses 4.2 layout but is gated: render a **"Editing sites is coming soon"** read-only banner; do not POST/PATCH to it. When built, same fields, same `DRAFT`-safe double-submit handling, plus its own `AuditEvent`.

**4.5 States.** Loading (edit-prefill only): field skeletons. Submit in-flight: button spinner + disabled. Validation: inline per-field. Server error: top-of-form banner with `message`. No list empty-states (form, not list).

---

### 5. Site detail · Roster tab + Add assignment

**5.1 Purpose.** Workers assigned to this site and their assignment lifecycle. **Important:** the roster read endpoint `GET /admin/sites/:id/workers` is **NEW** (not built) — the Roster tab renders a **coming-soon empty state** until it exists. The **create-assignment** endpoint IS live, so "Assign worker" works and returns the created assignment, which the UI can optimistically show; but the persistent roster list is NEW.

**5.2 Roster list columns** — `GET /admin/sites/:id/workers` **(NEW)** (anticipated shape; must be confirmed when built):

| Column           | Source (anticipated)                           | Type / values                                | Notes                                                                                         |
| ---------------- | ---------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Worker           | `Worker.name`                                  | string                                       | Bold.                                                                                         |
| Phone            | `Worker.phone`                                 | string E.164                                 | Mono.                                                                                         |
| Worker state     | `Worker.state`                                 | string (15-state machine, default `INVITED`) | Chip; **render raw state**.                                                                   |
| Assignment       | `Assignment.dayMask` + `shiftStart`/`shiftEnd` | strings                                      | Mono `MTWTFS_ · 09:00–17:00`. **WARNING: dayMask uses different letters than site workdays.** |
| Valid            | `Assignment.validFrom` / `validUntil`          | dates \| null                                | "From 13 Jun 2026" / "13 Jun 2026 – open-ended".                                              |
| Assignment state | `Assignment.state`                             | `DRAFT \| ACTIVE \| TERMINATED`              | Chip: Draft amber / Active green / Ended grey.                                                |

**5.3 Add-assignment form** — `POST /assignments` **(EXISTS, roles SUPERVISOR + HR)**. Two variants via a toggle: **Recurring** (default) and **One-off**. `siteId` prefilled from detail.

**Recurring variant fields** (`CreateAssignmentRecurringInput`, `.strict()`):

| Field       | Key          | Type / constraints             | Required | Notes                                                                                                                                                                                                                                                                                              |
| ----------- | ------------ | ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker      | `workerId`   | uuid                           | Yes      | Picker (worker source is the existing HR worker list — outside this area).                                                                                                                                                                                                                         |
| Site        | `siteId`     | uuid                           | Yes      | Prefilled, read-only on this entry path.                                                                                                                                                                                                                                                           |
| Days        | `dayMask`    | string `^[MTWTFS_]{7}$`        | Yes      | 7-toggle Mon→Sun. **CRITICAL ALPHABET DIFFERENCE: Assignment dayMask uses `MTWTFS_` (NO U; Sunday position uses S, not U). This is NOT the same as site workdays which uses `MTWFSU_`.** Do NOT reuse the site-workdays widget letters; lock this form to the assignment regex. Live mono preview. |
| Shift start | `shiftStart` | string `^\d{2}:\d{2}$` (HH:mm) | Yes      | Time field; 24-h stored, display `9:00 am`.                                                                                                                                                                                                                                                        |
| Shift end   | `shiftEnd`   | string `^\d{2}:\d{2}$`         | Yes      | Same.                                                                                                                                                                                                                                                                                              |
| Valid from  | `validFrom`  | string (date)                  | Yes      | Date picker → `YYYY-MM-DD`.                                                                                                                                                                                                                                                                        |
| Valid until | `validUntil` | string \| null                 | No       | Empty → open-ended (null).                                                                                                                                                                                                                                                                         |

**One-off variant fields** (`CreateAssignmentOneOffInput`, `.strict()`):

| Field       | Key          | Type / constraints | Required | Notes                                                                                                                                                                                                                                                                                            |
| ----------- | ------------ | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker      | `workerId`   | uuid               | Yes      | Picker.                                                                                                                                                                                                                                                                                          |
| Site        | `siteId`     | uuid               | Yes      | Prefilled.                                                                                                                                                                                                                                                                                       |
| Date        | `oneOffDate` | string (date)      | Yes      | Single-day. Backend auto-fills `validFrom = validUntil = oneOffDate` and computes `dayMask` from the date's weekday using the assignment alphabet (assignment.ts `dayMaskFromDate`, lines 31-37). **Do NOT send `dayMask`/`validFrom`/`validUntil`** — schema is `.strict()`, extra keys reject. |
| Shift start | `shiftStart` | HH:mm              | Yes      |                                                                                                                                                                                                                                                                                                  |
| Shift end   | `shiftEnd`   | HH:mm              | Yes      |                                                                                                                                                                                                                                                                                                  |

**5.4 Assignment actions**

| Action               | Method + path                               | Req fields                            | State machine (from→to)                               | DB writes + Audit                                                                                                     | Idempotency / double-submit                                                                                | Result UI                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create assignment    | `POST /assignments` **(EXISTS)**            | recurring or one-off (5.3)            | creates at **`DRAFT`**                                | `Assignment` INSERT + `AuditEvent kind ASSIGNMENT_CREATED` (payload: workerId, workerName, siteId, siteName, dayMask) | **No idem key → disable Submit for full request, no double-submit**; DB + one-worker-one-HR guard backstop | Success 200 `{id, state:'DRAFT', dayMask, validFrom, validUntil}` → toast "Assignment created (Draft)." Errors: 400 `BAD_INPUT` (`message`), **403 `NOT_YOUR_SITE`** ("You can only assign workers to sites you own."), 404 `WORKER_NOT_FOUND`, 404 `SITE_NOT_FOUND`, **409 `WORKER_DIFFERENT_HR`** ("This worker already belongs to a different HR. Reassign their sites first.") |
| Activate assignment  | `POST /assignments/:id/activate` **(NEW)**  | path id                               | **`DRAFT → ACTIVE`**                                  | Assignment.state update + `AuditEvent` (server, TBD)                                                                  | No idem key → disable during request                                                                       | Until built: show "Activate" disabled with "Coming soon" tooltip; never call. When built: chip flips amber→green. Guard: only from `DRAFT` (else 409 `ALREADY_TERMINAL`-class).                                                                                                                                                                                                    |
| Terminate assignment | `POST /assignments/:id/terminate` **(NEW)** | path id (+ likely `terminatedReason`) | **`DRAFT → TERMINATED`** or **`ACTIVE → TERMINATED`** | Assignment.state + `terminatedReason` + `terminatedBy` (Membership) + audit (server, TBD)                             | No idem key → disable during request                                                                       | Until built: "End assignment" disabled + "Coming soon". When built: confirm modal (reason), chip → grey "Ended". `TERMINATED` is terminal — no further actions.                                                                                                                                                                                                                    |

**5.5 Assignment state machine (authoritative).** 3 states. Allowed: `DRAFT→ACTIVE`, `DRAFT→TERMINATED`, `ACTIVE→TERMINATED`. `TERMINATED` is terminal. Disallowed transitions must not be offered (e.g. no Active→Draft, no reopen). Chips: Draft (amber) → Active (green) → Ended (grey). Create-only is live today; activate/terminate are **NEW**.

**5.6 States (Roster tab).** Loading: skeleton rows. **Coming-soon empty (roster endpoint NEW):** "Roster view is coming soon. You can still assign workers using the button above." + enabled "Assign worker". **Empty (when built, zero workers):** "No workers assigned to this site yet." + "Assign worker". Error + Retry. The opaque cross-HR / cross-tenant case 404s the whole detail page, not the tab.

---

### 6. Site detail · QR code block — `/hr/sites/:id` (QR tab)

**6.1 Purpose.** Screen view + print sheet of the site's QR (used by workers/supervisors to check in on site). **The QR derive/print endpoint is NEW.** Until built, render a **coming-soon** placeholder; never display a fake/derived QR that the backend doesn't authoritatively produce.

**6.2 Layout — screen.** Centered card: large QR placeholder (square, with terracotta frame on render), below it site name + mono `siteId`, "Download PNG" + "Print sheet" (both NEW-gated). Helper text: "Workers scan this to check in at <site name>."

**6.3 Layout — print sheet.** A4/Letter print stylesheet: large QR, site name (large), address, `workdays` legend, generated-on date (en-IN). Cream→white for print (ink on white), mono `siteId` small in footer. No nav chrome in print.

**6.4 Fields**

| Display label   | Source                                       | Type          | Notes                                                                             |
| --------------- | -------------------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| QR image        | `GET /admin/sites/:id/qr` (derive) **(NEW)** | image/payload | Coming-soon until built. **Do not generate client-side and imply it's official.** |
| Site name       | `Site.name` (from detail)                    | string        |                                                                                   |
| Site id         | `Site.id`                                    | uuid          | Mono, small.                                                                      |
| Address         | `Site.address`                               | string\|null  | Print only.                                                                       |
| Workdays legend | `Site.workdays`                              | string        | Print only.                                                                       |

**6.5 Actions.** "Download QR" / "Print sheet" → both **NEW**; disabled + "Coming soon" tooltip. Print uses browser print of the print stylesheet once the QR payload exists.

---

### 7. Site detail · Recent visits tab

**7.1 Purpose.** Latest visits at this site (read-only audit context for HR). **No site-scoped visits endpoint is provided in this area's verified set → this tab is NEW.** Render coming-soon. (Anticipated source: `Visit` filtered by `siteId`.)

**7.2 Anticipated columns** (NEW — confirm when built): Worker (`Visit.worker`/`Worker.name`), Scheduled (`Visit.scheduledFor`, en-IN), State (`Visit.state`, 12-state chip), Flagged (`Visit.flagged` → amber "Flagged" tag **only** when true), Photos (`photosBefore`/`photosAfter` counts). Verified-green reserved for verified/positive states; flagged-amber only for `flagged=true`.

**7.3 States.** Coming-soon empty until endpoint built; then loading skeleton / zero-visits empty ("No visits recorded at this site yet.") / error+Retry, cursor pagination as §0.

---

### 8. Design notes (locked terracotta/paper brand)

| Element               | Treatment                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single accent         | Terracotta `#9A3412` (hover `#C2410C`): primary buttons ("Add site", "Create site", "Assign worker", "Add supervisor binding"), active tab underline, active nav, focus ring, primary links. Exactly one accent — secondary actions are ghost/outline ink.          |
| Green `#059669`       | **Only** positive/verified: Active assignment chip, "Geocoded" tag, verified visit states. Never decorative.                                                                                                                                                        |
| Amber `#D97706`       | **Only** flagged/attention: Draft chip, "No location"/"Acting"/"Coming soon" tags, `flagged=true` visits, the `WOULD_SPLIT_WORKER`/`WORKER_DIFFERENT_HR` warning modals.                                                                                            |
| Background / ink      | Cream `#FFFBEB` page; white cards/tables; ink `#0F172A` text; muted ink for secondary.                                                                                                                                                                              |
| Density               | Desktop dense tables (44 px rows, 13 px body, sticky headers, zebra optional in 4% ink tint). 375 px: stacked cards, ≥44 px touch targets, full-width primary buttons.                                                                                              |
| Typography            | Inter for UI; mono for IDs, coordinates, `workdays`/`dayMask`, phone, times; Noto Sans Devanagari/Telugu when locale hi/te.                                                                                                                                         |
| Icons                 | Lucide only (MapPin, QrCode, Users, ShieldCheck, Plus, ChevronRight…). **No emoji.**                                                                                                                                                                                |
| Immutability cue      | No edit/delete affordances on audited committed rows. Where an action is impossible by design (ended assignment, immutable binding), show the state, not a disabled-but-present button — except NEW endpoints, which use the explicit "Coming soon" disabled style. |
| EXISTS vs NEW honesty | NEW surfaces (Edit site, activate/terminate assignment, roster list, QR, visits, HR-name/supervisor pickers) render visibly as **"Coming soon"** and never POST/PATCH to unbuilt routes.                                                                            |

---

### 9. EXISTS / NEW endpoint ledger (authoritative for this area)

| Endpoint                                      | Status                                                                         | Roles          |
| --------------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| `GET /admin/sites?cursor&limit≤50`            | **EXISTS**                                                                     | OWNER, HR      |
| `GET /admin/sites/:id`                        | **EXISTS**                                                                     | OWNER, HR      |
| `GET /admin/sites/:id/bindings?cursor&limit`  | **EXISTS**                                                                     | OWNER, HR      |
| `POST /admin/sites`                           | **EXISTS**                                                                     | OWNER, HR      |
| `POST /admin/sites/:id/bindings`              | **EXISTS**                                                                     | OWNER, HR      |
| `PATCH /admin/sites/:id/hr`                   | **EXISTS**                                                                     | OWNER only     |
| `POST /assignments` (recurring + one-off)     | **EXISTS**                                                                     | SUPERVISOR, HR |
| `PATCH /admin/sites/:id` (edit)               | **NEW**                                                                        | —              |
| `GET /admin/sites/:id/workers` (roster)       | **NEW**                                                                        | —              |
| `POST /assignments/:id/activate`              | **NEW**                                                                        | —              |
| `POST /assignments/:id/terminate`             | **NEW**                                                                        | —              |
| Site QR derive/print                          | **NEW**                                                                        | —              |
| Site-scoped visits list                       | **NEW**                                                                        | —              |
| List HRs (HR-picker source)                   | **NEW**                                                                        | —              |
| List/pick supervisors (binding-picker source) | **NEW**                                                                        | —              |
| Read current site HR owner / owner name       | **NEW** (detail GET omits `ownerHrUserId`; PATCH /hr returns it on write only) | —              |

---

**Files used as ground truth (all absolute):**

- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/admin-sites.ts`
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/assignments.ts`
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/assignment-service.ts`
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/assignment.ts`
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` (models Site, Assignment, SiteSupervisorBinding, Worker, User)
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/admin-sites.ts`, `admin-bindings.ts`, `assignment.ts`

**Three critical alphabet/field discrepancies the designer must respect (backend wins):**

1. **`workdays` alphabet (`MTWFSU_`, Sun=`U`) differs from assignment `dayMask` alphabet (`MTWTFS_`, no `U`).** They are NOT the same widget — do not share letter mapping. Site uses U; assignment uses S for Sunday position.
2. **Binding list does NOT return `createdBy` or `endedReason`** even though both schema fields exist. The response only returns the creation `reason`. These fields exist in the DB but are not surfaced by the current endpoint — NEW reads required to show them.
3. **No idempotency keys** on site/binding/assignment writes → the UI MUST disable each submit button for the full request and never double-submit (DB constraints + state-machine guards are the only backstop).

---

## Leave queue + detail + approve/reject (FULLY BACKED)

**Area scope:** The HR operator's leave-decision surface inside `app.axhy.app/hr`. Three connected surfaces: (a) the **Leave queue** (pending REQUESTED leaves for HR-owned sites), (b) the **Review sheet** (side panel desktop / bottom sheet mobile — the reusable decision pattern), (c) the **History tab** (decided leaves). Backend is authoritative; every field/action below is quoted exactly from the routes, service, state machine, and schema. `companyId` is NEVER sent by the client — it is derived from `req.auth`.

---

### 0. Critical backend truths that shape this UI (read before designing)

| Truth                                                                                                                                                                                                                                                                                   | Design consequence                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HR is site-anchored, NOT pod-based.** `getHrSiteIds()` returns sites where `Site.ownerHrUserId = me`. HR sees only workers with an `Assignment(state ACTIVE\|DRAFT)` to those sites.                                                                                                  | If HR owns **no sites**, every list is **empty by design** (not an error). This is a distinct empty state ("no sites assigned to you yet") vs. "queue is clear."                                                                                                             |
| **The queue endpoint returns ONLY `state='REQUESTED'`.**                                                                                                                                                                                                                                | The queue is a pure pending-inbox. Decided items vanish from the queue the moment they're decided and reappear only in History (NEW).                                                                                                                                        |
| **Two terminal states.** Machine: `REQUESTED → APPROVED \| REJECTED`. Both terminal. Re-decide → **409 `ALREADY_DECIDED`** with `{state}`.                                                                                                                                              | No "undo/edit/delete" action exists anywhere. A wrongly-decided leave is a constitutional dead-end; surface the terminal state, no edit affordance.                                                                                                                          |
| **No idempotency key on leave writes.** Relies on DB unique constraints + state-machine guard + conditional `updateMany WHERE state='REQUESTED'`.                                                                                                                                       | The submit button MUST be disabled for the entire request duration. No optimistic double-fire. On 409, the loser sees the actual terminal state.                                                                                                                             |
| **Reject requires a reason; approve does not.** Route returns **400 `REASON_REQUIRED`** if reject body has empty/missing reason.                                                                                                                                                        | Reason textarea is `required` only on the Reject path. Approve can submit with empty reason.                                                                                                                                                                                 |
| **Approve has heavy side effects.** Writes `LeaveRequest` + N×`Attendance` (`ABSENT_APPROVED_LEAVE`, `payDeductPaise 0`, 1/day, idempotent on `workerId_date`) + `AuditEvent(LEAVE_APPROVED)` + `Outbox(worker.leave_approved)` + `Outbox(payroll.recompute)` per month. All in one tx. | Approve confirmation copy should state plainly: "These days will be marked approved leave (no pay deduction) and payroll will be recalculated." Reject writes only the row + audit + `worker.leave_rejected` outbox.                                                         |
| **Detail exposes `workerName`, `workerPhone`; queue list does NOT.**                                                                                                                                                                                                                    | The queue card shows `workerId` only from the list payload — to show a worker name in the queue you must either (a) accept the id, or (b) open the sheet (which has the name). Do NOT fabricate a name column on the queue from the list endpoint. See §2 column table note. |
| **`decidedBy` is a User.id (UUID), not a name.** Detail returns the raw UUID; there is **no name-resolution endpoint wired**.                                                                                                                                                           | History/detail "Decided by" shows the UUID or "You" (if `decidedBy === auth.userId`); a friendly name is **NEW** (coming-soon). Never render a fake name.                                                                                                                    |
| **Conflict hint is DERIVED/NEW.** No backend field flags overlapping leaves or roster gaps.                                                                                                                                                                                             | The "conflict hint" chip on a queue card is **NEW** — render nothing until the supporting endpoint exists. Do not imply it's live.                                                                                                                                           |

---

### 1. Leave queue — purpose & placement

**Purpose:** HR's pending-decision inbox. One scannable list of every `REQUESTED` leave for workers assigned to the HR's owned sites, newest first. Primary job: triage and decide fast without losing context.

**Placement:** `/hr/leave` → default tab **"Pending"**. Sibling tab **"History"** (§5). Sits in the HR portal left-nav under a "People / Leave" group. The queue is the landing surface for the leave area.

**Layout — desktop 1440 (primary):**

- Two-pane shell. **Left rail (fixed):** portal nav (Lucide icons + mono labels). **Main column:** page header → tab bar (Pending | History) → filter/refresh row → the queue list.
- Queue renders as a **dense card-list** (not a grid table) at ~720px content width, leaving the right ~440px for the **review side-panel** to slide in over/beside the list (panel does not push layout; it overlays with a scrim on the list only, nav stays put).
- Card height ~88px, 8px gap, hairline `#0F172A`@8% dividers. Hover raises card with a 1px terracotta left-border accent.

**Layout — 375 mobile note:** Single column, full-bleed cards (16px gutters). Tab bar becomes a 2-segment control pinned under the header. Tapping a card opens the review **bottom sheet** (§4) at 92% height with a drag handle. Filter/refresh collapses into a single icon-button row. Cards reflow: dates wrap under worker line; the "Pending" chip sits top-right.

---

### 2. Queue card — data fields & list columns

**Source list endpoint (EXISTS):** `GET /v1/leave-requests?cursor&limit` (`requireAuth` + `requireRole('HR')`). Returns `{ items, nextCursor }`. Each item shape is exactly:

| Display label | Source (Model.field)               | Type / enum             | Notes                                                                                                                                                                                                                      |
| ------------- | ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (row key)     | `LeaveRequest.id`                  | UUID                    | Card key; passed to detail/decision calls. Not shown.                                                                                                                                                                      |
| Worker        | `LeaveRequest.workerId`            | UUID                    | List payload has **only the id**. Show as a worker avatar-initial chip + truncated id, OR resolve name lazily via the detail call on open. Do NOT invent a name column from this endpoint. Name is available in §4 detail. |
| Leave dates   | `LeaveRequest.fromDate` → `toDate` | `YYYY-MM-DD` each       | Display en-IN range: `13 Jun 2026 – 15 Jun 2026`. If `fromDate === toDate`, show single date `13 Jun 2026 (1 day)`.                                                                                                        |
| Days          | DERIVED from `fromDate`,`toDate`   | int                     | `floor((toDate−fromDate)/1day)+1`. Inclusive. Show `· 3 days`. Client-derived; matches backend `spanDays` math.                                                                                                            |
| Reason        | `LeaveRequest.reason`              | string (worker's words) | 1-line clamp (ellipsis). Full text in sheet. This is the **worker's** reason, not a decision note.                                                                                                                         |
| Status        | `LeaveRequest.state`               | enum `REQUESTED`        | Always `REQUESTED` in this list. Chip label "Pending" (see §6).                                                                                                                                                            |
| Requested     | `LeaveRequest.createdAt`           | ISO timestamp           | Display en-IN relative + absolute on hover: `2 hours ago` / title `13 Jun 2026, 2:15 pm`. Drives sort.                                                                                                                     |
| Conflict hint | DERIVED / **NEW**                  | —                       | Roster-overlap/coverage-gap warning chip. **Not backed** — render nothing now; reserve the slot. Never imply it's live.                                                                                                    |

**List columns (if rendered as a table at ≥1200px instead of cards — optional dense mode):** Worker (id/name) · Dates · Days · Reason (clamped) · Requested · Status chip · row-click → sheet. Order is **fixed `createdAt DESC, id DESC`** (server-ordered; do NOT client re-sort in a way that breaks cursor paging).

---

### 3. Queue — actions, states, pagination

**Row action:**

| Action      | Method + path                                              | Request         | Transition  | DB writes + Audit | Idempotency / double-submit | Result UI                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------- | --------------- | ----------- | ----------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open review | `GET /v1/leave-requests/:id` (**EXISTS**, `HR,SUPERVISOR`) | path `:id` only | none (read) | none              | n/a (GET)                   | Sheet/bottom-sheet slides in with full detail (§4). On 404 `LEAVE_NOT_FOUND` → toast "This leave is no longer in your queue" + refresh list (worker may have been unassigned, or already decided). |

There is **no inline approve/reject on the card** — decisions happen in the sheet only (forces the operator to see worker context + reason before deciding). This is intentional, not a missing feature.

**Pagination (cursor — exact):**

- Query params: `cursor` (opaque base64url of `<ISO createdAt>:<uuid id>`), `limit` (int 1–100, default 20).
- Client sends `?limit=20`; on "Load more" (or infinite scroll sentinel) re-request with `?cursor=<nextCursor>&limit=20`.
- Stop when `nextCursor === null`.
- **400 `QUERY_INVALID`** → malformed limit; **400 `CURSOR_INVALID`** → bad cursor (treat as "reload from top", clear cursor).
- Cursor is opaque — never parse/construct it client-side.

**Filters / search:** The live queue endpoint accepts **only** `cursor` + `limit`. There is **no server search, no date filter, no worker filter on the pending queue.** Any search box is **NEW/client-only** (filter the loaded page in memory) and must be labelled as filtering the current page, not querying the server. Do not render server-filter chips that don't exist.

**States:**

- **Loading skeleton:** 6 card-shaped shimmer rows (88px), mono-label placeholders, terracotta-tint pulse at 8% opacity.
- **Empty state A — no owned sites:** Icon (Lucide `map-pin-off`), heading "No sites assigned to you", body "You'll see leave requests here once a site is assigned to you." This is the `getHrSiteIds() === []` case — **not** an error. Plain words, no retry button.
- **Empty state B — queue clear:** Icon (Lucide `check-circle`, verified-green allowed here as a positive state), heading "All caught up", body "No pending leave requests right now." Subtle, calm.
- **Error + retry:** Network/5xx → inline banner (ink text, no red unless truly destructive — use neutral) "Couldn't load leave requests" + "Try again" button (re-fires the list call). 401 → session-expired → route to login. 403 → "You don't have access to leave requests" (role gate).

---

### 4. Review sheet — THE REUSABLE DECISION PATTERN (spec thoroughly)

This is the canonical AXHY decision surface; swaps, complaints, and reversals reuse this exact skeleton (header → context block → primary record → reason field → dual decision footer). Spec it as a component, not a one-off.

**Purpose:** Show the full leave record + worker context, capture an optional/required decision reason, and commit Approve or Reject in one safe action.

**Placement & form factor:**

- **Desktop:** right-anchored **side panel**, 440px wide, full viewport height, slides in (200ms ease), scrim over the list only. Sticky header + sticky decision footer; middle scrolls.
- **Mobile 375:** **bottom sheet**, 92% height, drag handle, sticky footer above the home indicator; backdrop scrim full-screen.

**Source (EXISTS):** `GET /v1/leave-requests/:id` returns exactly:

| Display label   | Source (Model.field)                           | Type / enum                          | Notes                                                                                                                                   |
| --------------- | ---------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| (id)            | `id`                                           | UUID                                 | Internal; small mono caption "Leave #<short8>" optional.                                                                                |
| Worker name     | `workerName` (← `Worker.name`)                 | string                               | Sheet header title.                                                                                                                     |
| Worker phone    | `workerPhone` (← `Worker.phone`)               | E.164 string                         | Secondary line; tap-to-call on mobile (`tel:`). Mono.                                                                                   |
| (worker id)     | `workerId`                                     | UUID                                 | Not displayed; used internally.                                                                                                         |
| Leave from      | `fromDate`                                     | `YYYY-MM-DD`                         | Display `13 Jun 2026`.                                                                                                                  |
| Leave to        | `toDate`                                       | `YYYY-MM-DD`                         | Display `15 Jun 2026`.                                                                                                                  |
| Days            | DERIVED                                        | int                                  | Inclusive span, same formula as queue.                                                                                                  |
| Worker's reason | `reason` (← `LeaveRequest.reason`)             | string                               | The worker's stated reason. Read-only block, full text. Label it clearly "Worker's reason" to distinguish from the decision note field. |
| Status          | `state`                                        | enum `REQUESTED\|APPROVED\|REJECTED` | Chip (§6). In the queue path it's always `REQUESTED`; opening from History it may be terminal → footer becomes read-only.               |
| Decided by      | `decidedBy`                                    | UUID \| null                         | Null while REQUESTED. When terminal: show "You" if `=== auth.userId`, else the UUID (friendly-name resolution is **NEW**).              |
| Decided at      | `decidedAt`                                    | ISO \| null                          | Null while REQUESTED. Display en-IN `13 Jun 2026, 2:15 pm`.                                                                             |
| Decision note   | `decisionNote` (← `LeaveRequest.decisionNote`) | string \| null                       | The decider's reason. Shown read-only when terminal; this is the input field's persisted value.                                         |
| Requested       | `createdAt`                                    | ISO                                  | `13 Jun 2026, 2:15 pm`.                                                                                                                 |

**Worker context block (DERIVED / partly NEW):** A small context strip (site assignment, recent attendance) would strengthen the decision but is **NOT in this endpoint**. Worker site/attendance context is **NEW** — render a "coming soon" placeholder or omit; do not fabricate. Only `workerName` + `workerPhone` are real worker context here.

**Decision reason field:**

| Property | Value                                                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Label    | "Reason for your decision"                                                                                                                     |
| Maps to  | `reason` in request body (route prefers `reason`, falls back to `note`). Sent as `decisionNote` on the row + `decisionReason` in audit/outbox. |
| Required | **Only on Reject.** Empty reject → blocked client-side AND server returns 400 `REASON_REQUIRED`. Approve may submit empty.                     |
| Helper   | On Reject: "Required — the worker will see why." On Approve: "Optional."                                                                       |

**Actions (the two decisions):**

| Action      | Method + path                                                                                                                                  | Request body                | Transition (machine)   | DB tables + AuditEvent kind                                                                                                                                                                                                                                                                                                                                              | Idempotency / double-submit                                                                                           | Result UI                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approve** | `POST /v1/leave-requests/:id/approve` (**EXISTS**, `HR,SUPERVISOR`; HR must own a site the worker is assigned to else **403 `NOT_YOUR_SITE`**) | `{ reason? }` (optional)    | `REQUESTED → APPROVED` | `LeaveRequest`(state,decidedBy,decidedAt,decisionNote via conditional `updateMany WHERE state='REQUESTED'`) + **N×`Attendance`** upsert (`status='ABSENT_APPROVED_LEAVE'`, `payDeductPaise=0`, 1/day, idempotent on `workerId_date`) + `AuditEvent` kind **`LEAVE_APPROVED`** + `Outbox` `worker.leave_approved` + `Outbox` `payroll.recompute` (per affected `YYYY-MM`) | **No idempotency key.** Disable button + show spinner for full request. Server's conditional update is single-winner. | On 200: sheet shows success state → "Leave approved", chip flips to "Approved" (verified-green allowed), footer collapses to read-only, card removed from Pending list. Optional confirm-dialog first: "Mark 3 days as approved leave? No pay will be deducted and payroll recalculates." |
| **Reject**  | `POST /v1/leave-requests/:id/reject` (**EXISTS**, same gate)                                                                                   | `{ reason }` (**REQUIRED**) | `REQUESTED → REJECTED` | `LeaveRequest`(state,decidedBy,decidedAt,decisionNote) + `AuditEvent` kind **`LEAVE_REJECTED`** + `Outbox` `worker.leave_rejected`. **No Attendance, no payroll outbox.**                                                                                                                                                                                                | Same — disable button, single in-flight request.                                                                      | On 200: "Leave rejected", chip flips to "Rejected" (neutral/ink, NOT red-destructive — it's a valid outcome), reason shown as the decision note, card removed from Pending.                                                                                                               |

**Success response shape (both):** `{ ok:true, leaveRequestId, workerId, state:'APPROVED'|'REJECTED', decidedBy, decidedAt }`. Use `state` + `decidedAt` to update the sheet without a refetch.

**Sheet error handling (exact codes):**

| HTTP | `error` code                  | Trigger                                                 | UI                                                                                                                                                                      |
| ---- | ----------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `REASON_REQUIRED`             | Reject with empty reason                                | Inline field error "Add a reason to reject." Re-enable submit. (Client should pre-block this.)                                                                          |
| 400  | `BAD_INPUT`                   | Malformed body                                          | "Something's off with that input." Re-enable.                                                                                                                           |
| 403  | `SUPERVISOR_OR_HR_REQUIRED`   | Wrong role                                              | "You don't have permission to decide leave." Close sheet.                                                                                                               |
| 403  | `NOT_YOUR_SITE`               | HR not owning a site the worker is assigned to          | "This worker isn't on a site you manage." Close + refresh queue.                                                                                                        |
| 403  | `NOT_RESPONSIBLE`             | (SUPERVISOR path) not the responsible supervisor        | "You're not the responsible supervisor for this worker." (HR rarely hits this.)                                                                                         |
| 404  | `LEAVE_NOT_FOUND`             | id wrong / cross-tenant / unassigned                    | "This leave is no longer available." Close + refresh.                                                                                                                   |
| 409  | `ALREADY_DECIDED` (`{state}`) | Re-decide an already-terminal leave (race or stale tab) | **Key state:** show "Already <state> by someone else" banner, flip chip to the returned `state`, replace footer with read-only outcome, disable both buttons. No retry. |
| 500  | `INTERNAL`                    | Server error                                            | "Couldn't save your decision. Try again." Re-enable button (safe — DB guard prevents double-apply).                                                                     |

**Double-submit rule (non-negotiable, from idempotency reality):** From `onSubmit` until response resolves, BOTH Approve and Reject buttons are `disabled` and the active one shows an inline spinner. No leave/swap/membership write is Redis-idempotent — the UI is the first line of defense against a duplicate POST. Never allow Enter-key or rapid double-tap to fire twice.

**Sheet states:**

- **Loading (detail fetch):** sheet opens immediately with a skeleton (header line, date block, reason block shimmer). Footer buttons disabled until detail loads.
- **Ready (REQUESTED):** full record + active reason field + Approve/Reject footer.
- **Terminal (opened from History, APPROVED/REJECTED):** read-only. Show `decidedBy`/`decidedAt`/`decisionNote`. Footer shows the outcome chip, no action buttons.
- **Submitting:** buttons disabled, spinner on active button.
- **Decided (just acted):** inline success, chip flipped, card leaves the Pending list.
- **Error:** per table above.

---

### 5. History tab

**Purpose:** Audit-friendly record of decided leaves (APPROVED + REJECTED) for HR-owned sites. Read-only.

**Status: NEW.** The history list endpoint `GET /v1/leave-requests?state=APPROVED|REJECTED` is **not yet built** (the live `GET /leave-requests` hard-codes `state:'REQUESTED'`). Until shipped, the History tab renders a **coming-soon empty state** — heading "Decided leave history is coming soon", body "Approved and rejected leaves will appear here." Do NOT wire it to the pending endpoint and do NOT imply it works.

**When built (spec for the designer to design against — all marked NEW):**

- Same card/column shape as the queue, plus: **Outcome** chip (Approved verified-green / Rejected ink-neutral), **Decided by** (`decidedBy`, "You" or UUID; friendly name NEW), **Decided at** (`decidedAt`, en-IN), **Decision note** (`decisionNote`, clamped).
- **Filter (NEW):** segmented `All | Approved | Rejected` → maps to `?state=` param. Plus the same `cursor`/`limit` cursor pagination, ordered `createdAt DESC, id DESC`.
- Row → opens the same review sheet in **read-only terminal mode** (§4).
- Empty states: "No approved leaves yet" / "No rejected leaves yet" / no-owned-sites (same as queue A).

---

### 6. State chips — machine states → plain words (founder voice)

| `LeaveRequest.state` | Chip label (plain) | Color                                                                         | Where                 |
| -------------------- | ------------------ | ----------------------------------------------------------------------------- | --------------------- |
| `REQUESTED`          | **Pending**        | Neutral ink outline on cream; subtle                                          | Queue, sheet (active) |
| `APPROVED`           | **Approved**       | **Verified-green `#059669`** (allowed — positive)                             | Sheet, History        |
| `REJECTED`           | **Rejected**       | Ink `#0F172A` neutral outline (NOT red — it's a valid decision, not an error) | Sheet, History        |

Plain-words rule: never show raw `REQUESTED`/`APPROVED`/`REJECTED` enum strings to the operator; map to Pending/Approved/Rejected. The terminal-409 banner reuses the same chip for the returned `state`.

---

### 7. Brand & design notes (founder-locked — no exceptions)

- **Palette:** cream bg `#FFFBEB`; ink text `#0F172A`; ONE accent terracotta `#9A3412` (hover `#C2410C`). Verified-green `#059669` ONLY on positive/verified (Approved chip, "All caught up" check). Flagged-amber `#D97706` ONLY for attention (reserved for the NEW conflict hint when built — never decorative). Reject is **neutral ink, not red** — red is reserved for truly destructive/irreversible danger, and a reject is a legitimate outcome.
- **The ONE accent goes on:** the primary **Approve** button (terracotta fill, cream text), the active tab underline, card hover left-border, and focus rings. **Reject** is a secondary/outline button (ink border, cream fill) — equal weight in layout but not accent-colored, so Approve is the visually primary path without hiding Reject.
- **Density:** desktop-first enterprise — dense cards (88px), hairline dividers at ink@8%, tight 8px rhythm, generous but not airy. Must hold at 375px (cards reflow, sheet → bottom sheet). WCAG AA contrast on all text (ink-on-cream passes; terracotta-on-cream for body text must be ≥4.5:1 — use ink for body, terracotta for accents/large only).
- **Typography:** Inter for UI; Noto Sans Devanagari/Telugu when worker content renders in hi/te (worker reason may be non-Latin — the reason block MUST support Devanagari/Telugu rendering); a **mono** face for data labels (IDs, phone numbers, dates-as-data, `decidedBy` UUID, `Leave #<short8>`).
- **Icons:** Lucide only, no emoji (`map-pin-off`, `check-circle`, `calendar`, `user`, `phone`, `clock`, `chevron-right`).
- **Money:** none surfaced directly in this area, but where pay impact is mentioned (approve confirm copy), state "no pay will be deducted" — backed by `Attendance.payDeductPaise=0`. If any paise value ever appears, render as Rupees (`50000 paise → ₹500`), never raw paise.
- **Dates:** all display en-IN (`13 Jun 2026`, `13 Jun 2026, 2:15 pm`); raw `YYYY-MM-DD`/ISO only as mono data captions on hover/title.

---

### 8. EXISTS vs NEW — endpoint ledger for this area

| Capability                                          | Endpoint                                                 | Status                                                   |
| --------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Pending queue list                                  | `GET /v1/leave-requests?cursor&limit` (HR)               | **EXISTS**                                               |
| Leave detail                                        | `GET /v1/leave-requests/:id` (HR, SUPERVISOR)            | **EXISTS**                                               |
| Approve                                             | `POST /v1/leave-requests/:id/approve {reason?}`          | **EXISTS**                                               |
| Reject                                              | `POST /v1/leave-requests/:id/reject {reason}` (required) | **EXISTS**                                               |
| Create leave (HR on behalf)                         | `POST /v1/leave-requests`                                | EXISTS (not in this screen's flow; HR here only decides) |
| **History list** (`?state=APPROVED\|REJECTED`)      | `GET /v1/leave-requests?state=`                          | **NEW** — coming-soon empty state                        |
| **Conflict / coverage hint**                        | —                                                        | **NEW** — render nothing until backed                    |
| **Worker site/attendance context in sheet**         | —                                                        | **NEW** — only name+phone are real                       |
| **Friendly name for `decidedBy`**                   | —                                                        | **NEW** — show UUID or "You"                             |
| **Server search / date / worker filter on pending** | —                                                        | **NEW** — pending endpoint takes only `cursor`+`limit`   |

---

**Files referenced (absolute):**

- Routes: `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/leave-requests.ts`
- Service: `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/leave-request-service.ts`
- State machine: `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/leave-request.ts`
- Schema (LeaveRequest L528, Worker L262, Attendance L715, AuditEvent L564): `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma`

---

## Swaps queue (HR read = NEW) + decide

### 0. Honest backend reality (read first)

| Fact                                       | Detail                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HR cannot read swaps today.**            | No `GET /swap-requests` and no `GET /swap-requests/:id` exist. The only verified live endpoints are `POST /swap-requests` (SUPERVISOR-only, create) and `POST /swap-requests/:id/decide`.                                                                                                                                                          |
| **The decide gate is SUPERVISOR, not HR.** | `decide` authorizes via `isInitiator \|\| isResponsibleSupervisor` (site in caller's _supervisor_ portfolio via `getSitesSupervisedByUser`). HR has no supervisor portfolio, so an HR caller would get `403 NOT_RESPONSIBLE` on every swap unless a HR-scoped decide path is built.                                                                |
| **Consequence for this screen**            | The entire queue list, the detail/review read, and any HR decide action are **NEW**. Until the list endpoint ships, the screen renders the _coming-soon_ empty state. The review sheet and decide controls are designed now but gated behind the NEW endpoints; they must render read-only/disabled, never imply a live action.                    |
| **Schema vs runtime note**                 | `SwapRequest.state` column default in Prisma is `"DRAFT"` and a comment says "12-state", but the create service hard-writes `state: 'SENT'` and the state-machine recognises only `SENT \| ACCEPTED \| DECLINED`. **Authoritative runtime states for the UI are exactly: `SENT`, `ACCEPTED`, `DECLINED`.** Do not render DRAFT or any other state. |

---

### 1. Purpose + where it sits

|               |                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**   | Read-only oversight queue for HR. HR sees swap requests (requester worker → replacement worker, at a site, effective on a future date) raised by supervisors for workers HR is anchored to, with a SENT/ACCEPTED/DECLINED status chip. HR can open a review sheet to read the full swap. **Deciding is a supervisor action, not HR** — for HR this surface is oversight-only unless/until a HR-decide endpoint is built. |
| **Location**  | `app.axhy.app/hr` → left nav **Swaps** (Lucide `arrow-left-right`). Sits in the HR oversight group alongside Leave queue and Complaints.                                                                                                                                                                                                                                                                                 |
| **Anchoring** | HR sees a swap only if its `siteId` is a site where `Site.ownerHrUserId = me` (via `getHrSiteIds`). HR with no owned sites → empty list **by design** (one HR per worker, site-based, founder-locked 2026-06-08). This filter is applied server-side by the NEW list endpoint; the UI must not assume "no rows = no swaps globally".                                                                                     |
| **Tenant**    | `companyId` always from `req.auth`; client never sends it. RLS FORCE + `WHERE companyId=auth.companyId` on every read.                                                                                                                                                                                                                                                                                                   |

---

### 2. Layout / sections

**Desktop (1440 primary)** — two-pane queue + detail pattern.

```
┌ Top bar: "Swaps" h1 · subtitle "Worker swaps at your sites" ──────────────┐
├ Filter row: [State: All ▾] [Site ▾] [Effective: date range] [Search ⌕]    │
├───────────────────────────────────────────────────────────────────────────┤
│  Dense data table (queue)                          │  Review sheet (right) │
│  ─────────────────────────────────────────────     │  ──────────────────── │
│  Requester → Replacement | Site | Effective |       │  (opens on row click; │
│  Raised | State chip                                │   reuse of decide     │
│  · row                                              │   review sheet,       │
│  · row (selected, terracotta left-rail)             │   read-only for HR)   │
│  ...                                                │                       │
│  [ Load more ]  (cursor)                            │                       │
└────────────────────────────────────────────────────┴───────────────────────┘
```

- Left rail width 264px (shared HR nav). Table fills remaining width; review sheet is a 420px right drawer overlaying the table's right edge (table dims to 60% opacity behind a scrim on ≤1280px; side-by-side ≥1281px).
- Table density: 44px row height, 13px Inter, mono for IDs/dates/counts. Zebra off; 1px `#F1E9D8` row dividers on cream.

**Mobile (375 note)**

- Filters collapse into a single **Filters** button → bottom sheet.
- Table becomes a stacked card list: line 1 `Requester → Replacement` (bold ink), line 2 `Site · Effective`, line 3 state chip right-aligned + "Raised 13 Jun".
- Review opens as a **full-screen** sheet (not a drawer), back-arrow to return. Decide controls (when built) pin to a bottom action bar.

---

### 3. Data fields — Review sheet

Source models: `SwapRequest`, `Worker` (from/to), `Site`. All reads are **NEW** (`GET /swap-requests/:id` does not exist). The decide endpoint _includes_ these relations in its response payload's audit, but there is no GET; fields below are what the NEW read must return.

| Display label          | Source (exact)                                              | Type / enum                         | Notes                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap ID                | `SwapRequest.id`                                            | uuid                                | Mono, truncated `…last6`, copy-on-click. NEW read.                                                                                                                  |
| State                  | `SwapRequest.state`                                         | enum `SENT \| ACCEPTED \| DECLINED` | Authoritative runtime enum (not DRAFT). Drives chip.                                                                                                                |
| Requester (moving off) | `Worker.name` via `SwapRequest.fromWorkerId` → `fromWorker` | string                              | Worker being swapped **off** the site.                                                                                                                              |
| Requester phone        | `fromWorker.phone`                                          | E.164 string                        | `@personal`. Show formatted; mono.                                                                                                                                  |
| Replacement (covering) | `Worker.name` via `SwapRequest.toWorkerId` → `toWorker`     | string                              | Worker covering the site.                                                                                                                                           |
| Replacement phone      | `toWorker.phone`                                            | E.164 string                        | `@personal`.                                                                                                                                                        |
| Site                   | `Site.name` via `SwapRequest.siteId` → `site`               | string                              |                                                                                                                                                                     |
| Effective              | `SwapRequest.effectiveAt`                                   | ISO timestamp                       | Display en-IN `13 Jun 2026, 2:15 pm`. Future at creation.                                                                                                           |
| Reason                 | `SwapRequest.reason`                                        | string \| null                      | Supervisor's note. Render "—" when null.                                                                                                                            |
| Raised                 | `SwapRequest.createdAt`                                     | ISO timestamp                       | Display en-IN.                                                                                                                                                      |
| Decided at             | `SwapRequest.decidedAt`                                     | ISO timestamp \| null               | Null while SENT; set on terminal. Display en-IN or "—".                                                                                                             |
| Applied at             | `SwapRequest.appliedAt`                                     | ISO timestamp \| null               | **Never written by any service or endpoint in ground truth** — render "—" always. Do not promise apply behaviour; the field exists in schema but has no write path. |
| Raised by (supervisor) | `SwapRequest.supervisorId`                                  | uuid (User.id)                      | DERIVED display: NEW read must join to a name; until then show mono User.id labeled "Supervisor". `supervisorId` is **User.id, not Membership.id**.                 |
| Updated                | `SwapRequest.updatedAt`                                     | ISO timestamp                       | Secondary/metadata.                                                                                                                                                 |

**Not on this model — do NOT invent:** no shift/time-slot field exists (`effectiveAt` is the only temporal field — there is no separate "shift"); **no skill-match field exists** — the `approve_anyway`/`overrideToken` path is a _concept_ in the decide endpoint's Zod validation but no skill-mismatch data is returned by any endpoint and the UI must keep this control hidden until a NEW field/endpoint provides it. The render no mismatch banner unless a NEW field provides it.

---

### 4. List columns — Swaps queue table

All columns NEW (list endpoint does not exist). Order: `createdAt DESC, id DESC`.

| Column                  | Source (exact)                      | Type / enum     | Notes                                                                                                                                 |
| ----------------------- | ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Requester → Replacement | `fromWorker.name` + `toWorker.name` | string + string | Single cell: `Asha Devi → Ravi Kumar`, arrow is Lucide `arrow-right` (ink, not accent). Requester bold, replacement medium.           |
| Site                    | `site.name`                         | string          | Truncate w/ tooltip.                                                                                                                  |
| Effective               | `SwapRequest.effectiveAt`           | ISO ts          | en-IN `13 Jun 2026, 2:15 pm`. Mono. Past-effective rows (effectiveAt < now but still SENT) get a small amber `clock` dot + "overdue". |
| Raised                  | `SwapRequest.createdAt`             | ISO ts          | en-IN; relative tooltip ("2 days ago"). Mono.                                                                                         |
| State                   | `SwapRequest.state`                 | enum            | Chip — see §6.                                                                                                                        |

No money columns on this surface (no paise fields on `SwapRequest`/`Worker`/`Site`). The paise→Rupees rule (50000 → Rs 500) does not apply here; do not add a cost column.

---

### 5. Actions

| Action                                            | Method + path (status)                           | Request fields                                                                                               | State-machine (from→to) | DB writes + AuditEvent kind                                                                                                                                                | Idempotency / double-submit                                                                                                                                                                                      | Result UI                                                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Load queue                                        | `GET /v1/swap-requests?cursor&limit` **(NEW)**   | none in body; cursor/limit query; companyId from auth                                                        | none (read)             | none                                                                                                                                                                       | n/a (read)                                                                                                                                                                                                       | Renders table; HR-site-anchored + RLS filtered. Until built → coming-soon empty state.                                                                                                                                   |
| Open review                                       | `GET /v1/swap-requests/:id` **(NEW)**            | `:id`                                                                                                        | none (read)             | none                                                                                                                                                                       | n/a                                                                                                                                                                                                              | Opens review sheet read-only. Until built → row click shows inline "Read view coming soon".                                                                                                                              |
| **Approve** (supervisor action; HR-blocked today) | `POST /v1/swap-requests/:id/decide` **(EXISTS)** | `{decision:'approve'}` (optional `reason`)                                                                   | `SENT→ACCEPTED`         | `SwapRequest.updateMany {state:ACCEPTED, decidedAt}` (race-safe `WHERE state='SENT'`); `AuditEvent` kind **`SWAP_REQUEST_ACCEPTED`** (INSERT-only); Outbox `swap.accepted` | **No idempotency key** (swap writes are not wrapped by `withIdempotency`). UI MUST disable the button for the whole request; rely on DB `WHERE state='SENT'` guard. Double-submit loser → `409 ALREADY_DECIDED`. | On 200 `{ok,swapRequestId,state:'ACCEPTED',decidedBy,decidedAt}` → chip→green ACCEPTED, sheet→read-only. **For HR caller this returns `403 NOT_RESPONSIBLE`** → render disabled with tooltip "Supervisor decides swaps". |
| **Reject** (supervisor action; HR-blocked today)  | `POST /v1/swap-requests/:id/decide` **(EXISTS)** | `{decision:'reject', reason}` — **reason required** (Zod refine; 400 BAD_INPUT if missing)                   | `SENT→DECLINED`         | `updateMany {state:DECLINED, decidedAt}`; `AuditEvent` kind **`SWAP_REQUEST_REJECTED`**; Outbox `swap.rejected`                                                            | Same as approve: disable on submit, no key, DB guard.                                                                                                                                                            | On 200 `{...,state:'DECLINED'}` → chip→neutral DECLINED, read-only. HR → `403`.                                                                                                                                          |
| **Approve anyway** (skill-mismatch override)      | `POST /v1/swap-requests/:id/decide` **(EXISTS)** | `{decision:'approve_anyway', overrideToken:'OVERRIDE'}` — token literal required (Zod refine; 400 if absent) | `SENT→ACCEPTED`         | as approve; AuditEvent `SWAP_REQUEST_ACCEPTED` with `payload.overrideUsed=true`                                                                                            | Disable on submit; no key.                                                                                                                                                                                       | Only rendered on the warning card variant; HR → `403`. **This control must stay hidden today** — no skill-mismatch data exists to trigger it; keep invisible until a NEW field provides it.                              |

**Create swap** (`POST /swap-requests`, EXISTS, SUPERVISOR-only, `→state:SENT`) is **not an HR action** and has no control on this screen — HR never originates swaps. Listed for completeness only.

**Gate summary for decide:** `requireAuth` → `401 AUTH_REQUIRED` if no session. Role check is implicit via `getSitesSupervisedByUser` portfolio + initiator; an HR session lands on `403 NOT_RESPONSIBLE`. The decision UI must therefore be **read-only for HR** until a HR-decide path is built; do not show live Approve/Reject to HR.

---

### 6. States — chips, loading, empty, error

**State chips** (`SwapRequest.state`, plain-words labels):

| State          | Label              | Color                                                                                        | Icon             | Rule                                                                           |
| -------------- | ------------------ | -------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `SENT`         | Awaiting decision  | terracotta `#9A3412` outline on cream (pending = the ONE accent, used sparingly)             | Lucide `clock`   | Non-terminal. Only decidable state.                                            |
| `ACCEPTED`     | Approved           | verified-green `#059669` (allowed: positive)                                                 | `check-circle`   | Terminal → read-only.                                                          |
| `DECLINED`     | Declined           | ink `#0F172A` on `#F1E9D8` (neutral — NOT amber, declined is a clean outcome, not a warning) | `x-circle`       | Terminal → read-only.                                                          |
| overdue marker | "Overdue" mini-tag | flagged-amber `#D97706` (allowed: attention)                                                 | `alert-triangle` | DERIVED: `state='SENT' && effectiveAt < now`. Attention only; chip still SENT. |

**Loading skeleton:** 8 shimmer rows matching column grid (name-pair bar, site bar, two date bars, chip pill). Review sheet: 6 stacked label/value skeleton lines. Shimmer = `#F1E9D8` → `#FFFBEB` sweep, no spinners.

**Empty states (two required):**

| Case                       | Trigger                                            | Copy                                                                               | Visual                                                                                      |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Coming-soon (endpoint NEW) | List endpoint not yet built                        | "Swaps oversight is on the way. Once it's live, swaps at your sites show up here." | Lucide `arrow-left-right` muted; no CTA; **never** a fake row.                              |
| No swaps / no sites        | Endpoint live, `items:[]` (incl. HR owns no sites) | "No swaps at your sites yet." + secondary "You see swaps only for sites you own."  | Muted illustration; if filters active, show "No swaps match these filters · Clear filters". |

**Error + retry:**

| Error                         | HTTP                                                             | UI                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AUTH_REQUIRED`               | 401                                                              | Session-expired interstitial → re-login.                                                                |
| `QUERY_INVALID` / `BAD_INPUT` | 400                                                              | Inline filter error "Check your filters" + Retry; don't clear table.                                    |
| `ALREADY_DECIDED`             | 409                                                              | Toast "This swap was already decided." → refetch row → chip flips to its terminal state, controls lock. |
| `NOT_RESPONSIBLE`             | 403                                                              | (HR decide) replace action bar with read-only note "Supervisor decides swaps." No retry.                |
| `SWAP_NOT_FOUND`              | 404                                                              | Sheet shows "This swap is no longer available." → close.                                                |
| `INTERNAL`                    | 500                                                              | Card "Couldn't load swaps." + Retry (re-issues same cursor).                                            |
| Rate limit                    | 429 (global 100/min/tenant; per-route sliding window, fail-open) | Toast "Too many requests, try again in a moment." Auto-retry once after backoff.                        |

---

### 7. Filters / search / pagination (exact)

| Control         | Param                              | Behaviour                                                                                                                                                                                                             |
| --------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State filter    | NEW (`?state=`)                    | All · Awaiting decision (`SENT`) · Approved (`ACCEPTED`) · Declined (`DECLINED`). Multi-select chips. Param is NEW — only render once list endpoint supports it; otherwise client-side filter on loaded page.         |
| Site filter     | NEW (`?siteId=`)                   | Options = HR-owned sites only (`Site.ownerHrUserId=me`).                                                                                                                                                              |
| Effective range | NEW (`?effectiveFrom&effectiveTo`) | YYYY-MM-DD inputs; en-IN display.                                                                                                                                                                                     |
| Search          | NEW (`?q=`)                        | Matches `fromWorker.name` / `toWorker.name` / `site.name`. Debounce 300ms.                                                                                                                                            |
| Pagination      | **cursor** `?cursor=&limit=`       | Response `{items, nextCursor}`, ordered `createdAt DESC, id DESC`. **Load more** button appends; `nextCursor=null` → hide button. No page numbers (cursor, not offset). Default `limit=25`, max enforced server-side. |

All filter params are **NEW** (no list endpoint). If the list endpoint ships without a given param, that filter degrades to client-side over the current page and shows a "filtering this page only" hint — never silently claim server filtering.

---

### 8. Formatting rules applied

| Rule        | Application here                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Dates en-IN | `effectiveAt`, `createdAt`, `decidedAt`, `updatedAt` → `13 Jun 2026, 2:15 pm`. Date-only filter inputs accept/emit `YYYY-MM-DD`. |
| Money       | **N/A** — no paise fields on these models. No cost/amount column.                                                                |
| Phones      | `@personal` E.164, formatted display, mono.                                                                                      |
| IDs         | uuid, mono, truncated + copy.                                                                                                    |

---

### 9. Design notes — locked terracotta / paper brand

- **Background** cream `#FFFBEB`; cards/table surface paper-white with `#F1E9D8` hairlines; text ink `#0F172A`; secondary text `#475569`.
- **The ONE accent (terracotta `#9A3412`, hover `#C2410C`):** selected-row left rail (3px), the **SENT / Awaiting-decision** chip outline, primary buttons (Approve, once HR-decide exists), focus rings, active filter chips, and **Load more**. Nowhere else. Never use accent for DECLINED or for icons-as-decoration.
- **Green `#059669`** ONLY on ACCEPTED chip + its `check-circle`. **Amber `#D97706`** ONLY on the derived "Overdue" attention tag. Never swap these meanings.
- **Density:** desktop dense table (44px rows, compact 12px vertical padding, 16px gutters); review sheet roomier (20px field spacing). At 375px, cards 12px padding, 8px between.
- **Typography:** Inter for UI; mono (data-label mono) for IDs, dates, phones, counts; Noto Sans Devanagari/Telugu auto-swap for hi/te worker names so Indic names render correctly.
- **Icons:** Lucide only, no emoji — `arrow-left-right` (nav), `arrow-right` (requester→replacement), `clock` (SENT/overdue base), `check-circle` (ACCEPTED), `x-circle` (DECLINED), `alert-triangle` (overdue attention), `copy` (IDs).
- **Read-only honesty:** terminal swaps and the entire HR view render controls in a disabled/`aria-disabled` state with a plain explanatory line ("Supervisor decides swaps." / "This swap is already decided.") — never a clickable button that 403/409s. WCAG AA: all chips meet 4.5:1; never color-only — every chip pairs an icon + text label.

---

### Files referenced (absolute)

- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/swap-requests.ts` — create + decide routes (decide gate, error codes, audit kinds, outbox topics).
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/swap-request-service.ts` — create writes `state:'SENT'`, `SWAP_REQUEST_SENT` audit.
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/swap-request.ts` — authoritative states `SENT|ACCEPTED|DECLINED`, terminal set, transitions.
- `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` — `SwapRequest` (L922), `Worker` (L262), `Site` (L222) exact fields.
- `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/middleware/hr-site-scope.ts` — `getHrSiteIds` HR ownership scoping logic.

**Load-bearing backend facts the designer must not contradict:** (1) runtime states are exactly `SENT|ACCEPTED|DECLINED` (ignore schema's `DRAFT` default / "12-state" comment); (2) decide reason is **required only for `reject`**, and `approve_anyway` requires `overrideToken:'OVERRIDE'`; (3) decide is **SUPERVISOR/initiator-gated** — an HR caller gets `403 NOT_RESPONSIBLE`, so HR view is read-only oversight with no decide action control shown; (4) **all read endpoints are NEW** — the screen ships with the coming-soon empty state, never a fabricated list; (5) decide has **no idempotency key** — the UI must disable submit during the request and trust the DB `WHERE state='SENT'` race guard (loser → `409 ALREADY_DECIDED`); (6) `appliedAt` field is never written by any service and must always render as "—"; (7) skill-mismatch concept exists in the decide Zod schema but no mismatch data is returned by any endpoint — keep the `approve_anyway` control hidden until a NEW field provides it.

---

## Complaints list + thread + reply + resolve/dismiss

> **Scope:** HR portal area at `app.axhy.app/hr/complaints`. Desktop-first dense enterprise admin (primary 1440px), must hold at 375px. WCAG AA. Brand: warm terracotta + paper. All endpoints below are tagged **EXISTS** (verified live in `apps/backend/src/routes/complaints.ts` + `sites.ts`) or **NEW** (must be built; render coming-soon until live). Never imply a NEW endpoint exists.
>
> **Backend reality that shapes every screen:**
>
> - Auth context `req.auth={userId,companyId,role,membershipId,epoch}`. Client **never** sends `companyId`. Gate on every route: `requireAuth` + `requireRole('SUPERVISOR','HR','OWNER')`. In the HR portal the caller role is always `HR`.
> - **HR site-anchoring (founder-locked 2026-06-08):** the access predicate for `HR` is `siteId IN getHrSiteIds(userId, companyId)` = sites where `Site.ownerHrUserId = me`. **HR with zero owned sites sees empty lists by design.** This is the second empty state on every list. Not pods.
> - Tenant: `withTenantContext` sets GUC `axhy.current_company_id`; RLS FORCE on 27 tables; reads also `WHERE companyId = auth.companyId`. Cross-tenant access returns `404`, never a leak.
> - List = cursor pagination `?cursor&limit` → response key is **`complaints`** + `nextCursor` (not `items`). Ordered `createdAt DESC, id DESC`. Opaque cursor; client treats as a black box.
> - Every write appends an immutable `AuditEvent` (INSERT-only, FK RESTRICT migration 031). **No edit, no delete anywhere** — there is no edit/delete affordance on any complaint, message, or resolution. Messages are append-only.
> - Idempotency: **only** `POST /complaints/:id/messages` is wrapped in `withIdempotency` (safe to retry with an `Idempotency-Key` header). `resolve`, `dismiss(NEW)`, `mark-read`, and `create-from-site` rely on DB guards/state-machine — UI **must disable the submit button during the request and not double-submit**. Global rate limit 100 req/min/tenant + per-route sliding window (fail-open).
> - Dates display **en-IN** (e.g. `13 Jun 2026, 2:15 pm`). No money fields exist in this area (complaints carry no paise). The paise→Rupees rule does not apply here — do not invent currency UI.

---

### Machine + state chips (single source of truth)

State machine (`packages/state-machines/src/complaint.ts`): `OPEN → IN_HR | RESOLVED | DISMISSED`; `IN_HR → RESOLVED | DISMISSED`. `RESOLVED` + `DISMISSED` are terminal (`isTerminal` true). No transition out of terminal.

| Machine state | Chip label (plain words) | Color                               | Meaning                                                                              |
| ------------- | ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------ |
| `OPEN`        | Open                     | Terracotta accent (filled)          | Logged by supervisor, not yet actioned by HR.                                        |
| `IN_HR`       | With HR                  | Flagged-amber `#D97706` (attention) | An HR/ADMIN reply exists; HR is working it. Set automatically the moment HR replies. |
| `RESOLVED`    | Resolved                 | Verified-green `#059669`            | Closed with a resolution. Terminal.                                                  |
| `DISMISSED`   | Dismissed                | Ink-muted / neutral grey            | False alarm / duplicate / out of scope. Terminal.                                    |

> Green is allowed **only** on `RESOLVED`. Amber **only** on `IN_HR` and the unread badge. Terracotta is the one brand accent (Open chip, primary buttons, active nav). Dismissed is neutral, never red.

Severity (`Complaint.severity`, enum `LOW | MEDIUM | HIGH`):

| Value    | Chip label | Color                           | Notes                                                                |
| -------- | ---------- | ------------------------------- | -------------------------------------------------------------------- |
| `HIGH`   | High       | Flagged-amber `#D97706`, filled | Highest visual weight; never red (red is not in the locked palette). |
| `MEDIUM` | Medium     | Amber outline / ink             | Outline chip.                                                        |
| `LOW`    | Low        | Ink-muted neutral               | Default for button-logged complaints.                                |

Kind (`Complaint.kind`, DB CHECK enum, defaults `other`): `photo_mismatch, missed_area, attitude, theft_accusation, hygiene, noise, damage, gate_pass, other`.

| Value              | Display label    | Lucide icon    |
| ------------------ | ---------------- | -------------- |
| `photo_mismatch`   | Photo mismatch   | `image-off`    |
| `missed_area`      | Missed area      | `map-pin-off`  |
| `attitude`         | Attitude         | `frown`        |
| `theft_accusation` | Theft accusation | `shield-alert` |
| `hygiene`          | Hygiene          | `droplets`     |
| `noise`            | Noise            | `volume-2`     |
| `damage`           | Damage           | `hammer`       |
| `gate_pass`        | Gate pass        | `door-open`    |
| `other`            | Other            | `circle-help`  |

---

## Screen 1 — Complaints list (queue)

**(1) Purpose + placement.** The HR triage queue. Lives at `/hr/complaints`, default landing for the "Complaints" item in the left nav. Shows every complaint on the sites this HR owns, newest first, with severity, state, and unread-reply signal so HR can triage at a glance.

**(2) Layout.**

- **Desktop 1440 (primary):** persistent left nav (240px) + main column. Page header row: title "Complaints", a count summary (DERIVED, see notes), and a filter bar. Below: a dense data table (row height ~48px, zebra off, hairline `#E7E0D2` row dividers on cream). Right-aligned "Load more" / cursor pager at table foot. No row actions menu — entire row is a click target → detail.
- **375 mobile:** table collapses to stacked cards: line 1 = site name + state chip; line 2 = severity chip + kind + relative time; line 3 = complaint text (2-line clamp in **list only** — full text is never truncated in detail) + unread badge right-aligned. Filters become a sticky filter sheet trigger.

**(3) There are no scalar "page data fields" beyond the filter state; all data is the list (column table below).**

**(4) List columns.** Source: `GET /complaints` → `complaints[]` rows (`ComplaintRow` shape).

| Column         | Source (exact)                                       | Type / enum                              | Notes                                                                                                                                                              |
| -------------- | ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Site           | `Complaint.siteName` (DERIVED from `site.name` join) | string                                   | Primary identity in the row; bold ink.                                                                                                                             |
| Severity       | `Complaint.severity`                                 | `LOW \| MEDIUM \| HIGH`                  | Render as severity chip (table above). Sort weight HIGH>MED>LOW only if client-sorted; server does not sort by severity.                                           |
| Kind           | `Complaint.kind`                                     | kind enum (9 values)                     | Icon + label; `other` is common (button-logged default).                                                                                                           |
| State          | `Complaint.state`                                    | `OPEN \| IN_HR \| RESOLVED \| DISMISSED` | State chip with plain-word label.                                                                                                                                  |
| Unread         | `Complaint.unreadHrRepliesCount`                     | int ≥ 0                                  | **Counts HR-authored replies the supervisor hasn't read — NOT unread-by-HR.** See critical note below. Show amber dot badge with number when `> 0`; hide when `0`. |
| Complaint text | `Complaint.text`                                     | string                                   | 2-line clamp in list. Sensitive content; full text shown untruncated in detail.                                                                                    |
| Last reply     | `Complaint.lastReplyAt`                              | ISO ts, nullable                         | Display en-IN relative ("HR replied 2h ago") with absolute on hover/title. Null → show `createdAt` instead with "Logged".                                          |
| Logged         | `Complaint.createdAt`                                | ISO ts                                   | en-IN absolute `13 Jun 2026, 2:15 pm`. Secondary/mono label.                                                                                                       |
| Resolved       | `Complaint.resolvedAt`                               | ISO ts, nullable                         | Only meaningful when state terminal; show "—" otherwise.                                                                                                           |

> **CRITICAL accuracy note — `unreadHrRepliesCount` semantics:** this counter is incremented when an HR/ADMIN reply is appended and decremented only when a **SUPERVISOR** marks that HR message read (`complaint-service.ts` counter math). It is the _supervisor's_ unread badge, not HR's. **Do not label it "New for you" in the HR portal.** Correct HR-portal label: "Awaiting supervisor" or "Unread by supervisor". There is **no HR-side unread counter** in the backend yet (the schema comment calls it out as future). If the designer wants an "HR has unread supervisor replies" signal, that is **NEW** and must be tagged coming-soon — it cannot be derived from this field.

**(7) Filters / search / pagination (exact).** Query model `ListComplaintsQuery`.

| Control          | Param    | Values / rule                                                                                                                                                 | EXISTS?                                                                                                                                                                                                                                            |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State filter     | `state`  | one of `OPEN \| IN_HR \| RESOLVED \| DISMISSED`, optional (omit = all states)                                                                                 | EXISTS                                                                                                                                                                                                                                             |
| Site filter      | `siteId` | uuid, optional; **picker must list only the HR's owned sites** (sites where `ownerHrUserId=me`); a `siteId` outside scope returns an empty list, not an error | EXISTS (server-side filter) — the **owned-sites picker source is NEW** (no dedicated "my sites" endpoint referenced here; until built, derive the picker from `siteName`/`siteId` values present in the loaded page, or build the picker endpoint) |
| Page size        | `limit`  | int 1–100, default 20                                                                                                                                         | EXISTS                                                                                                                                                                                                                                             |
| Next page        | `cursor` | opaque base64url string from prior `nextCursor`; client passes back verbatim                                                                                  | EXISTS                                                                                                                                                                                                                                             |
| Free-text search | —        | none                                                                                                                                                          | **NEW** — no `q`/search param on the backend. Do not render a working search box; if shown, mark coming-soon.                                                                                                                                      |
| Sort             | —        | fixed `createdAt DESC, id DESC`                                                                                                                               | EXISTS (server-fixed). No sortable column headers that hit the server; any client-side sort is presentation-only and must not imply server re-query.                                                                                               |

Pagination UX: cursor-forward only (no page numbers, no total count from server — a "247 complaints" total is **NEW**/not available, do not fabricate it). Use a "Load more" button or infinite scroll appending rows; store `nextCursor`; when `nextCursor === null`, hide the control and show an end-of-list rule. Invalid/garbled cursor → server returns `400 {error:'BAD_CURSOR'}`; treat as "reset to first page" with a toast.

**(5) Actions on the list.**

| Action         | Method + path                                                       | Req fields                         | Machine     | DB writes + Audit | Idempotency / double-submit | Result UI                          |
| -------------- | ------------------------------------------------------------------- | ---------------------------------- | ----------- | ----------------- | --------------------------- | ---------------------------------- |
| Load page      | `GET /complaints?state&siteId&limit&cursor` **(EXISTS)**            | query only (no body, no companyId) | none (read) | none              | n/a (GET)                   | Append rows; update `nextCursor`.  |
| Open complaint | client nav → Screen 2 (`GET /complaints/:id`) **(EXISTS)**          | path `:id`                         | none        | none              | n/a                         | Navigate to detail.                |
| Apply filter   | re-issue `GET /complaints` with new `state`/`siteId`, drop `cursor` | query                              | none        | none              | n/a                         | Reset list, fetch from first page. |

**(6) States.**

- **Loading skeleton:** 8–10 shimmer rows matching column grid (site, two chips, text line, time). Header count shows skeleton pill.
- **Empty state A — filter/genuinely empty (HR owns sites, none match):** illustration + "No complaints match these filters." + "Clear filters" button. Distinct copy from B.
- **Empty state B — HR owns zero sites (by design):** "You don't own any sites yet." + plain-words explainer: "Complaints show up here once an owner assigns you to a site. One HR owns each site." + secondary link "Learn how site ownership works". **This is expected, not an error** — no retry button, neutral tone, no red.
- **Error + retry:** network/5xx → inline banner "Couldn't load complaints." + "Retry" (re-issues the same query). `401` → session expired → route to login. `403` → "You don't have access to complaints." (role gate). `400 BAD_INPUT`/`BAD_CURSOR` → silent reset to first page + small toast.

**(8) Dates.** All en-IN. `createdAt`/`resolvedAt` absolute; `lastReplyAt` relative-with-absolute-on-hover. No currency.

**(9) Design notes.** Dense desktop table on cream `#FFFBEB`, ink `#0F172A` text, hairline dividers `#E7E0D2`. The single terracotta accent goes on: active "Complaints" nav item, the focused/primary filter, and the Open state chip. Amber `#D97706` reserved for HIGH severity + the unread badge. Green `#059669` reserved for the Resolved chip only. Column labels and timestamps in the mono data face; row content in Inter. Row hover: subtle terracotta-tinted background (`#9A3412` @ 6% over cream). Hindi/Telugu site names render in Noto Sans Devanagari/Telugu. Lucide icons only, no emoji. 44px min touch targets at 375px.

---

## Screen 2 — Complaint detail (thread + reply + resolve/dismiss)

**(1) Purpose + placement.** The full triage workspace for one complaint. Route `/hr/complaints/:id`. Combines: complaint header (site, severity, kind, state, who/when), the **full untruncated** complaint body, the chronological message thread, a reply composer with image attachments, and the close actions (Resolve / Dismiss). Mark-read fires automatically as HR views messages.

**(2) Layout.**

- **Desktop 1440 (primary):** two-region detail. **Header card** (top, full width): site name (h1), state chip, severity chip, kind chip, `createdByUserId`/`supervisorId` attribution line, `createdAt`, and `resolvedAt`/`resolvedBy` when terminal. **Thread column** (left, ~720px): the complaint body block (visually distinct, the "original report", never clamped) followed by message bubbles oldest→newest. **Action rail** (right sidebar, sticky ~320px): Resolve button, Dismiss button, and a read-only meta panel (last reply, unread-by-supervisor count, IDs for support). **Reply composer** docked at the bottom of the thread column (textarea + attachment tray + Send), disabled with an explanatory note when state is terminal.
- **375 mobile:** single column. Header card → complaint body → thread → sticky bottom reply bar. Resolve/Dismiss move into a sticky action footer above the composer (or an overflow "Close complaint" menu). Action rail meta collapses into an expandable "Details" accordion.

**(3) Header / scalar data fields.** Source: `GET /complaints/:id` → `{complaint, messages[]}`; `complaint` is a `ComplaintRow`.

| Display label               | Source (exact)                   | Type / enum                              | Notes                                                                                                                                                       |
| --------------------------- | -------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site                        | `complaint.siteName`             | string                                   | h1.                                                                                                                                                         |
| State                       | `complaint.state`                | `OPEN \| IN_HR \| RESOLVED \| DISMISSED` | State chip (plain label).                                                                                                                                   |
| Severity                    | `complaint.severity`             | `LOW \| MEDIUM \| HIGH`                  | Severity chip.                                                                                                                                              |
| Kind                        | `complaint.kind`                 | kind enum (9)                            | Icon + label.                                                                                                                                               |
| Complaint (original report) | `complaint.text`                 | string                                   | **NEVER truncated.** Sensitive content — render full, selectable, with preserved line breaks. Mirrors the first message body.                               |
| Logged on                   | `complaint.createdAt`            | ISO ts                                   | en-IN absolute.                                                                                                                                             |
| Logged by (creator)         | `complaint.createdByUserId`      | uuid                                     | Show as person name — **name lookup is NEW** (no user/name endpoint in this area; until built, show role + shortened id, never raw uuid as the only label). |
| Supervisor                  | `complaint.supervisorId`         | uuid                                     | Bound supervisor; same NEW name-lookup caveat. Usually equals creator.                                                                                      |
| Site id                     | `complaint.siteId`               | uuid                                     | In meta panel for support, mono, copyable.                                                                                                                  |
| Last reply                  | `complaint.lastReplyAt`          | ISO ts, nullable                         | Meta panel; relative + absolute.                                                                                                                            |
| Unread by supervisor        | `complaint.unreadHrRepliesCount` | int ≥ 0                                  | Meta panel label exactly "Unread by supervisor" (see critical note in Screen 1).                                                                            |
| Resolved on                 | `complaint.resolvedAt`           | ISO ts, nullable                         | Shown only when terminal.                                                                                                                                   |
| Resolved/closed by          | `complaint.resolvedBy`           | uuid, nullable                           | Same NEW name-lookup caveat. Note: field is named `resolvedBy` and is also populated for the **NEW** dismiss path.                                          |

**(4) Thread message columns/fields.** Source: `messages[]` (`ComplaintMessageRow`), already ordered **oldest-first** by the server.

| Display label | Source (exact)           | Type / enum                                                       | Notes                                                                                                                                         |
| ------------- | ------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Author role   | `message.authorRole`     | `SUPERVISOR \| HR \| ADMIN`                                       | Drives bubble alignment/color (HR = right/terracotta-tint; SUPERVISOR = left/paper). Role-at-time-of-write, persisted.                        |
| Author        | `message.authorUserId`   | uuid                                                              | Name lookup **NEW**; show role label + avatar initial until then.                                                                             |
| Body          | `message.body`           | string (1–2000)                                                   | **Never truncated.** Preserve line breaks; selectable.                                                                                        |
| Attachments   | `message.attachments`    | `null` or array of `{type:'image', url, width?, height?}` (max 8) | Image thumbnails → lightbox. `url` is an S3 link (interim signed-URL; CDN slice out of scope). Only `type:'image'` exists — no video/file UI. |
| Sent          | `message.createdAt`      | ISO ts                                                            | en-IN; group by day with date separators.                                                                                                     |
| Read by me    | `message.readByCallerAt` | ISO ts, nullable                                                  | Per-(message, caller) receipt. Drives the auto mark-read trigger (below); may surface a subtle "seen" tick.                                   |

**(5) Actions.**

| Action            | Method + path (EXISTS/NEW)                                   | Request fields                                                                                                                | Machine (from→to)                                                                                                                                        | DB tables written + AuditEvent kind                                                                                                                                             | Idempotency / double-submit                                                                                                                                                                                                                     | Result UI                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load thread       | `GET /complaints/:id` **(EXISTS)**                           | path `:id`                                                                                                                    | none (read)                                                                                                                                              | none                                                                                                                                                                            | n/a                                                                                                                                                                                                                                             | Render header + messages. `404 COMPLAINT_NOT_FOUND` → "This complaint doesn't exist or isn't on a site you own." (same shape covers cross-tenant + out-of-scope).                                                                                                                                                                                                                         |
| Reply             | `POST /complaints/:id/messages` **(EXISTS)**                 | body `{ body: string 1–2000 (trimmed, required), attachments?: array≤8 of {type:'image',url,width?,height?} }`. No companyId. | If HR author (this portal): **OPEN→IN_HR** (auto, in same tx); if already `IN_HR` stays `IN_HR`; bumps `lastReplyAt`; increments `unreadHrRepliesCount`. | `ComplaintMessage` (insert) + `Complaint` (update state/`lastReplyAt`/counter) + `AuditEvent` kind **`COMPLAINT_MESSAGE_APPENDED`**                                             | **Idempotent** via `withIdempotency` — client SHOULD send an `Idempotency-Key` header per composed message; a retry with the same key returns the cached outcome (no double row). Still disable Send during the request as belt-and-suspenders. | Optimistic append of the new bubble; on `201 {ok,messageId,createdAt}` reconcile; clear composer + attachments.                                                                                                                                                                                                                                                                           |
| Resolve           | `POST /complaints/:id/resolve` **(EXISTS)**                  | path `:id`, no body                                                                                                           | **OPEN→RESOLVED** or **IN_HR→RESOLVED** (conditional UPDATE on `state IN ('OPEN','IN_HR')`)                                                              | `Complaint` (set `state=RESOLVED`, `resolvedAt`, `resolvedBy=caller`) + `AuditEvent` kind **`COMPLAINT_RESOLVED`**                                                              | **No idempotency key** → UI MUST disable the Resolve button on click until response. Concurrent resolver loses cleanly → `409 {error:'ALREADY_TERMINAL', state}`.                                                                               | Confirm dialog ("Resolve this complaint? This can't be undone.") → on `200 {ok,resolvedAt}` flip state chip to Resolved (green), lock composer, show resolved meta. On `409` refetch + toast "Already closed by someone else."                                                                                                                                                            |
| Dismiss           | `POST /complaints/:id/dismiss` **(NEW)**                     | path `:id`, body TBD (likely none, optional reason)                                                                           | **OPEN→DISMISSED** or **IN_HR→DISMISSED** (machine supports it; no REST route yet)                                                                       | Expected: `Complaint` (set `state=DISMISSED`, `resolvedAt`, `resolvedBy`) + `AuditEvent` (kind TBD, e.g. `COMPLAINT_DISMISSED`) — **not yet implemented**                       | When built: no idempotency key assumed → disable button during request, expect `409 ALREADY_TERMINAL` on race.                                                                                                                                  | **Until the endpoint ships, render the Dismiss button in a disabled/coming-soon state** with tooltip "Dismiss is coming soon." Do NOT wire it to any live call. Never imply it works.                                                                                                                                                                                                     |
| Mark message read | `POST /complaints/:id/messages/:messageId/read` **(EXISTS)** | path `:id`, `:messageId`, no body                                                                                             | none                                                                                                                                                     | `ComplaintMessageRead` (insert; composite PK `(messageId, actorUserId)`) + conditional counter decrement only when actor is SUPERVISOR reading an HR message (n/a in HR portal) | **Idempotent at the DB layer** (P2002 → `wasAlreadyRead=true`, treated as no-op). Safe to fire repeatedly; fire-and-forget.                                                                                                                     | Fired automatically when a message scrolls into view / on thread open for messages with `readByCallerAt == null`. Returns `200 {ok, wasAlreadyRead}`. No visible blocking UI; optionally update a "seen" tick. **Note: an HR caller marking read does NOT decrement `unreadHrRepliesCount`** (that decrement is supervisor-only) — so the supervisor's badge is unaffected by HR reading. |

> **Reply composer detail.** Textarea max 2000 chars with a live counter; trims whitespace; empty/whitespace-only Send is disabled client-side (server enforces `min(1)` → `400 BAD_INPUT`). Attachment tray: up to **8** images; each must resolve to a valid `url` (`type:'image'` only). The image **upload pipeline (S3 signed URL) is out of scope of these endpoints** — the composer must obtain a `url` before POSTing; if no upload endpoint is wired in the portal yet, treat attachment add as **NEW**/coming-soon and ship text-only reply first. When the complaint is terminal (`RESOLVED`/`DISMISSED`), the composer is disabled with note "This complaint is closed. Reopening isn't supported." — posting anyway returns `409 {error:'COMPLAINT_TERMINAL', state}`.

**(6) States.**

- **Loading skeleton:** header card shimmer (title + 3 chips) + 3 message-bubble shimmers + disabled composer.
- **Empty thread:** never truly empty — a complaint always has ≥1 message (the initial supervisor report mirrored from `text`). If `messages` is unexpectedly empty, fall back to rendering `complaint.text` as the original report block.
- **Not found / out of scope:** `404 COMPLAINT_NOT_FOUND` → full-page empty: "This complaint isn't available." + back-to-list. Covers deleted-never (no delete exists), cross-tenant, and complaints on sites this HR doesn't own.
- **Error + retry:** load 5xx → "Couldn't load this complaint." + Retry. Reply 5xx/network → keep the composer content, show inline "Couldn't send. Try again." with a retry that reuses the same `Idempotency-Key`. Resolve `409 ALREADY_TERMINAL` → refetch + toast. `401`→login, `403`→access banner.
- **State chips** as defined in the machine table; terminal states additionally render the resolved/dismissed meta line with timestamp and actor.

**(7) Filters/search/pagination.** None on detail — the thread loads in full (`messages` returned oldest-first, no pagination on messages in this endpoint). If thread length becomes large, client-side virtualization only; no server cursor exists for messages.

**(8) Dates.** en-IN throughout; day separators in the thread; relative for `lastReplyAt`. No currency.

**(9) Design notes.** The original-report block gets a subtle terracotta left-border (`#9A3412`) to mark it as the source-of-truth complaint; HR reply bubbles use a terracotta-tint fill, supervisor bubbles paper/cream with hairline border. Resolve is the single terracotta primary button in the action rail; Dismiss is a neutral/ink secondary (never red — Dismissed is neutral). Green appears only once the state is Resolved. Amber appears on HIGH severity and the "Unread by supervisor" meta. Attachments render as rounded thumbnails with `image` Lucide fallback for broken `url`. Body and message text in Inter, IDs/timestamps in the mono face. Devanagari/Telugu bodies use Noto Sans. WCAG AA contrast on all chips (verify amber-on-cream and green-on-cream meet 4.5:1 for text, 3:1 for chip borders). At 375px the composer is a sticky bottom bar; Send is a terracotta icon button; attachment add is a paperclip (`paperclip` Lucide).

---

## Screen 3 — Create complaint from a site

**(1) Purpose + placement.** Lets HR log a new complaint against a site they own — invoked from a site detail page ("Log complaint") or a "New complaint" button on the list. Modal/drawer, not a full route.

**(2) Layout.** Modal (desktop) / full-sheet (375): site (fixed or picker limited to owned sites), severity selector, complaint text. Single primary "Log complaint" button + Cancel.

**(3)/(4) Fields.** Source: `POST /sites/:id/complaints` body = `LogComplaintInput`.

| Display label  | Source (exact)        | Type / enum                            | Notes                                                                                                                                                                         |
| -------------- | --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site           | path `:id` (the site) | uuid                                   | **Must be a site the HR owns** (`ownerHrUserId=me`); a non-owned/cross-tenant site → `404 SITE_NOT_FOUND`. Owned-site picker source is **NEW** (no list endpoint cited here). |
| Complaint text | `text` (body)         | string, trimmed, **1–2000**, required  | Required; "Text is required" on empty.                                                                                                                                        |
| Severity       | `severity` (body)     | `LOW \| MEDIUM \| HIGH`, default `LOW` | Segmented control; default LOW.                                                                                                                                               |

> **CRITICAL — no `kind` on create.** The backend route hardcodes `kind:'other'` (see `apps/backend/src/routes/sites.ts` line 89). The `LogComplaintInput` body is **`{text, severity}` only** — there is **no `kind` field** to send. Do **not** render a kind picker here — it would be a field the backend ignores. (Kind is only set via the supervisor chat tool-loop `propose_log_complaint`, not in the HR portal.) Logged-from-HR complaints will always show kind = Other.

**(5) Action.**

| Action        | Method + path                             | Request fields                               | Machine               | DB writes + Audit                                                                                                                                                                                               | Idempotency / double-submit                                                                                                         | Result UI                                                                                                                                                                                                                                |
| ------------- | ----------------------------------------- | -------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log complaint | `POST /sites/:id/complaints` **(EXISTS)** | `{ text, severity }` (no kind, no companyId) | creates at **`OPEN`** | `Complaint` (insert, state=OPEN) + initial `ComplaintMessage` (author SUPERVISOR/HR per caller role mapping) + `AuditEvent` kind **`SITE_COMPLAINT_LOGGED`** + Outbox topic `hr.site_complaint` — all in one tx | **Idempotent** via `withIdempotency` (same key returns cached `complaintId`); still **disable the button on click** until response. | `200 {ok, complaintId, siteId, severity, loggedBy, loggedAt}` → close modal, toast "Complaint logged", navigate to Screen 2 for `complaintId`. `404 SITE_NOT_FOUND` → "That site isn't available." `400 BAD_INPUT` → inline field error. |

**(6) States.** Submitting → button shows spinner + disabled (prevents double-submit even with idempotency). Validation errors inline. `403` if role gate fails. Success → optimistic insert into the top of the list (it sorts first by `createdAt DESC`).

**(8) Dates/money.** `loggedAt` echoed ISO → display en-IN. No currency.

**(9) Design notes.** Single terracotta "Log complaint" primary; severity segmented control uses amber fill only for HIGH. Cream modal, ink text, hairline border. **No kind field** — the design must not include a kind picker or kind entry field; kind is hardcoded to 'other' at the backend.

---

### Cross-screen correctness checklist (for the designer + reviewer)

- Client never sends `companyId`; do not add a tenant field anywhere.
- List response key is **`complaints`**, not `items`; pager key is `nextCursor`.
- `unreadHrRepliesCount` = **supervisor's** unread of HR replies; label it "Unread by supervisor", never "new for you" in the HR portal. No HR-side unread counter exists.
- Reply auto-advances state **OPEN→IN_HR**; HR never manually moves a complaint to IN_HR.
- **Dismiss is NEW** (`POST /complaints/:id/dismiss` does not exist) — ship disabled/coming-soon; only Resolve is live for closing.
- Create-from-site takes **`{text, severity}` only** — no kind field, no kind picker. Kind is hardcoded to 'other' at the backend.
- Only **reply** has an idempotency key; **resolve / dismiss / create** must disable their submit button to prevent double-submit.
- No edit, no delete affordances anywhere; messages and resolutions are append-only/immutable (AuditEvent INSERT-only).
- Error codes actually returned by these routes: `AUTH_REQUIRED` 401, `403` role gate, `BAD_INPUT` 400, `BAD_CURSOR` 400, `COMPLAINT_NOT_FOUND` 404, `MESSAGE_NOT_FOUND` 404, `SITE_NOT_FOUND` 404, `COMPLAINT_TERMINAL` 409 (reply to closed), `ALREADY_TERMINAL` 409 (resolve closed). Do not surface the prompt's `QUERY_INVALID / WINDOW_OPEN / SUPERVISOR_ROLE_REQUIRED` codes — they do not appear in this area's routes.
- HR with zero owned sites → empty lists by design (founder-locked 2026-06-08), not an error.

**Files verified:** `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/complaints.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/sites.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/complaint-service.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/state-machines/src/complaint.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/complaint.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/supervisor.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` (models Site:222, Complaint:753, ComplaintMessage:843, ComplaintMessageRead:890).

---

## Late-reversal review queue (HR side = entirely NEW)

> Status banner for the designer: **every endpoint in this area is NEW.** No HR reversal endpoint is live today. The supervisor side that _feeds_ this queue (`POST /activity/:id/soft-flag`, `POST /activity/:id/reverse`) is EXISTS and verified. The screen must render a **"coming soon" / empty-until-built** posture for any data it cannot yet fetch, and must never imply the HR endpoints exist. Build order is queue-list first, then review sheet.

---

### 1. Purpose + where it sits

**Purpose.** When a supervisor realises — _past the 30-minute self-undo window_, or for a kind that has no direct undo — that one of their own past actions was a mistake (wrongly marked a worker absent, approved the wrong leave, created/replaced the wrong assignment), they tap **"Send to HR"** on their mobile Activity feed. That fires `POST /activity/:id/soft-flag`, which writes a `SupervisorDecision{ kind: LATE_REVERSAL_REQUEST, appliedAt: null, dismissedAt: null }` row plus an `ACTIVITY_LATE_REVERSAL_REQUESTED` audit row. **That row is the queue item here.** HR is the only path to undo it now.

HR reviews each request, sees exactly what the supervisor wants undone and why, the original action with its full context, and either **applies the undo** (the same per-kind compensating reverse the supervisor would have run) or **declines with a reason**.

**Where it sits.** Desktop-first enterprise portal at `app.axhy.app/hr`. Left nav item **"Reversal requests"** (Lucide `undo-2` icon), under a "Review" nav group. Badge on the nav item = count of open requests (`appliedAt IS NULL AND dismissedAt IS NULL`) for this HR's site-anchored workers. Supervisor and worker never see this screen; they stay on mobile (locked).

**Site-anchoring (founder-locked 2026-06-08).** HR sees only requests whose target worker has an `Assignment(state ACTIVE|DRAFT)` to a Site where `Site.ownerHrUserId = me` (resolved server-side via `getHrSiteIds`). **An HR who owns zero sites sees an empty queue by design** — this is not an error; it is the "no sites assigned to you yet" empty state (§6). Client never sends `companyId`; tenant + site scope are derived from `req.auth`.

---

### 2. Layout / sections

Two-pane master-detail. Desktop **1440** primary; **375** mobile is a documented fallback.

**Desktop 1440**

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Top bar:  AXHY · HR        [ search workers ]              HR name · site ▾ │
├──────────┬────────────────────────────────────────────────────────────────┤
│ Left nav │  REVERSAL REQUESTS                                              │
│          │  ┌──────────────────────────────────────────────────────────┐  │
│ Home     │  │ Filter chips:  [ Open ]  [ Reviewed ]   Kind ▾   Site ▾   │  │
│ Workers  │  ├──────────────────────────────────────────────────────────┤  │
│ ▸Review  │  │ QUEUE TABLE (dense rows, createdAt DESC)                  │  │
│  Reversal│  │  Worker | What undo | Supervisor | When sent | Action age │  │
│  requests│  │  ● row (selected → opens right sheet)                     │  │
│  (badge) │  │  ○ row                                                    │  │
│ Leave    │  │  ...                                                      │  │
│ Audit    │  │  [ Load more ]   (cursor pagination)                      │  │
│          │  └──────────────────────────────────────────────────────────┘  │
│          │                                            ┌──────────────────┐ │
│          │                                            │ REVIEW SHEET     │ │
│          │                                            │ (right drawer,   │ │
│          │                                            │  480px, on row   │ │
│          │                                            │  select)         │ │
│          │                                            └──────────────────┘ │
└──────────┴────────────────────────────────────────────────────────────────┘
```

- **Queue table** is the master list. Selecting a row slides in the **review sheet** as a right drawer (480px), pushing/overlaying the table. Progressive disclosure: list shows the minimum; the sheet shows everything.
- **No bulk actions in v1.** Each reversal is a distinct compensating DB write with its own audit; bulk-apply is explicitly out of scope (one approval per item; mirrors the cognitive-system "1 edit per approval" discipline and avoids accidental mass-undo). A "Bulk decline" affordance may be added later — render nothing now.

**375 mobile note.** Single column. Queue table collapses to stacked cards (Worker name bold, one-line "what to undo", supervisor + "sent 2 days ago" meta, a flagged-amber "Open" chip). Tapping a card pushes a full-screen review sheet (not a drawer) with a back chevron. Filters collapse into a single **Filter** button → bottom sheet. All targets ≥ 44px. The portal must remain usable here but is not the primary canvas.

---

### 3. Review sheet — header data fields (every field)

The sheet is keyed off one `SupervisorDecision` row of `kind = LATE_REVERSAL_REQUEST`, joined to its source `AuditEvent` and the underlying target row. **Today no HR endpoint returns this composite** — until `GET /hr/reversals` (and a detail read) ship, the sheet renders the **"not built yet"** state (§6). The field map below is the contract `GET /hr/reversals` must satisfy.

| Display label                    | Source (exact)                                                                  | Type / enum values                    | Notes                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker name                      | DERIVED (Worker.name via `SupervisorDecision.payload.sourceTargetId` → resolve) | string                                | `payload.sourceTargetId` is the source event's target (worker / leave / assignment / invite). Resolve to a human worker name server-side; **NEW** join in `GET /hr/reversals`. |
| Request ID                       | `SupervisorDecision.id`                                                         | uuid                                  | Mono font label; used as the `:id` in apply/reject paths.                                                                                                                      |
| What the supervisor wants undone | DERIVED from `SupervisorDecision.payload.sourceKind`                            | enum (see chip table below)           | Plain-words sentence, e.g. "Undo: worker marked absent".                                                                                                                       |
| Reversible?                      | DERIVED (`isReversibleActivityKind(sourceKind)`)                                | boolean                               | Drives whether **Apply undo** is enabled (§5). Reversible set: `WORKER_MARKED_ABSENT`, `LEAVE_APPROVED`, `ASSIGNMENT_CREATED`, `REPLACEMENT_INVITE_ACCEPTED`.                  |
| Supervisor note                  | `SupervisorDecision.payload.note`                                               | string \| null                        | Free text the supervisor typed when sending. If null → "No note added."                                                                                                        |
| Sent to HR                       | `SupervisorDecision.payload.requestedAt`                                        | ISO ts → display en-IN                | e.g. "13 Jun 2026, 2:15 pm". Source of truth is the `payload.requestedAt` stored at decision creation time (line 523 of activity-reverse-service.ts).                          |
| Sent by                          | DERIVED (User.name via `SupervisorDecision.supervisorId`)                       | string                                | `supervisorId` is **User.id**, not Membership.id (panel-locked). NEW join.                                                                                                     |
| Decision tier                    | `SupervisorDecision.tier`                                                       | `OPERATIONAL` (always, for this kind) | Hidden by default; show only in an "advanced details" expander.                                                                                                                |
| Status                           | DERIVED (`appliedAt`, `dismissedAt` pair)                                       | Open \| Applied \| Declined           | See state chips §6. `appliedAt!=null`→Applied; `dismissedAt!=null`→Declined; both null→Open.                                                                                   |
| Decline reason                   | `SupervisorDecision.dismissedReason`                                            | string \| null                        | Shown only when Declined. Field is TEXT type (no length limit on DB side, app should enforce reasonable max server-side).                                                      |
| Original action                  | `SupervisorDecision.payload.sourceKind` + `payload.sourceAuditEventId`          | enum + uuid                           | Links the sheet to the source `AuditEvent`.                                                                                                                                    |
| Original action time             | DERIVED (`AuditEvent.createdAt` of `sourceAuditEventId`)                        | ISO ts → en-IN                        | "Original action: 11 Jun 2026, 9:02 am". NEW join to the source audit row.                                                                                                     |
| Action age                       | DERIVED (`now − AuditEvent.createdAt`)                                          | duration                              | e.g. "2 days ago" — explains why the supervisor could not self-undo.                                                                                                           |
| Source target ID                 | `SupervisorDecision.payload.sourceTargetId`                                     | string \| null                        | Underlying entity (workerId / leaveRequestId / assignmentId / inviteId). Mono label in advanced expander.                                                                      |

**Per-kind context block (what undo will actually do).** Rendered from `sourceKind`; mirror the compensating writers exactly so HR is never surprised:

| sourceKind                    | Plain-words "undo will…"                                                                                   | Underlying row read for context                                          | Fields shown                                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WORKER_MARKED_ABSENT`        | "Remove the absence for this day. The worker's attendance for that date goes back to nothing recorded."    | `Attendance(workerId, date)`                                             | `Attendance.date` (en-IN), `Attendance.status` (PRESENT \| ABSENT_NO_CALL \| ABSENT_APPROVED_LEAVE \| HALF_DAY \| ON_BREAK), `Attendance.reason`, pay impact: `Attendance.payDeductPaise` → **Rupees** (e.g. 50000 paise → "Rs 500 deduction will be cleared"). |
| `LEAVE_APPROVED`              | "Put this leave back to 'Requested' (un-approve it)."                                                      | `LeaveRequest`                                                           | `LeaveRequest.fromDate`–`toDate` (en-IN range), `LeaveRequest.reason`, current `LeaveRequest.state` (must be `APPROVED`), `decidedBy`/`decidedAt`.                                                                                                              |
| `ASSIGNMENT_CREATED`          | "End the assignment that was just created (set it to Terminated)."                                         | `Assignment`                                                             | `Assignment.siteId`→site name, `shiftStart`–`shiftEnd`, `dayMask` (decode 7-char mask → "Mon–Sat"), `validFrom`/`validUntil`, current `Assignment.state` (must be `ACTIVE`).                                                                                    |
| `REPLACEMENT_INVITE_ACCEPTED` | "Cancel the cover. End the replacement worker's assignment and cancel the invite so they can't re-accept." | `ReplacementInvite` + auto-created `Assignment` (`payload.assignmentId`) | `ReplacementInvite.toWorkerId`→worker name, `ReplacementInvite.siteId`→site, `scheduledStart` (en-IN), invite `status` (must be `ACCEPTED`).                                                                                                                    |

**AI / visit context.** The current `LATE_REVERSAL_REQUEST` payload does **not** carry AI confidence or a visit reference (only `sourceAuditEventId`, `sourceKind`, `sourceTargetId`, `note`, `requestedAt`, `requestedBy`). Therefore: render an **"AI / visit context — not available for this request"** placeholder, OR surface it only if `GET /hr/reversals` is later built to join `originContext` / the source event's visit. **Do not show fabricated AI text.** Mark this whole block **NEW (pending endpoint)**.

---

### 4. Queue list columns (every column)

List source = `GET /hr/reversals` (**NEW**), returning `{ items, nextCursor }`, ordered `createdAt DESC, id DESC`, scoped to site-anchored workers. Each `item` is one `LATE_REVERSAL_REQUEST` `SupervisorDecision` (joined as below).

| Column          | Source (exact)                                            | Type / enum                    | Notes                                                                                                   |
| --------------- | --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Worker          | DERIVED (Worker.name via `payload.sourceTargetId`)        | string                         | Bold ink. Primary scan column.                                                                          |
| What to undo    | DERIVED (`payload.sourceKind` → plain words)              | enum→label                     | One line, e.g. "Worker marked absent". Truncate with tooltip.                                           |
| Supervisor      | DERIVED (User.name via `SupervisorDecision.supervisorId`) | string                         | `supervisorId` = User.id.                                                                               |
| Supervisor note | `payload.note`                                            | string \| null                 | Truncated 1 line; "—" if null.                                                                          |
| When sent       | `SupervisorDecision.payload.requestedAt`                  | ts → en-IN relative + absolute | "2 days ago" with hover = "13 Jun 2026, 2:15 pm".                                                       |
| Action age      | DERIVED (`now − sourceAuditEvent.createdAt`)              | duration                       | Why self-undo lapsed.                                                                                   |
| Status          | DERIVED (`appliedAt`,`dismissedAt`)                       | Open \| Applied \| Declined    | Chip (§6). Default filter = Open.                                                                       |
| (row select)    | —                                                         | —                              | Click → review sheet. No inline action buttons in the list (avoid mis-taps; act only inside the sheet). |

Money in any column shown as Rupees-from-paise; dates en-IN; mono font for IDs/timestamps only.

---

### 5. Actions (every action, exact)

Both write endpoints are **NEW**. Until live, the buttons render **disabled with a "Not built yet" tooltip** and the sheet shows the coming-soon state — never imply they work.

#### Action A — Apply undo

| Field                                                        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action                                                       | **Apply undo** (Lucide `undo-2`) — runs the per-kind compensating reverse on HR's authority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Method + path                                                | `POST /v1/hr/reversals/:id/apply` — **NEW**. `:id` = `SupervisorDecision.id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Gate                                                         | `requireAuth` then HR role gate (`requireRole('HR')`; some routes `'OWNER','HR'`). 401 no session, 403 wrong role. Tenant via `withTenantContext`; site-anchoring enforced via `getHrSiteIds` — applying a request for a worker outside your sites → 404 (no info leak).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Request fields                                               | Body `{}` today (forward-compat reserved, mirrors `/activity/:id/reverse`). **NEW endpoint must require `Idempotency-Key` header** and wrap the write in `withIdempotency` (matching the supervisor reverse path at activity.ts line 71). No `companyId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| State-machine transition (decision row)                      | `SupervisorDecision`: Open (`appliedAt=null, dismissedAt=null`) → **Applied** (`appliedAt=now`). Guard: only from Open; re-apply → `409 ALREADY_TERMINAL` (or `ALREADY_APPLIED`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Per-kind underlying transition + tables written + AuditEvent | The endpoint must reuse the EXISTS compensating writers (`reverseActivity` semantics from activity-reverse-service.ts lines 166–408): <br>• `WORKER_MARKED_ABSENT`: delete `Attendance(workerId,date)` → audit `ATTENDANCE_REVERSED` + outbox `worker.absence_cleared`. <br>• `LEAVE_APPROVED`: `LeaveRequest` `APPROVED → REQUESTED` (clear `decidedBy/decidedAt/decisionNote`) → audit `LEAVE_REVERSED` + outbox `worker.leave_reverted`. <br>• `ASSIGNMENT_CREATED`: `Assignment` `ACTIVE → TERMINATED` (`terminatedReason='reversed_within_30_min'`, `terminatedBy=HR userId`) → audit `ASSIGNMENT_REVERSED` + outbox `worker.assignment_terminated_by_supervisor`. <br>• `REPLACEMENT_INVITE_ACCEPTED`: `Assignment ACTIVE→TERMINATED` AND `ReplacementInvite ACCEPTED→CANCELLED` (`respondReason='reversed_by_supervisor'`) → audit `ASSIGNMENT_REVERSED` + outbox `worker.cover_invite_reversed`. <br>Plus the supervisor-intent row — for the HR path expect a `ACTIVITY_REVERSED` (or new `HR_REVERSAL_APPLIED`) AuditEvent carrying `sourceAuditEventId`. Compensating audit is emitted **first**, then the intent row. All writes are INSERT-only on `AuditEvent` (Company→AuditEvent FK RESTRICT, migration 031) — no edit/delete. |
| Idempotency / double-submit                                  | The supervisor reverse path is wrapped by `withIdempotency` (activity.ts line 71); the HR apply endpoint must be too (it is a "safe to retry" compensating write like the supervisor reverse). **UI: disable the button on submit; generate one `Idempotency-Key` per Apply tap and resend the same key on retry.** Server also has a natural guard: a second apply hits the Open-only state guard → `409`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Errors to handle                                             | `409 ALREADY_TERMINAL`/`ALREADY_APPLIED` (someone applied/declined it already), `422 KIND_NOT_REVERSIBLE` (non-reversible kind — Apply must be hidden/disabled for these), `409 UNDERLYING_ROW_MISSING` (the underlying row already changed via another path — "Can't undo — the record has already changed."), `404` (not found / cross-site), `403` wrong role.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Result UI                                                    | Sheet header flips to verified-green **"Applied"** chip; an inline confirmation line states exactly what was undone ("Absence on 11 Jun 2026 removed. Rs 500 deduction cleared."). Row leaves the **Open** filter; appears under **Reviewed**. Toast: "Undo applied." No page reload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

> **Non-reversible kinds:** if `sourceKind` is not in the reversible set, **Apply undo is hidden** and the sheet shows: "This action has no automatic undo. Review and decline, or handle it manually." Only **Decline** is offered. (This matches `KIND_NOT_REVERSIBLE`/422.)

#### Action B — Decline + reason

| Field                       | Value                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action                      | **Decline** (Lucide `x`) — reject the reversal request with a required reason.                                                                                                                                                                                                                                                                  |
| Method + path               | `POST /v1/hr/reversals/:id/reject` — **NEW**. `:id` = `SupervisorDecision.id`.                                                                                                                                                                                                                                                                  |
| Gate                        | Same as Apply (HR role, tenant, site-anchoring via `getHrSiteIds`; 401/403/404).                                                                                                                                                                                                                                                                |
| Request fields              | `{ reason: string }` — recommend **required, max 500 chars** (mirrors the supervisor dismiss input pattern; the field on SupervisorDecision.dismissedReason is TEXT type with no DB-level length constraint, but app should enforce reasonable max server-side for consistency). No `companyId`.                                                |
| State-machine transition    | `SupervisorDecision`: Open → **Declined** (`dismissedAt=now`, `dismissedReason=reason`). Guard: only from Open; else `409 ALREADY_TERMINAL`. **No underlying domain row changes** — decline is purely a queue decision.                                                                                                                         |
| Tables written + AuditEvent | `SupervisorDecision` (the row), plus one INSERT `AuditEvent` (expect `HR_REVERSAL_DECLINED` or similar kind carrying `reason`). INSERT-only, immutable. Do NOT wrap in `withIdempotency` — this is a supervisor-decision-class write with no idempotency key (see GROUND TRUTH: "leave/swap/membership/worker writes have NO idempotency key"). |
| Idempotency / double-submit | **NO idempotency key** — the decline write is NOT wrapped in `withIdempotency`. **UI must disable the submit button during the request and not double-submit**; server's Open-only state guard + the (appliedAt,dismissedAt) discriminator prevents a second decline (`409`).                                                                   |
| Errors                      | `409 ALREADY_TERMINAL` (already applied/declined), `400 BAD_INPUT` (reason missing/too long), `404`, `403`.                                                                                                                                                                                                                                     |
| Result UI                   | Inline reason textarea expands under the **Decline** button; submit disabled until non-empty. On success: flagged-amber→neutral **"Declined"** chip, the reason echoed back, row moves to **Reviewed**. Toast: "Request declined."                                                                                                              |

---

### 6. All states

| State                                                                  | Trigger                                                | What renders                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading skeleton**                                                   | List/sheet fetch in flight                             | Queue: 6–8 shimmer rows (worker block + 4 cell bars), table header static. Sheet: 3 shimmer blocks (header, context, actions). Cream bg, low-contrast paper-grey shimmer.                                                                                                                                           |
| **Empty — no open requests** (list returned `items: []`, HR has sites) | Caught-up state                                        | Centered Lucide `check-circle` in verified-green, headline "All caught up", body: **"No reversal requests right now. Supervisors can undo their own recent actions within 30 minutes — only the ones past that window land here."** This is the required explainer that supervisors self-undo recent ones.          |
| **Empty — no sites assigned to you** (`getHrSiteIds` → none)           | Site-anchoring by design                               | Lucide `map-pin-off` neutral, headline "No sites assigned to you yet", body: "You'll see reversal requests for workers at your sites once a site is assigned to you." **Not an error.**                                                                                                                             |
| **Coming soon / not built**                                            | `GET /hr/reversals` (or apply/reject) not yet deployed | Neutral banner: "Reversal review is coming soon." Buttons disabled with tooltip "Not built yet." Never imply the endpoint exists.                                                                                                                                                                                   |
| **Error + retry**                                                      | Non-2xx on list/sheet                                  | Inline error card (no full-page takeover), Lucide `alert-triangle` in flagged-amber, message mapped from `{error}` code, **Retry** button (terracotta). Map: `QUERY_INVALID`→"Filter not valid — reset filters."; `403`/`SUPERVISOR_ROLE_REQUIRED`→"You don't have access."; 5xx→"Something went wrong. Try again." |
| **Action in-flight**                                                   | Apply/Decline submitting                               | Button shows spinner + label "Applying…/Declining…", disabled; whole sheet inert (prevents double-submit).                                                                                                                                                                                                          |

**Machine-state chips (plain words).**

| Chip label   | Condition                                   | Color (locked)                                                        |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------- |
| **Open**     | `appliedAt IS NULL AND dismissedAt IS NULL` | flagged-amber `#D97706` (attention)                                   |
| **Applied**  | `appliedAt IS NOT NULL`                     | verified-green `#059669` (positive/verified)                          |
| **Declined** | `dismissedAt IS NOT NULL`                   | ink/neutral grey (terracotta reserved for primary action, not status) |

---

### 7. Filters / search / pagination (exact)

**Filters** (chips above the table):

- **Status**: `Open` (default) / `Reviewed` (Applied + Declined) — client-side over the fetched window, or server param if `GET /hr/reversals` supports `?status`. Mark server-side `status` as **NEW (optional)**.
- **Kind** dropdown: All / Worker marked absent / Leave approved / Assignment created / Replacement accepted — maps to `payload.sourceKind`.
- **Site** dropdown: only the HR's own sites (resolved via `getHrSiteIds`).

**Search**: by worker name (top-bar). Server param **NEW**; until then, client-side filter over the current page only — label it "Search (this page)".

**Pagination**: **cursor only** — `GET /v1/hr/reversals?cursor=<opaque>&limit=<n>` → `{ items, nextCursor }`. Order `createdAt DESC, id DESC`. "Load more" appends; when `nextCursor` is null, hide the button and show "End of list." No page numbers, no offset. Invalid cursor → `400 QUERY_INVALID` → reset to first page with a toast.

---

### 8. Money + dates formatting (locked)

- **Money**: every paise integer → Rupees. `Attendance.payDeductPaise` (and any pay field) divided by 100, formatted `Rs {amount}` with en-IN grouping. `50000 paise` → **"Rs 500"**. Never show raw paise.
- **Dates**: storage `YYYY-MM-DD` (e.g. `LeaveRequest.fromDate`), timestamps ISO. **Display always en-IN**: `13 Jun 2026, 2:15 pm`; date-only `11 Jun 2026`; ranges `11 Jun – 13 Jun 2026`. Relative ("2 days ago") allowed in list with absolute on hover.
- **dayMask** decode: 7-char Mon–Sun mask → readable ("MTWTFS\_" → "Mon–Sat", "**\_\_\_**" → "None").

---

### 9. Design notes (locked terracotta / paper brand)

- **Palette**: cream bg `#FFFBEB`; ink text `#0F172A`. **The ONE accent terracotta `#9A3412` (hover `#C2410C`)** goes on exactly: the **Apply undo** primary button, the selected-row left border, the active filter chip, "Load more", and "Retry". Nothing else competes for it.
- **Green only positive/verified**: the **Applied** chip and the post-apply confirmation tick. Never for navigation or neutral counts.
- **Amber only flagged/attention**: the **Open** chip, the error icon, and the nav badge count. Decline button is neutral/ink outline (a destructive-but-reasoned action, not an emergency) — terracotta stays on the constructive Apply.
- **Density**: dense table (row height ~44px desktop, comfortable enough for 375). Zebra-free; thin paper-grey row dividers. Selected row: terracotta 2px left border + faint cream-tint fill.
- **Typography**: Inter for all UI; Noto Sans Devanagari/Telugu for hi/te worker names and notes; **mono only for data labels** — request IDs, UUIDs, timestamps, paise-derived amounts in the advanced expander. Worker names and plain-words sentences stay Inter.
- **Icons**: Lucide only, no emoji. `undo-2` (apply/area), `x` (decline), `check-circle` (caught-up), `map-pin-off` (no sites), `alert-triangle` (error), `clock` (action age).
- **Progressive disclosure**: list shows the 8 scan columns; everything else (tier, source IDs, raw audit refs) lives in an **"Advanced details"** expander inside the sheet so the default view stays calm.
- **Accessibility (WCAG AA)**: all status conveyed by **label + color** (never color alone); chips carry text. Sheet is a focus-trapped dialog; Esc closes; the triggering row regains focus on close. Buttons ≥ 44px touch at 375. Contrast: terracotta `#9A3412` on cream passes AA for the button; amber/green chips use ink text on tinted fills to clear AA.
- **Honesty rule**: any NEW endpoint that isn't deployed renders disabled + "Not built yet"; the screen must never present an unbuilt endpoint as live.

---

**Endpoint tag summary**

| Endpoint                                                                   | Tag                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------- |
| `POST /v1/activity/:id/soft-flag` (feeds the queue)                        | **EXISTS**                                     |
| `POST /v1/activity/:id/reverse` (supervisor self-undo, ≤30 min)            | **EXISTS**                                     |
| `GET /v1/hr/reversals` (queue list)                                        | **NEW**                                        |
| `POST /v1/hr/reversals/:id/apply`                                          | **NEW**                                        |
| `POST /v1/hr/reversals/:id/reject`                                         | **NEW**                                        |
| Worker/supervisor/site/leave/assignment name joins + AI-visit context join | **NEW** (must be added to `GET /hr/reversals`) |

Sources: [Enterprise UX Design Guide 2026 — Fuse Lab Creative](https://fuselabcreative.com/enterprise-ux-design-guide-2026-best-practices/), [8 Enterprise UX Design Best Practices — UX Pilot](https://uxpilot.ai/blogs/enterprise-ux-design), [Best Practice: Request queues — Adobe Workfront](https://experienceleague.adobe.com/en/docs/workfront-learn/tutorials-workfront/best-practices/request-queues-bp)

---

## Company policies (set EXISTS; read+history = NEW)

### Area scope & backend truth

This area covers the HR portal surface for company policies (per-tenant config rules). The **write** path is live; the **read** paths (list current, history) are **NEW** and must be built — every list/detail screen renders a coming-soon empty state until those endpoints ship.

| Concern           | Truth                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base              | `/v1`                                                                                                                                                                                                                                                                 |
| Auth context      | `req.auth = {userId, companyId, role, membershipId, epoch}`; client NEVER sends `companyId`                                                                                                                                                                           |
| Tenant            | `withTenantContext` sets GUC `axhy.current_company_id`; RLS FORCE; `Company.status` must be `ACTIVE` (else `COMPANY_NOT_ACTIVE` 403)                                                                                                                                  |
| Model             | `Policy` (append-only; newest row by `setAt` = current; `value:null` = delete-sentinel)                                                                                                                                                                               |
| Audit             | every write appends immutable `AuditEvent` kind `POLICY_CHANGED`. No edit, no delete anywhere                                                                                                                                                                         |
| HR site-anchoring | Does NOT apply here — Policy is company-scoped, not worker/site-scoped. No empty-by-design-from-no-sites case                                                                                                                                                         |
| Brand             | terracotta accent `#9A3412` (hover `#C2410C`); cream bg `#FFFBEB`; ink `#0F172A`; verified-green `#059669` positive only; flagged-amber `#D97706` attention only. Inter UI, mono for data labels/keys. Lucide icons, no emoji. Desktop-first, works at 375px. WCAG AA |

### Backend endpoints (authoritative)

| #   | Method + path                      | Status     | Gate                                                           | Returns / Notes                                                                                                                                                                                                               |
| --- | ---------------------------------- | ---------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | `POST /admin/policy`               | **EXISTS** | `requireAuth`; per-key ACL via `assertPolicyKeyAllowedForRole` | Body `{key, value, category}` → `{policyId, setAt, previousValueSnapshot}`. Append-only. Writes `Policy` + `AuditEvent(POLICY_CHANGED)` + Notification (kind not yet in enum, see defect below) to active OWNERs except actor |
| E2  | `GET /admin/policy` (list current) | **NEW**    | —                                                              | Must be built. List current value per key                                                                                                                                                                                     |
| E3  | `GET /admin/policy/:key/history`   | **NEW**    | —                                                              | Must be built. Append-only history for one key                                                                                                                                                                                |

> The route uses `requireAuth` only — there is NO `requireRole('HR')` at the route level. Authorization is enforced **per key** by the namespace ACL. An HR user can write any key EXCEPT the OWNER-only namespaces (`ai.rules.company.*`, `ai.limits.*`), which return `POLICY_KEY_FORBIDDEN_FOR_ROLE` 403. Do not draw a blanket "HR can edit all policies" affordance.

### Error contract (exact)

| `error` code                    | HTTP | Trigger                                               | UI copy (plain words)                                                   |
| ------------------------------- | ---- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `AUTH_REQUIRED`                 | 401  | no session                                            | Redirect to login                                                       |
| `BAD_INPUT`                     | 400  | Zod fail (key empty/>200 chars, bad category)         | "Something in this rule isn't valid. Check the value and try again."    |
| `POLICY_KEY_FORBIDDEN_FOR_ROLE` | 403  | role not in key's allow-list (carries `allowedRoles`) | "Only the owner can change this rule." (use `allowedRoles` to name who) |
| `COMPANY_NOT_ACTIVE`            | 403  | `Company.status != ACTIVE`                            | "Your company account is paused. Contact Axhy support."                 |
| (generic 5xx)                   | 500  | unexpected                                            | "Couldn't save. Try again." + Retry                                     |

### Category enum (exact)

`PolicyCategorySchema = 'sla' | 'notification' | 'worker' | 'hr' | 'ai' | 'owner' | 'handoff'`. The category is a required write field. Plain-words display labels:

| `category` value | Plain-words label |
| ---------------- | ----------------- |
| `sla`            | Response times    |
| `notification`   | Notifications     |
| `worker`         | Worker rules      |
| `hr`             | HR rules          |
| `ai`             | AI rules          |
| `owner`          | Owner settings    |
| `handoff`        | Handover          |

### Known launch keys (from `DEFAULT_POLICY_KEYS`) — drives plain-words titles

| `key` (mono, exact)                   | Plain-words title                     | `category`   | Value type hint         | HR may edit? |
| ------------------------------------- | ------------------------------------- | ------------ | ----------------------- | ------------ |
| `hr.queue.urgent_sla_minutes`         | Urgent request reply time (minutes)   | sla          | number                  | Yes          |
| `hr.queue.next_day_sla_minutes`       | Next-day request reply time (minutes) | sla          | number                  | Yes          |
| `hr.queue.standard_sla_days`          | Standard request reply time (days)    | sla          | number                  | Yes          |
| `hr.pod.target_worker_count`          | Workers per HR (target)               | hr           | number                  | Yes          |
| `hr.pod.target_supervisor_count`      | Supervisors per HR (target)           | hr           | number                  | Yes          |
| `worker.preferred_language_default`   | Default worker language               | worker       | string (`hi`/`te`/`en`) | Yes          |
| `worker.termination_appeal_days`      | Days a worker can appeal removal      | worker       | number                  | Yes          |
| `ai.backlog.chip_upgrade_seconds`     | AI: slow-queue warning (seconds)      | ai           | number                  | Yes          |
| `ai.backlog.global_banner_threshold`  | AI: busy-banner threshold             | ai           | number                  | Yes          |
| `notification.channel_fallback_chain` | Message delivery order                | notification | array                   | Yes          |
| `handoff.max_size_bytes`              | Handover file size cap                | handoff      | number (bytes)          | Yes          |
| `hr_updates.audience_workers_default` | Send HR updates to workers by default | notification | boolean                 | Yes          |

> Keys matching `ai.rules.company.*` or `ai.limits.*` are **OWNER-only**; `ai.rules.hr.*` is HR-allowed. These dynamic keys are not in the default list but may exist; the list screen must read whatever keys exist, not hardcode the table above.

---

## Screen 1 — Policies list (current values)

### 1.1 Purpose + placement

Single landing screen for the policy area at `app.axhy.app/hr/policies`. Sidebar nav item "Company policies" (Lucide `scroll-text`). Shows every policy key with its plain-words title, current value, and since-date. Entry point to edit and to history. **Read endpoint E2 is NEW** — render coming-soon empty state (§1.7-c) until built.

### 1.2 Layout (desktop 1440 primary)

- **Page header**: H1 "Company policies"; subcopy "Rules for your whole company. Changes take effect the next day." Right-aligned: category filter chips.
- **Body**: dense data table, full width, grouped/filterable by category. Sticky header row.
- **375px mobile**: table collapses to stacked cards — title (bold ink), current value (mono), category chip, since-date (muted), chevron to detail. No horizontal scroll.

### 1.3 Data fields (page-level)

| Display label          | Source                                                    | Type / enum                     | Notes                                             |
| ---------------------- | --------------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| Company name           | DERIVED (`auth.companyId` → Company.name, separate fetch) | string                          | Header context only; client never sends companyId |
| Active category filter | UI state                                                  | `all` + the 7 `category` values | Default `all`                                     |

### 1.4 List columns

| Column        | Source                                        | Type / enum                            | Notes                                                                                                                                                  |
| ------------- | --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rule          | DERIVED (plain-words title from `Policy.key`) | string                                 | Title from key→title map (§ launch keys). Unknown key → show key as-is in mono                                                                         |
| Key           | `Policy.key`                                  | string ≤200                            | Mono, muted, secondary line under Rule                                                                                                                 |
| Current value | `Policy.value` (newest row)                   | Json (string/number/array/object/bool) | Render by type: number plain; boolean "On/Off"; array as comma list; money keys → Rupees-from-paise. `value:null` → render "Not set" (delete-sentinel) |
| Category      | `Policy.category`                             | enum (7)                               | Plain-words chip (§ category table)                                                                                                                    |
| Since         | `Policy.setAt` (newest row)                   | timestamp ISO                          | Display en-IN "13 Jun 2026, 2:15 pm"                                                                                                                   |
| Set by        | DERIVED (`Policy.setBy` → User name)          | string                                 | NEW join; if E2 doesn't return name, show "—"                                                                                                          |
| (row action)  | —                                             | —                                      | "Edit" button + "History" link                                                                                                                         |

> `setBy` resolution depends on E2's response shape (NEW). If E2 returns only `Policy` rows, name is a separate lookup — mark "Set by" as deferred until E2 is finalized; never imply the name exists if the endpoint doesn't return it.

### 1.5 Actions

| Action             | Method+path (status)                                          | Request fields  | State machine | DB written + Audit | Idempotency / double-submit | Result UI                          |
| ------------------ | ------------------------------------------------------------- | --------------- | ------------- | ------------------ | --------------------------- | ---------------------------------- |
| Load list          | `GET /admin/policy` (**NEW**)                                 | `?cursor&limit` | n/a (read)    | none               | n/a                         | Render rows or empty state         |
| Filter by category | client-side (or `GET /admin/policy?category=` if E2 supports) | `category`      | n/a           | none               | n/a                         | Filtered list; URL reflects filter |
| Open Edit          | navigates to edit flow (Screen 2)                             | —               | n/a           | none               | n/a                         | Edit panel/route                   |
| Open History       | navigates to Screen 3                                         | `key`           | n/a           | none               | n/a                         | History route                      |

> Policy has NO lifecycle state machine — it is append-only config. There is no from→to transition; "current" is simply the newest row by `setAt`. Do not draw status chips implying a workflow.

### 1.6 Filters / search / pagination (exact)

- **Pagination**: cursor — `?cursor&limit` → `{items, nextCursor}`; ordered `setAt DESC, id DESC` (Policy has no `createdAt`, only `setAt`). Infinite scroll OR "Load more" button bound to `nextCursor`. When `nextCursor` is null, hide the control. **Endpoint NEW — pagination contract assumed from house standard; confirm when E2 ships.**
- **Search**: free-text over Rule title + Key (client-side over loaded page is acceptable; server search not in contract).
- **Filter**: category chips (8: All + 7 categories).

### 1.7 States

- **(a) Loading**: skeleton table — 8 rows, shimmer on Rule/Value/Since cells; cream bg, no spinner-only screens.
- **(b) Empty — no policies set yet** (E2 live, zero rows): centered illustration; "No company rules set yet." + subcopy "When you set a rule, it shows here." No CTA (HR sets keys from specific feature screens, not a free-form "add policy" form — there is no generic create-key UI in the write contract).
- **(c) Coming-soon — E2 not built**: muted banner across body — "Viewing your saved rules is coming soon." Lucide `clock`. No fake rows. Edit flow (E1) may still be reachable from feature-specific screens, but this list cannot enumerate keys until E2 exists.
- **(d) Error + retry**: inline error card with `error` code copy (§ error contract) + "Try again" button (re-fires E2).
- **State chips**: none (no machine). Category chips only — neutral cream/ink; do NOT use green/amber for category.

### 1.8 Design notes

- ONE accent (terracotta `#9A3412`) only on: the "Edit" button and active category-filter chip. Hover `#C2410C`.
- `Policy.key` and raw `Policy.value` in **mono** (data-label font).
- Green/amber: NOT used here (no positive/flag semantics in a config list). Keep neutral ink/cream.
- Density: compact table rows (~44px), 13–14px Inter body, mono 13px for keys/values. AA contrast on cream.

---

## Screen 2 — Edit flow (set a policy value)

### 2.1 Purpose + placement

Modal/side-panel (desktop) or full-screen route (375px) launched from a list row "Edit" or from a feature screen. Sets a new value for one `key`. **Backend E1 is EXISTS (live).** The mandatory "takes effect tomorrow" confirm copy is a UI requirement, not a backend field.

### 2.2 Layout

- **Header**: plain-words Rule title; below it `key` in mono + current category chip.
- **Current value** (read-only): `Policy.value` rendered by type. Muted.
- **New value** input: type-appropriate control (number stepper, text, toggle for boolean, ordered list editor for array). Inline validation.
- **Confirm strip** (MANDATORY): persistent callout — Lucide `calendar-clock`, terracotta-tinted cream — copy: **"This change takes effect tomorrow, not immediately. Today's work follows the current rule."** A checkbox "I understand it starts tomorrow" gates the submit button.
- **Footer**: "Cancel" (ghost) + "Save rule" (terracotta primary).
- **375px**: full-screen; sticky footer buttons; confirm strip above footer, always visible.

### 2.3 Data fields

| Display label  | Source                       | Type / enum                            | Notes                                                                                              |
| -------------- | ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Rule           | DERIVED (title from `key`)   | string                                 | Read-only                                                                                          |
| Key            | `Policy.key` (request `key`) | string ≤200                            | Read-only when editing a known key; mono                                                           |
| Category       | request `category`           | enum (7)                               | Read-only for known keys (taken from key map); selectable only if a new dynamic key                |
| Current value  | `Policy.value` newest        | Json                                   | Read-only                                                                                          |
| New value      | request `value`              | Json (string/number/bool/array/object) | Required-ish; setting `null` = delete-sentinel (advanced — gate behind explicit "Clear this rule") |
| Effective note | UI constant                  | text                                   | "Takes effect tomorrow" — NOT a backend field; no `effectiveAt` exists                             |

> There is NO `effectiveAt`/scheduling column in `Policy`. "Tomorrow" is a product rule the system honors elsewhere; the write itself is immediate-append. The confirm copy sets correct expectation — do not render a date-picker implying the user schedules it.

### 2.4 Actions

| Action                | Method+path (status)              | Request fields                                             | State machine                                         | DB written + Audit                                                                                                                                                        | Idempotency / double-submit                                                                                                                                                                                          | Result UI                                                                                                                                                  |
| --------------------- | --------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save rule             | `POST /admin/policy` (**EXISTS**) | `{key, value, category}` (companyId from auth, never sent) | none (append-only; newest row = current)              | `Policy` (insert) + `AuditEvent(POLICY_CHANGED, actorId=userId, targetId=policyId)` + Notification (AWAITING KIND ENUM FIX, see defect) to all ACTIVE OWNERs except actor | **NO idempotency key** on policy writes. UI MUST disable "Save rule" on click and keep disabled until response; show inline spinner on button. No retry-on-timeout auto-resubmit — surface error + manual retry only | On 200: toast "Rule saved. Starts tomorrow." Close panel, refresh list row (new value + since-date). Response = `{policyId, setAt, previousValueSnapshot}` |
| Clear rule (advanced) | `POST /admin/policy` (**EXISTS**) | `{key, value:null, category}`                              | none (null = delete-sentinel; key reads as "Not set") | same as above                                                                                                                                                             | same disable-on-submit                                                                                                                                                                                               | Confirm dialog first ("Clear this rule? Workers/HR fall back to the default."). On 200: row shows "Not set"                                                |
| Cancel                | client                            | —                                                          | none                                                  | none                                                                                                                                                                      | n/a                                                                                                                                                                                                                  | Close, no write                                                                                                                                            |

### 2.5 Validation & guards (exact)

- `key`: min 1, max 200 (`BAD_INPUT` 400 if violated).
- `category`: must be one of 7 enum values (`BAD_INPUT` 400).
- ACL: if `key` matches `ai.rules.company.*` or `ai.limits.*` and role ≠ OWNER/SUPER_ADMIN → `POLICY_KEY_FORBIDDEN_FOR_ROLE` 403 with `allowedRoles`. For HR portal: **hide/disable the Edit affordance on OWNER-only keys** and show a lock (Lucide `lock`) + "Only the owner can change this." Do not let HR reach a 403 by surprise; still handle 403 defensively.
- Company paused: `COMPANY_NOT_ACTIVE` 403 → block with "Account paused" message.

### 2.6 States

- **Loading current value**: skeleton on Current value row.
- **Submitting**: button disabled + spinner; all inputs locked.
- **Error**: inline above footer, mapped from `error` code (§ contract). Save re-enabled for manual retry.
- **Success**: toast + panel close.
- **Forbidden (HR on owner-key)**: lock state, Save hidden.
- **No machine chips** — append-only.

### 2.7 Design notes

- Terracotta ONLY on "Save rule" primary + the confirm-strip accent border. Cancel is ghost ink.
- Confirm strip uses cream with a terracotta left-border (4px) — NOT amber (this is informational, not a warning/flag). Amber (`#D97706`) is reserved for genuine attention/flag states and is not used here.
- Green (`#059669`): allowed ONLY on the post-save success toast checkmark.
- `key` + raw values in mono. Inter for prose.
- Double-submit prevention is load-bearing (no Redis idempotency on this route): the disabled-button pattern is mandatory, document it for the designer as a non-decorative requirement.

---

## Screen 3 — Policy history (append-only timeline for one key)

### 3.1 Purpose + placement

Route `app.axhy.app/hr/policies/:key/history`, opened from a list row "History" link. Shows every value this key has ever held, newest first — the append-only audit trail. **Read endpoint E3 is NEW** — render coming-soon state (§3.6-c) until built. **There is NO delete affordance anywhere on this screen, ever.**

### 3.2 Layout

- **Header**: plain-words Rule title + `key` (mono) + "Back to policies".
- **Timeline list**: vertical, newest at top. Each entry: value (mono), who set it, when, and the value it replaced.
- **375px**: same vertical timeline, full-width cards.

### 3.3 Data fields / columns (per history entry)

| Display label  | Source                               | Type / enum    | Notes                                                                                                           |
| -------------- | ------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Value          | `Policy.value`                       | Json           | Newest entry is current. Render by type; `null` → "Cleared (fell back to default)"                              |
| Previous value | `Policy.previousValueSnapshot`       | Json, nullable | NULL on the first-ever set → show "First time set". Mono                                                        |
| Set at         | `Policy.setAt`                       | timestamp ISO  | en-IN "13 Jun 2026, 2:15 pm". Newest first                                                                      |
| Set by         | DERIVED (`Policy.setBy` → User name) | string         | `setBy` is `User.id`; name via NEW join. If E3 returns only id, show shortened id or "—" — do not invent a name |
| Category       | `Policy.category`                    | enum (7)       | Usually constant; chip                                                                                          |
| Current badge  | DERIVED (topmost row)                | boolean        | Green `#059669` "Current" chip on the newest entry ONLY                                                         |

> Money: any paise-int value key (e.g. a bytes/amount key) → render Rupees (50000 paise = Rs 500). `handoff.max_size_bytes` is bytes, not paise — show as size (KB/MB), not Rupees. Type the renderer per key, do not blanket-format.

### 3.4 Actions

| Action        | Method+path (status)                            | Request fields             | State machine | DB written + Audit | Idempotency    | Result UI                       |
| ------------- | ----------------------------------------------- | -------------------------- | ------------- | ------------------ | -------------- | ------------------------------- |
| Load history  | `GET /admin/policy/:key/history` (**NEW**)      | `:key` + `?cursor&limit`   | n/a (read)    | none               | n/a            | Render timeline                 |
| Load more     | same                                            | `?cursor=nextCursor&limit` | n/a           | none               | n/a            | Append older entries            |
| Set new value | links to Screen 2 (`POST /admin/policy` EXISTS) | —                          | append-only   | (see Screen 2)     | (see Screen 2) | Returns here with new top entry |

> **No edit, no delete, no revert button.** "Revert" is NOT a backend operation — to restore an old value the user sets a new row with that value via Screen 2 (E1). If a "Restore this value" convenience is desired, it is sugar over `POST /admin/policy {key, value: <old value>, category}` — label it "Set this value again," not "revert/delete," and it creates a NEW row (does not remove history).

### 3.5 Filters / pagination (exact)

- Cursor: `?cursor&limit` → `{items, nextCursor}`, ordered `setAt DESC, id DESC`. "Load more" bound to `nextCursor`; hide when null.
- No category filter (single key). No search.

### 3.6 States

- **(a) Loading**: skeleton timeline, 5 entries.
- **(b) Empty — key never set**: "This rule has never been changed." (rare — reachable only via direct URL to an unset key).
- **(c) Coming-soon — E3 not built**: muted banner "Rule history is coming soon." Lucide `clock`. No fake entries.
- **(d) Error + retry**: inline card + "Try again" (re-fires E3).
- **No delete affordance** in any state — verify the design has zero trash/delete icons.

### 3.7 Design notes

- Green `#059669`: allowed ONLY on the single "Current" chip (newest entry) — this is the one positive/verified use on this screen.
- Amber: not used (history is neutral record, nothing flagged).
- Terracotta ONLY on the "Set new value" CTA in the header.
- Timeline connector line in muted ink/cream; values + previous values in mono. Append-only feel: entries read top-to-bottom newest→oldest, visually immutable (no hover-edit, no row menus).
- Emphasize permanence in microcopy: "Every change is kept. Nothing is ever deleted."

---

### Cross-screen invariants (designer checklist)

1. Client NEVER sends `companyId` — no company field in any form.
2. Only `POST /admin/policy` (E1) is live. List (E2) and history (E3) are **NEW** → coming-soon states, never fake data.
3. No state-machine chips — Policy is append-only config, not a lifecycle entity.
4. Mandatory confirm copy on edit: "This change takes effect tomorrow, not immediately."
5. Submit button MUST disable during the request (no idempotency key on this route).
6. Zero delete/edit-in-place affordances anywhere (append-only product invariant).
7. HR cannot edit `ai.rules.company.*` / `ai.limits.*` — lock those rows; handle 403 `POLICY_KEY_FORBIDDEN_FOR_ROLE` defensively.
8. Brand: terracotta accent only on primary actions/active filter; green only for "Current"/success; amber unused in this area; cream bg; mono for keys/values; en-IN dates; Rupees-from-paise only where the value is actually paise.

**Files of record:** route `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/admin-policy.ts`; service `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/policy-service.ts` (append + OWNER notify + delete-sentinel); ACL `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/policy-write-acl.ts`; enum/keys `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/policy.ts`; model `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma:1189`; audit kind `POLICY_CHANGED` in `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/audit-event.ts:95`; **DEFECT: Notification kind `policy_changed` is NOT in NotificationKindSchema (`/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/notification.ts:20-35`); the policy-service will fail to create notifications with this kind at runtime.**

---

## Company updates author + ack report (HR authoring = NEW)

### Area summary & build status

| Capability                      | Endpoint                                   | Status     | Notes                                                                                                         |
| ------------------------------- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------- |
| Supervisor reads update feed    | `GET /supervisor/updates`                  | **EXISTS** | Not an HR-portal screen — consumer side, mobile. Listed only to anchor the data contract.                     |
| Supervisor writes 5-word ack    | `POST /supervisor/updates/:id/acknowledge` | **EXISTS** | Mobile. Writes `HRUpdate.acknowledgedBy/acknowledgedAt/acknowledgmentPhrase` + `AuditEvent(HR_UPDATE_ACKED)`. |
| HR composes/publishes an update | `POST /hr/updates`                         | **NEW**    | Does not exist in backend. Screen renders compose form; submit is disabled / "coming soon" until built.       |
| HR lists own updates            | `GET /hr/updates`                          | **NEW**    | Does not exist. List renders coming-soon empty state.                                                         |
| HR ack report per update        | `GET /hr/updates/:id/acks`                 | **NEW**    | Does not exist. AND blocked by schema gap (below).                                                            |

> **Critical schema decision — surface to founder before build.** `HRUpdate` stores a **single** `acknowledgedBy` / `acknowledgedAt` / `acknowledgmentPhrase` on the row (most-recent acker only), confirmed in `schema.prisma:1074-1104` and the supervisor ack route which _overwrites_ these fields on every ack (`supervisor-updates.ts:147-154`). A **true ack report** (who acked + who has not, across many supervisors) is **structurally impossible** on the current schema for any company-wide update read by more than one supervisor — each new ack erases the previous. The ack-report screen therefore CANNOT be built correctly until a per-supervisor join table exists (e.g. `HRUpdateAck { hrUpdateId, supervisorId, phrase, ackedAt, @@unique([hrUpdateId, supervisorId]) }`). Until then the ack-report screen shows a **schema-blocked notice**, not fake data. For a **targeted** update (single `targetSupervisorId`) the single-row ack is correct and could ship first.

### Brand & layout constants (apply to all three screens)

| Token                    | Value                                                                                                                      | Use                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Accent (terracotta)      | `#9A3412`, hover `#C2410C`                                                                                                 | The ONE accent: primary buttons, active tab/nav, focus ring, key links. Never decorative.                             |
| Background (paper/cream) | `#FFFBEB`                                                                                                                  | Page + card surfaces.                                                                                                 |
| Ink                      | `#0F172A`                                                                                                                  | Body text, table data.                                                                                                |
| Verified-green           | `#059669`                                                                                                                  | ONLY: "Acknowledged" chip, ack-rate at/above target, requires-ack=ON success confirmation. Never as a generic button. |
| Flagged-amber            | `#D97706`                                                                                                                  | ONLY: "Awaiting ack" / "Not acknowledged" chip, overdue-ack attention dot, nudge count badge.                         |
| Fonts                    | Inter (UI); Noto Sans Devanagari/Telugu (hi/te); mono for data labels (IDs, timestamps, word-count)                        | —                                                                                                                     |
| Icons                    | Lucide only, no emoji                                                                                                      | `Megaphone` (updates nav), `Send`, `CheckCheck`, `Clock`, `Bell` (nudge), `Users`, `User`.                            |
| Frame                    | Desktop-first 1440 primary (persistent left nav 240px + content), must reflow to 375px (nav collapses to top bar + drawer) | WCAG AA contrast on all chips.                                                                                        |

Shared header on every screen: left nav highlights **Updates** (`Megaphone`). Page title "Company updates". Tabs: **Compose** · **My updates** · (ack report opens from a row, not a top tab).

---

## Screen 1 — Compose update (NEW)

### 1. Purpose & placement

HR drafts and publishes a single update to either the whole company or one supervisor, optionally requiring a typed 5-word acknowledgement. Sits at `app.axhy.app/hr/updates/compose`, default landing of the Updates area.

### 2. Layout

**Desktop 1440:** single centered column, max-width 720px on cream card. Top: page title + sub-line "Supervisors see this in their app. They reply in their own words." Form sections stacked: (A) Kind, (B) Message, (C) Audience, (D) Acknowledgement, (E) sticky footer action bar (Publish primary terracotta + Cancel ghost). Right rail (≥1200px): live "Supervisor preview" card mirroring the mobile update card.
**375px:** single column, preview collapses to a "Preview" accordion below the form; footer action bar pins to bottom, full-width Publish.

### 3. Data fields (form inputs)

| Display label           | Source (Model.field)                                    | Type / enum values                                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update type             | `HRUpdate.kind` (**NEW** write)                         | string, fixed select: `POLICY_CHANGE` · `URGENT_NOTICE` · `PAYROLL_REMINDER` · `GENERAL` | Backend stores `kind` as free string; supervisor feed renders `kind` AS the title (`hr-updates-service.ts:97 title: row.kind`). So `kind` IS the visible title — present as a labelled dropdown with human labels, send the enum token. No free-text title field exists in schema.                                                                                                                                                                                                                                                                                                                                      |
| Message                 | `HRUpdate.content` (**NEW** write)                      | string, multiline, required, non-empty                                                   | Rendered to supervisor "as-is" (schema comment line 1082). No length cap in schema — apply a soft client limit (e.g. 2000 chars) with counter; do not block server-unvalidated.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Audience                | DERIVED → `HRUpdate.targetSupervisorId` (**NEW** write) | radio: `Company-wide` → sends `null`; `One supervisor` → sends UUID                      | `null` = org-wide visible to all supervisors; UUID = that supervisor only (`hr-updates-service.ts:64-67`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Choose supervisor       | `HRUpdate.targetSupervisorId` (**NEW** write)           | searchable select of UUIDs; shows only when "One supervisor" chosen                      | **Site-anchored.** Options limited to supervisors at sites where `Site.ownerHrUserId = me` (`getHrSiteIds`). If HR owns no sites → list is empty BY DESIGN; show inline note "You are not assigned to any sites yet — no supervisors to target." Disable "One supervisor" radio. Supervisor list source endpoint is itself **NEW**.                                                                                                                                                                                                                                                                                     |
| Require acknowledgement | `HRUpdate.acknowledgmentRequired` (**NEW** write)       | boolean toggle, default `false` (schema `@default(false)`)                               | When ON, helper text: "Supervisors must reply in their own words, at least 5 words, before this clears." Server enforces ≥5 words on the supervisor's reply (`MIN_ACK_WORDS=5`).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Acknowledgement phrase  | `HRUpdate.acknowledgmentPhrase` (**NEW** write)         | string, optional; **no default value in schema**                                         | Schema comment 1088-1090 is **incorrect/misleading**: the comment claims "matched case-insensitive" but the actual supervisor ack route (supervisor-updates.ts:23-25) explicitly states "no matching phrase is required, only 5+ words". The supervisor's own typed text **overwrites** this field on ack (supervisor-updates.ts:152); no phrase-matching is enforced. Present as an **optional prompt hint/placeholder only**, label "Prompt hint (optional)" or hide in v0 to avoid confusing HR that supervisors must match a phrase. If shown, explain "Supervisors see this as context but write their own words." |

### 4. Actions

| Action         | Method + path                | Request fields                                                                                                                                                                      | State machine                                                                                | DB tables + AuditEvent                                                                                                                                                                                                 | Idempotency / double-submit                                                                                                                                                                                                              | Result UI                                                                                                                                                                                                                                                                                                                 |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish update | `POST /hr/updates` (**NEW**) | `{ kind, content, targetSupervisorId: string\|null, acknowledgmentRequired: boolean, acknowledgmentPhrase?: string }` — **never send companyId** (server uses `req.auth.companyId`) | New `HRUpdate` row, no prior state → created/published (one-shot, no draft state in schema). | Writes `HRUpdate` (+ `companyId`,`hrId`=auth.userId, `acknowledgedBy`=NULL). Appends `AuditEvent` — **NEW kind, propose** `HR_UPDATE_PUBLISHED` (only `HR_UPDATE_ACKED` exists today). INSERT-only audit, FK RESTRICT. | **No idempotency key** for this write (matches reality: only complaints-reply / activity / visit are `withIdempotency`-wrapped). UI MUST disable Publish during the request and not double-submit; rely on DB constraints + button-lock. | Confirm modal first (below) → on 2xx, toast "Update published" (green check), redirect to My updates with the new row at top. On error, see §6.                                                                                                                                                                           |
| Open confirm   | client-only                  | —                                                                                                                                                                                   | —                                                                                            | —                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                        | Modal: "Publish to **all supervisors** / **[Name]**? Acknowledgement **required / not required**. Supervisors reply in their own words, 5+ words. You cannot edit or delete after publishing." Buttons: Publish (terracotta) / Back. The "cannot edit or delete" line is literal product truth (no edit/delete anywhere). |
| Cancel         | client-only                  | —                                                                                                                                                                                   | —                                                                                            | —                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                        | Discard with "Discard this draft?" guard if form dirty.                                                                                                                                                                                                                                                                   |

### 5. States

- **Loading (supervisor list):** skeleton rows in the select when "One supervisor" chosen.
- **Empty (no owned sites):** target list empty by design → note + disabled targeting (above). Company-wide still allowed.
- **Coming-soon (endpoint NEW):** until `POST /hr/updates` ships, render full form read-only with a banner "Publishing turns on soon" and a disabled Publish button. Never imply the endpoint exists.
- **Submitting:** Publish shows spinner + disabled; whole form locked.
- **Error + retry:** inline banner; Publish re-enabled. Validation: empty `content` → field error "Message can't be empty" (client; server has no content validator so client must guard).
- **Chips:** acknowledgement state preview chip — "Ack required" amber outline when toggle ON, neutral when OFF.

---

## Screen 2 — My updates list (NEW)

### 1. Purpose & placement

HR sees every update they published, newest first, with at-a-glance ack status, and drills into the ack report. `app.axhy.app/hr/updates`.

### 2. Layout

**Desktop 1440:** dense full-width data table on cream. Header row: title "My updates" + "Compose" primary button (terracotta, top-right). Filter bar above table (kind, audience, ack-required). Table rows clickable → ack report.
**375px:** table degrades to stacked cards: kind label (bold) + relative date, audience chip, ack chip, chevron.

### 3. List columns

| Column       | Source (Model.field)                                      | Type / enum                                                             | Notes                                                                                                                                                                                                      |
| ------------ | --------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type         | `HRUpdate.kind`                                           | string enum (see Screen 1)                                              | Render human label; show raw token in mono on hover.                                                                                                                                                       |
| Message      | `HRUpdate.content`                                        | string                                                                  | Truncate to 1 line + ellipsis; full text on row expand.                                                                                                                                                    |
| Audience     | DERIVED from `HRUpdate.targetSupervisorId`                | `Company-wide` (null) / `[Supervisor name]` (UUID→name lookup, **NEW**) | Icon: `Users` for company-wide, `User` for targeted.                                                                                                                                                       |
| Ack required | `HRUpdate.acknowledgmentRequired`                         | boolean                                                                 | Chip "Ack required" (amber outline) / "No ack" (neutral).                                                                                                                                                  |
| Ack status   | DERIVED from `HRUpdate.acknowledgedBy` / `acknowledgedAt` | see chips §6                                                            | **v0 truth-limited:** for company-wide updates this reflects only the most-recent acker (single-row schema). Display honestly as "Last acked by 1" — do NOT show a fake "3 of 10" until join table exists. |
| Acked at     | `HRUpdate.acknowledgedAt`                                 | ISO ts → display en-IN                                                  | e.g. "13 Jun 2026, 2:15 pm". Null → "—".                                                                                                                                                                   |
| Published    | `HRUpdate.createdAt`                                      | ISO ts → display en-IN                                                  | Sort key.                                                                                                                                                                                                  |

### 4. Actions

| Action          | Method + path                              | Request                                                                      | Result UI                                              |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| Load list       | `GET /hr/updates?cursor=&limit=` (**NEW**) | cursor pagination → `{items, nextCursor}`, ordered `createdAt DESC, id DESC` | Renders table; "Load more" when `nextCursor` non-null. |
| Open ack report | row click → Screen 3                       | path `:id`                                                                   | Navigate to `/hr/updates/:id/acks`.                    |
| Compose         | link → Screen 1                            | —                                                                            | —                                                      |

### 5. Filters / search / pagination

| Control             | Param                        | Values                                                                                                                                             |
| ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type filter         | client or `?kind=` (NEW)     | the kind enum set                                                                                                                                  |
| Audience filter     | client/`?audience=` (NEW)    | company-wide / targeted                                                                                                                            |
| Ack-required filter | client/`?ackRequired=` (NEW) | true / false                                                                                                                                       |
| Pagination          | `?cursor=&limit=`            | cursor opaque string; `limit` default 20 (≤50). Response `{items,nextCursor}`. **No page numbers** — cursor only. Order `createdAt DESC, id DESC`. |

### 6. States

- **Loading skeleton:** 8 shimmer table rows (desktop) / 4 cards (375).
- **Empty — no updates yet:** illustration (`Megaphone`) + "You haven't published any updates" + "Compose update" primary button.
- **Empty — no owned sites:** "You're not assigned to any sites, so you have no supervisors to update yet. Talk to the owner about site assignment." (site-anchoring truth; list empty by design, not an error.)
- **Coming-soon (endpoint NEW):** banner "Your updates will appear here once publishing is live" + disabled Compose; never fake rows.
- **Error + retry:** banner "Couldn't load updates" + Retry (re-issues GET).
- **Chips (plain words):**

| Chip label    | Condition                                          | Color                    |
| ------------- | -------------------------------------------------- | ------------------------ |
| Acknowledged  | `acknowledgedBy != null` (targeted)                | verified-green `#059669` |
| Awaiting ack  | `acknowledgmentRequired && acknowledgedBy == null` | flagged-amber `#D97706`  |
| No ack needed | `acknowledgmentRequired == false`                  | neutral ink/grey         |

---

## Screen 3 — Ack report (NEW, schema-blocked for company-wide)

### 1. Purpose & placement

For one update: who acknowledged (with their own 5-word phrase) and who has not, plus a nudge. `app.axhy.app/hr/updates/:id/acks`.

### 2. Layout

**Desktop 1440:** two-zone. Top summary card: the update (kind, content, published date, audience, ack-required). Below: two sections — **Acknowledged** table (left/top) and **Not yet acknowledged** table (right/bottom). Ack-rate stat ("X of Y acknowledged") as a headline number.
**375px:** stacked — summary card, then Acknowledged list, then Not-acknowledged list; nudge buttons full-width.

### 3. Data fields (summary card)

| Display label | Source                            | Type                | Notes                                                                                          |
| ------------- | --------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| Type          | `HRUpdate.kind`                   | enum                | —                                                                                              |
| Message       | `HRUpdate.content`                | string              | Full text.                                                                                     |
| Audience      | DERIVED `targetSupervisorId`      | company-wide / name | —                                                                                              |
| Ack required  | `HRUpdate.acknowledgmentRequired` | boolean             | If false → whole ack-report section hidden, show "This update didn't require acknowledgement." |
| Published     | `HRUpdate.createdAt`              | ISO → en-IN         | —                                                                                              |

### 3b. Acknowledged list columns (target: `GET /hr/updates/:id/acks` **NEW**)

| Column      | Source                                                               | Type        | Notes                                                                                                                |
| ----------- | -------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Supervisor  | NEW (join: ack.supervisorId → name)                                  | string      | v0 single-row source = `HRUpdate.acknowledgedBy` (one only).                                                         |
| Their words | `HRUpdate.acknowledgmentPhrase` (v0) / `HRUpdateAck.phrase` (target) | string      | The supervisor's own typed reply (overwrites HR's prompt). Show verbatim; quote styling. ≥5 words enforced at write. |
| Acked at    | `HRUpdate.acknowledgedAt` / `HRUpdateAck.ackedAt`                    | ISO → en-IN | "13 Jun 2026, 2:15 pm".                                                                                              |

### 3c. Not-yet-acknowledged list columns

| Column        | Source                          | Type        | Notes                                                                                                                     |
| ------------- | ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Supervisor    | NEW (audience set minus ackers) | string      | Requires knowing the full audience — **only computable with a join table**; impossible on single-row v0 for company-wide. |
| Waiting since | DERIVED `HRUpdate.createdAt`    | ISO → en-IN | How long unacked.                                                                                                         |
| Nudge         | action (see §4)                 | —           | —                                                                                                                         |

### 4. Actions

| Action             | Method + path                        | Request                  | State machine   | DB + Audit                                                 | Idempotency / double-submit                                                                                   | Result UI                                                                                                                                         |
| ------------------ | ------------------------------------ | ------------------------ | --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load report        | `GET /hr/updates/:id/acks` (**NEW**) | path `:id`; no companyId | n/a (read)      | read-only, RLS `companyId=auth.companyId`                  | —                                                                                                             | Render two lists + ack-rate.                                                                                                                      |
| Nudge a supervisor | (**NEW** — no endpoint exists)       | TBD `{ supervisorId }`   | n/a until built | would append `AuditEvent` (propose `HR_UPDATE_NUDGE_SENT`) | When built, no idempotency key planned → disable button per-row during request, lock to prevent double-nudge. | Button → "Reminder sent" amber→neutral; per-row, optimistic disable. Until built: button visible but disabled with tooltip "Nudges turn on soon." |

### 5. States

- **Loading skeleton:** summary card shimmer + 4 ack rows.
- **Empty — nobody acked yet:** Acknowledged list empty state "No one has acknowledged yet." Not-acked list shows audience.
- **Empty — everyone acked:** Not-acked list "Everyone has acknowledged." (green check header).
- **Schema-blocked (company-wide, v0):** **mandatory honest notice** — amber callout: "Full who-acked report needs a per-supervisor ack table that isn't built yet. Right now the system only stores the most recent acknowledgement for a company-wide update, so this list can't be complete. Targeted (single-supervisor) updates show correctly." Do NOT render a fabricated multi-supervisor matrix.
- **Coming-soon (endpoint NEW):** if `GET /hr/updates/:id/acks` not yet live → "Ack reports turn on soon" placeholder.
- **Error + retry:** banner + Retry.
- **Chips:** Acknowledged green `#059669`; Awaiting amber `#D97706`; ack-rate number green only when 100%, ink otherwise.

### 6. Ack-rate stat

Display "**N of M acknowledged**" where N = ackers, M = audience size. **v0 honesty:** M for company-wide is unknown from `HRUpdate` alone (no audience snapshot, no per-ack rows) → show "Acknowledged by: [name] · [phrase]" for the single most-recent acker instead of a ratio until the join table lands. For targeted updates, M=1 and the ratio is exact and safe to ship.

---

### Cross-screen error contract (exact)

| Code                | HTTP           | When (this area)                                                               | UI                                     |
| ------------------- | -------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| `AUTH_REQUIRED`     | 401            | no session                                                                     | Redirect to login.                     |
| (role) 403          | 403            | non-HR hitting HR routes (gate `requireRole('HR')`, some allow `'OWNER','HR'`) | "You don't have access to HR updates." |
| `VALIDATION_FAILED` | 400            | (supervisor ack side) <5 words; mirror on any NEW compose validator            | Inline field error.                    |
| `NOT_FOUND`         | 404            | `:id` not in tenant                                                            | "Update not found."                    |
| Generic             | 500 `INTERNAL` | DB error                                                                       | Banner + Retry.                        |

### Money / dates / audit notes

- No money fields in this area (`PAYROLL_REMINDER` is a `kind`, not an amount). If any future kind shows paise, convert: paise int → Rupees (`50000 → Rs 500`).
- All timestamps display en-IN: `13 Jun 2026, 2:15 pm`. Dates `YYYY-MM-DD` on the wire.
- Every successful write appends an immutable `AuditEvent` (INSERT-only, FK RESTRICT). Existing kind: `HR_UPDATE_ACKED`. **Propose new kinds for HR authoring:** `HR_UPDATE_PUBLISHED`, `HR_UPDATE_NUDGE_SENT`. No edit, no delete anywhere — the compose confirm modal must state this.

---

### Files referenced (absolute)

- Schema `HRUpdate` (lines 1074-1104) & `AuditEvent` (564-595): `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma`
- Supervisor routes (ack write, overwrite behavior): `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/supervisor-updates.ts`
- Feed service (kind-as-title, audience rules, single-ack v0): `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/hr-updates-service.ts`
- Wire zod (`HRUpdateRow`, `HRAckRequestBody`): `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/hr-updates.ts`

### Key flags for the designer / founder

1. **All three HR-authoring endpoints are NEW** — verified absent (`grep '/hr/updates'` returns nothing in backend). Screens must render coming-soon/empty states, never imply they exist.
2. **No separate title field** — `HRUpdate.kind` IS the supervisor-visible title. Compose has a Type dropdown, not a free-text title.
3. **Schema gap blocks the true ack report** — single-row `acknowledgedBy` is overwritten per ack; a per-supervisor join table (`HRUpdateAck`) is required before the company-wide ack matrix can exist. Targeted updates can ship first.
4. **acknowledgmentPhrase is NOT a match string** — supervisors reply in their own words (≥5), overwriting HR's preset; the schema comment is misleading (claims "matched case-insensitive" but code explicitly forbids phrase-matching). Present as optional hint or hide in v0 to avoid confusion.
5. **No idempotency** on these writes — UI must disable submit during request and forbid double-submit.

---

# Team / memberships list + invite + (detail/edit/revoke = NEW)

> **Portal:** `app.axhy.app/hr` — HR control plane (desktop-first, dense enterprise admin; must reflow to 375px). Supervisor/worker apps are mobile-locked and out of scope.
> **Backend truth status:** Team list and Invite are **EXISTS** (live endpoints). Member detail, edit, revoke, resend-invite are **NEW** — render a built shell with an empty/coming-soon state until the endpoint ships. Never imply a NEW endpoint exists.
> **Common contract:** Base `/v1`. Auth via `req.auth={userId,companyId,role,membershipId,epoch}` — client NEVER sends `companyId`. Gate: `requireAuth` then `requireRole('OWNER','HR')` for this whole area. Tenant scoping: `withTenantContext`/`withTenantRead` set Postgres GUC `axhy.current_company_id`; RLS FORCE on 27 tables; reads also `WHERE companyId=auth.companyId`. Success = the object directly. Error = `{error:'CODE',message?}` + HTTP status. Lists = cursor pagination `?cursor&limit` → `{items,nextCursor}`, ordered `createdAt DESC, id DESC`.

## 0. Cross-cutting truth (applies to every screen below)

**HR site-anchoring (founder-locked 2026-06-08; site-based, NOT pods).**
`getHrSiteIds(prisma,userId,companyId)` returns sites where `Site.ownerHrUserId = me`. An HR caller sees only memberships of people connected to those sites:

- **Workers** via a live `Assignment(state ∈ {ACTIVE,DRAFT})` to one of my sites, **or**
- **Supervisors** via an active `SiteSupervisorBinding(endedAt = null)` on one of my sites.

If the HR owns **zero** sites → **all lists are empty by design** (this is the "not anchored yet" empty state, not an error). OWNER callers are not site-scoped and see the whole tenant.

**Role vocabulary (exact).** `Role = WORKER | SUPERVISOR | OWNER | HR | SUPER_ADMIN`. This area's list returns HR + SUPERVISOR rows (the people HR/OWNER manage here). Hiring authority (`HIRING_AUTHORITY`, locked): **OWNER → can create HR**; **HR → can create SUPERVISOR**. The invite form's role options depend on caller role (see §2).

**Idempotency reality.** Membership writes have **NO** idempotency key (`withIdempotency` covers only complaints-reply, activity reverse/soft-flag, visit resolve/reject). Therefore the UI MUST disable the submit button for the duration of every membership write and never double-submit. Duplicate protection is the DB unique constraint `Membership @@unique([companyId, userId, role])` → P2002 → `409 MEMBERSHIP_ALREADY_EXISTS`.

**Audit & no-delete.** Every write appends an immutable `AuditEvent` (INSERT-only; `Company→AuditEvent` FK RESTRICT, migration 031). The product has **NO edit-in-place of audit and NO delete anywhere** — "revoke" deactivates a membership, it never deletes the row.

**Rate limits.** Global 100 req/min/tenant + per-route Redis sliding window (fail-open). On `429`, show a soft "Too many requests, try again in a moment" toast; do not hard-block the page.

**Formatting (locked).**
| Concern | Rule | Example |
|---|---|---|
| Money | stored `*Paise: Int` → divide by 100, render Rupees | `50000` → `₹500` ; `8500000` → `₹85,000` |
| Date | `YYYY-MM-DD` on wire; display en-IN | `13 Jun 2026` |
| Timestamp | ISO on wire; display en-IN with time | `13 Jun 2026, 2:15 pm` |
| Phone | `User.phone` is E.164 `^\+\d{8,15}$` | `+919876543210` |

**Brand (founder-locked).** Cream bg `#FFFBEB`; ink text `#0F172A`; ONE accent terracotta `#9A3412` (hover `#C2410C`) — primary buttons, active nav, focus ring, key links only. Verified-green `#059669` ONLY for positive/active/verified states. Flagged-amber `#D97706` ONLY for flagged/attention/needs-action. No other status hues. Fonts: Inter (UI), Noto Sans Devanagari/Telugu (hi/te), a mono family for data labels/IDs/amounts. Lucide icons, no emoji. WCAG AA contrast on every text/control.

---

## 1. Team list `/hr/team` — EXISTS

**1.1 Purpose & placement.** Roster of the HR/supervisor members this caller manages. Entry point to invite (§2), to a member's detail (§3, NEW), and to per-row actions (§4–6, NEW). Lives under the persistent left nav ("Team" item, terracotta active state). Default landing after the HR dashboard.

**1.2 Layout — desktop 1440 (primary).**

- **Page header row:** H1 "Team" (Inter 24/600, ink). Right-aligned primary button **"Invite member"** (terracotta `#9A3412`, Lucide `user-plus`).
- **Toolbar row (below header):** left = client-side search box (Lucide `search`, "Search name or phone"); right-grouped = role filter segmented control `[All · HR · Supervisor]` and status filter `[All · Active · Inactive]`. Note: backend GET supports only `limit` + `cursor` — filters operate **client-side over the loaded page(s)** (see §1.7).
- **Data table** (dense, 44px rows, zebra off, 1px `#0F172A` @ 8% row divider, sticky header). Columns in §1.5. Whole row is a hover target → opens detail (§3). A trailing **row-action `⋯`** (Lucide `more-horizontal`) reveals the per-row menu (Resend invite, Edit, Deactivate) — actions are NEW, so menu items render disabled with a "Coming soon" tooltip until their endpoints ship.
- **Pagination footer:** "Load more" button bound to `nextCursor` (keyset, not numbered pages — see §1.7).

**1.3 Layout — 375px mobile note.** Table collapses to a stacked card list: line 1 = name (600) + role chip; line 2 = phone (mono); line 3 = status chip. `⋯` becomes a bottom-sheet action menu. Search + filters collapse into a single "Filter" sheet trigger. "Invite member" becomes a sticky bottom bar button.

**1.4 Member object — fields from `GET /admin/memberships`.**
The endpoint returns `items[]` with EXACTLY these fields. Do not render any field not listed.

| Display label            | Source (exact)         | Type / enum                                            | Notes                                                                                                                                                                            |
| ------------------------ | ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (internal) Membership ID | `Membership.id`        | uuid                                                   | Row key; not shown as a column. Surface in detail (§3) under a mono "ID" label.                                                                                                  |
| (internal) User ID       | `Membership.userId`    | uuid                                                   | Used to route to detail / actions. Not a visible column.                                                                                                                         |
| Name                     | `user.name`            | string \| null                                         | `User.name` is nullable. If null → show em-dash "—" placeholder, never blank.                                                                                                    |
| Phone                    | `user.phone`           | string (E.164)                                         | mono; always present (`User.phone` is required + unique).                                                                                                                        |
| Role                     | `Membership.role`      | `HR \| SUPERVISOR` (this list)                         | Render as chip — see §1.6. Wider `Role` enum exists but only HR/SUPERVISOR appear here.                                                                                          |
| Status                   | `Membership.status`    | string, default `ACTIVE` (also `INACTIVE` post-revoke) | Render as chip — see §1.6.                                                                                                                                                       |
| Pod                      | `Membership.podId`     | uuid \| null                                           | **Legacy field; site-based model is locked.** Returned by the API but DO NOT surface as "Pod" in UI. Ignore for display; HR ownership is shown via site bindings in detail (§3). |
| Added on                 | `Membership.createdAt` | ISO timestamp                                          | Display en-IN date (`13 Jun 2026`). Default sort key (DESC).                                                                                                                     |

**1.5 List columns (left→right, desktop).**

| #   | Column header | Source                                               | Render                                                  | Width hint |
| --- | ------------- | ---------------------------------------------------- | ------------------------------------------------------- | ---------- |
| 1   | Member        | `user.name` (+ `user.phone` as subtext, mono, muted) | Two-line cell; name 600 ink, phone mono `#0F172A` @ 60% | flex       |
| 2   | Role          | `Membership.role`                                    | Role chip (§1.6)                                        | 120        |
| 3   | Status        | `Membership.status`                                  | Status chip (§1.6)                                      | 120        |
| 4   | Added on      | `Membership.createdAt`                               | en-IN date                                              | 140        |
| 5   | (actions)     | DERIVED                                              | `⋯` row-action menu (NEW items, see §4–6)               | 48         |

**1.6 State chips (plain-words labels, locked palette).**

| Field               | Backend value | Chip label   | Color rule                                                                              |
| ------------------- | ------------- | ------------ | --------------------------------------------------------------------------------------- |
| `Membership.role`   | `HR`          | "HR"         | neutral ink chip on cream; NOT terracotta (accent reserved for actions)                 |
| `Membership.role`   | `SUPERVISOR`  | "Supervisor" | neutral ink chip                                                                        |
| `Membership.status` | `ACTIVE`      | "Active"     | verified-green `#059669` (positive state — allowed)                                     |
| `Membership.status` | `INACTIVE`    | "Inactive"   | muted grey ink chip (NOT amber/red — deactivation is a neutral end-state, not an alert) |

**1.7 Filters / search / pagination (exact).**

- **Pagination = cursor/keyset.** Request `GET /v1/admin/memberships?limit=<1..50>&cursor=<opaque>`; `limit` default 50, **max 50** (server clamps, `400 BAD_INPUT` if out of Zod range). Response `{items, nextCursor}`. `nextCursor` is an opaque base64url of `{createdAt,id}`; pass it back verbatim. **No page numbers, no total count** (keyset has neither) — use a "Load more" button; hide it when `nextCursor === null`. Malformed cursor → `400 CURSOR_INVALID` (treat as a transient client bug; reset to first page).
- **Order is fixed:** `createdAt DESC, id DESC` (newest member first). No column-sort toggle is backed by the API — do not offer server-side sort.
- **Search + role/status filters are client-side** over already-loaded rows (the API exposes no search/role/status params). Make this honest: filter chips say "(in loaded results)" subtext, OR auto-load all pages before filtering for small teams. Do not fake a server search.

**1.8 States.**

- **Loading:** 8-row skeleton matching column widths (shimmer at 8% ink). Header + toolbar render immediately.
- **Empty — not anchored (HR with zero owned sites):** Lucide `map-pin-off`, headline "You're not assigned to any site yet", body "An owner assigns you to a site before your team appears here. One HR owns each site." No invite CTA suppression needed, but note HR can still invite supervisors only once anchored. (This is the `getHrSiteIds → []` path returning `{items:[],nextCursor:null}`.)
- **Empty — anchored but no members:** Lucide `users`, headline "No members on your sites yet", body "Invite a supervisor to get started.", primary "Invite member".
- **Error + retry:** inline card, Lucide `alert-triangle` (amber), "Couldn't load your team", "Retry" button (re-fires GET). On `401` → bounce to login (session gone). On `403` → "You don't have access to Team" (wrong role; should not happen given the gate).

---

## 2. Invite member form `/hr/team/invite` — EXISTS

**2.1 Purpose & placement.** Create a new HR or Supervisor member. Opens as a right-side drawer (640px) over the Team list on desktop; full-screen sheet on mobile. Maps 1:1 to `POST /admin/memberships`.

**2.2 Layout — desktop.** Drawer header "Invite member" + close. Single column, grouped sections: **Person** (name, phone, role) → **Payroll** (base salary, optional bank IFSC + account). Sticky footer: secondary "Cancel" + primary "Send invite" (terracotta). Helper line at top: "This adds the person, sends them an app invite, and notifies the owner."

**2.3 Form fields — exact from `AdminCreateMembershipInput` (Zod).** Client validation MUST mirror these or the server rejects with `400 BAD_INPUT`.

| Display label       | Source (request field) | Type / constraint (exact Zod)                     | UI control & notes                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full name           | `name`                 | string, `min(1) max(120)`, required               | Text input. Inline error if empty / >120.                                                                                                                                                                                                                                                                         |
| Phone number        | `phone`                | string, regex `^\+\d{8,15}$` (E.164), required    | Phone input forcing leading `+` and digits only. Helper "Include country code, e.g. +919876543210".                                                                                                                                                                                                               |
| Role                | `role`                 | enum `HR \| SUPERVISOR`, required                 | Segmented control. **Caller-gated options:** OWNER caller → show **HR** (and Supervisor); HR caller → show **Supervisor only** (HR option hidden/disabled — `HIRING_AUTHORITY: HR→[SUPERVISOR,WORKER]`, HR cannot create HR). Picking a disallowed role → `403 FORBIDDEN_TARGET_ROLE`, so prevent it client-side. |
| Monthly salary      | `baseSalaryPaise`      | int, `nonnegative`, `max 2_000_000_000`, required | **Input in Rupees**, convert to paise on submit (`₹ × 100`). Show "₹" prefix. Validate ≤ ₹20,00,00,000. Helper "Monthly salary." Display any echoed value back as Rupees.                                                                                                                                         |
| Bank IFSC           | `bankIfsc`             | string, `max(16)`, optional                       | Optional. Uppercase. Used for payroll later.                                                                                                                                                                                                                                                                      |
| Bank account number | `bankAcct`             | string, `max(40)`, optional                       | Optional. mono. **Note:** DB schema has no length constraint, but Zod validation (source of truth for API) enforces `max(40)`.                                                                                                                                                                                    |
| (omit) Pod          | `podId`                | uuid, optional                                    | **Do NOT expose.** Pods are dead/legacy; site-based model is locked. Service nulls `podId` for SUPERVISOR anyway and only honors it for HR. Leave unsent.                                                                                                                                                         |

**2.4 Action.**

| Action      | Method + path (status)                    | Request fields                                          | State-machine transition                                                                  | DB written + AuditEvent kind                                                                                                                                                                                                                                                                                                                                               | Idempotency / double-submit                                                                                                                                    | Result UI                                                                                                                                                             |
| ----------- | ----------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send invite | `POST /v1/admin/memberships` **(EXISTS)** | `{phone,name,role,baseSalaryPaise,bankIfsc?,bankAcct?}` | none → membership created at `status:ACTIVE` (no prior state; creation, not a transition) | `User` (upsert by phone, excludes `anon:` rows) + `Membership` (status `ACTIVE`, `@@unique([companyId,userId,role])`) + `AuditEvent kind=MEMBERSHIP_CREATED` (payload `{targetUserId,targetRole,membershipId,createdName}`) + `Notification kind=membership_created` to every ACTIVE OWNER except the actor (channel `in_app_banner`, priority `STANDARD`) — all in ONE tx | **No idempotency key.** MUST disable "Send invite" on click + show spinner; re-enable only on response. Duplicate (same phone+role) → caught by P2002 → `409`. | On `200`: success object `{membershipId,userId,role,status:'ACTIVE'}` → toast "Invite sent to {name}", close drawer, prepend new row to list (or refetch first page). |

**2.5 Errors (exact codes).**

| Code                        | HTTP | Trigger                                                 | UI                                                                                                          |
| --------------------------- | ---- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `BAD_INPUT`                 | 400  | Zod fail (bad phone, name length, salary range)         | Map to the offending field inline; do not toast generically.                                                |
| `FORBIDDEN_TARGET_ROLE`     | 403  | caller role can't create target role (e.g. HR picks HR) | "Your role can't add a {role}." Should be prevented by §2.3 gating.                                         |
| `MEMBERSHIP_ALREADY_EXISTS` | 409  | P2002 on `[companyId,userId,role]`                      | "This person already has a {role} membership in your company." Offer "View member" linking to their detail. |
| `AUTH_REQUIRED`             | 401  | no/expired session                                      | bounce to login.                                                                                            |
| (rate)                      | 429  | tenant/route limit                                      | soft toast "Too many requests, try again shortly." Keep form state.                                         |

**2.6 States.** Submitting = button spinner + disabled + all inputs locked. Validation errors = red inline (use ink + amber accent for the message icon; never introduce a new red unless reserved error red exists — keep to amber `#D97706` for attention). Success = toast + drawer close.

---

## 3. Member detail `/hr/team/:membershipId` — **NEW** (`GET /admin/memberships/:id`)

> **Status: NEW.** `GET /admin/memberships/:id` is not yet built. Render the full page shell with a **"Coming soon"** band where the live fields go; wire it the moment the endpoint ships. The field list below is the **contract the endpoint must satisfy** (do not invent fields beyond the models).

**3.1 Purpose & placement.** Single-member profile: identity, role, status, payroll, and (for supervisors) site bindings. Reached by clicking a list row. Hosts the Edit (§4), Deactivate/Revoke (§5), and Resend-invite (§6) actions.

**3.2 Layout — desktop.** Breadcrumb "Team / {name}". Header: name (H1) + role chip + status chip; right = action cluster `[Resend invite] [Edit] [⋯ → Deactivate]`. Body = two columns: **left (main)** = Identity card + Payroll card + (supervisors) Site bindings table; **right (rail)** = "Activity" timeline sourced from `AuditEvent` for this `targetId` (read-only, newest first) once an audit-read endpoint exists. Mobile: single column, action cluster collapses to a bottom-sheet.

**3.3 Detail fields (contract for the NEW `GET /admin/memberships/:id`).**

| Display label  | Source (exact)               | Type / enum          | Notes                                                                   |
| -------------- | ---------------------------- | -------------------- | ----------------------------------------------------------------------- |
| Name           | `User.name`                  | string \| null       | null → "—".                                                             |
| Phone          | `User.phone`                 | E.164 string         | mono; required/unique.                                                  |
| Locale         | `User.locale`                | string, default `en` | Show as language label (en/hi/te) only if useful; else omit.            |
| Role           | `Membership.role`            | `HR \| SUPERVISOR`   | chip (§1.6).                                                            |
| Status         | `Membership.status`          | `ACTIVE \| INACTIVE` | chip (§1.6).                                                            |
| Member ID      | `Membership.id`              | uuid                 | mono, copy button.                                                      |
| User ID        | `Membership.userId`          | uuid                 | mono, copy button.                                                      |
| Monthly salary | `Membership.baseSalaryPaise` | int paise            | **render Rupees** (`÷100`, en-IN grouping). e.g. `8500000` → `₹85,000`. |
| Bank IFSC      | `Membership.bankIfsc`        | string \| null       | null → "Not set".                                                       |
| Bank account   | `Membership.bankAcct`        | string \| null       | mono; mask all but last 4 (e.g. `••••3210`); null → "Not set".          |
| Added on       | `Membership.createdAt`       | ISO                  | en-IN date+time (`13 Jun 2026, 2:15 pm`).                               |
| Last updated   | `Membership.updatedAt`       | ISO                  | en-IN date+time.                                                        |
| Pod            | `Membership.podId`           | uuid \| null         | **Do NOT display** (legacy).                                            |

**3.4 Supervisor site bindings sub-table (for `role=SUPERVISOR`).**
Source: `SiteSupervisorBinding` where `userId = Membership.userId` (active = `endedAt IS NULL`). This requires its own read (the membership GET may embed it, or a sibling endpoint) — both **NEW**. Until built, show "Site assignments — coming soon".

| Column        | Source (exact)                               | Type                                           | Notes                                               |
| ------------- | -------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Site          | `SiteSupervisorBinding.siteId` → `Site.name` | string                                         | the site this supervisor covers.                    |
| Coverage type | DERIVED from `actingForUserId`               | "Permanent" (null) / "Acting cover" (not null) | acting = temporary coverage for another supervisor. |
| Covering for  | `actingForUserId` → `User.name`              | string \| null                                 | only for acting rows.                               |
| From          | `effectiveFrom`                              | ISO                                            | en-IN date.                                         |
| Until         | `effectiveUntil`                             | ISO \| null                                    | null → "Open-ended".                                |
| Status        | DERIVED from `endedAt`                       | "Active" (null, green) / "Ended" (set, grey)   | `endedAt` set = manually terminated/superseded.     |
| Reason        | `SiteSupervisorBinding.reason`               | string                                         | why binding was created.                            |

For `role=HR`, replace this sub-table with **"Sites owned"** sourced from `Site WHERE ownerHrUserId = Membership.userId` (`Site.name`, `Site.state`) — the site-anchored ownership model. Also **NEW**.

**3.5 States.** Loading = card skeletons. Not-found / cross-tenant id → `404` (RLS hides other tenants' rows) → "Member not found". Error+retry as §1.8. NEW-not-built = "Coming soon" band, header + breadcrumb still render from the list row's data passed in nav state.

---

## 4. Edit salary / bank / pod `/hr/team/:membershipId/edit` — **NEW** (`PATCH /admin/memberships/:id`)

> **Status: NEW.** Endpoint not built. Render the form shell disabled with a "Coming soon" notice; do not POST anywhere until it exists.

**4.1 Purpose.** Update payroll-only fields on an existing membership. **Scope is payroll/bank/pod ONLY** — name, phone, and role are immutable here (role changes go through a separate trust-model path; identity edits are not in this endpoint's stated scope). Drawer over the detail page.

**4.2 Editable fields (contract for the NEW PATCH; mirror create constraints).**

| Display label       | Source (request field) | Type / constraint (expected, mirror create) | Notes                                                                                                                           |
| ------------------- | ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Monthly salary      | `baseSalaryPaise`      | int, nonnegative, max 2_000_000_000         | input in Rupees → ×100 on submit; prefill from current value (paise→Rupees).                                                    |
| Bank IFSC           | `bankIfsc`             | string max 16, optional/nullable            | uppercase.                                                                                                                      |
| Bank account number | `bankAcct`             | string max 40, optional/nullable            | mono. **Note:** DB schema has no length constraint, but Zod validation (source of truth for API) enforces `max(40)`.            |
| Pod                 | `podId`                | uuid, optional                              | **Do NOT expose** — legacy; even though the route name mentions pod, the locked model is site-based. Leave field out of the UI. |

**4.3 Action.**

| Action       | Method + path (status)                      | Request fields                                               | State-machine transition                                                  | DB written + AuditEvent kind                                                                                                                                                  | Idempotency / double-submit                                                                                         | Result UI                                                              |
| ------------ | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Save changes | `PATCH /v1/admin/memberships/:id` **(NEW)** | only changed fields `{baseSalaryPaise?,bankIfsc?,bankAcct?}` | none (field update on an `ACTIVE` membership; not a lifecycle transition) | `Membership` (updates `baseSalaryPaise`/`bankIfsc`/`bankAcct`, bumps `updatedAt`) + `AuditEvent` (expected `kind=MEMBERSHIP_UPDATED`, payload should carry before→after diff) | **No idempotency key** — disable "Save" during request; rely on natural idempotence of a field PATCH + state guard. | success object → toast "Member updated", close drawer, refresh detail. |

**4.4 Errors (expected).** `400 BAD_INPUT` (salary out of range, IFSC>16) → inline. `404` (bad/cross-tenant id) → "Member not found". `401`/`429` per §0. If membership is already `INACTIVE`, edits should be blocked → expect a `409 MEMBERSHIP_INACTIVE` or error indicating edit-not-allowed-when-inactive (guard to be confirmed at backend implementation time).

**4.5 States.** Disabled "Coming soon" until built. When live: dirty-tracking enables Save only when a field changed; spinner+disable on submit.

---

## 5. Deactivate / Revoke (never delete) — **NEW** (`POST /admin/memberships/:id/revoke`)

> **Status: NEW.** Endpoint not built. Action menu item renders disabled with "Coming soon" until live. **This deactivates — it NEVER deletes.** No delete path exists anywhere in the product.

**5.1 Purpose.** Take a member off the team without destroying their record or audit trail. Triggered from the detail header `⋯` or the list row `⋯`. Opens a confirm modal (destructive-action pattern: explicit confirm, named consequences, no accidental trigger).

**5.2 Confirm modal.** Title "Deactivate {name}?". Body (plain words): "They lose app access immediately. Their record, history, and audit trail stay. You can't delete a member — only deactivate." Optional reason textarea (sent if the endpoint accepts one). Footer: secondary "Cancel" + primary "Deactivate" (terracotta `#9A3412`, app accent — the single design accent; no dedicated destructive red is used). Require the button be the deliberate target (no Enter-to-confirm).

**5.3 Action.**

| Action              | Method + path (status)                            | Request fields | State-machine transition                                                                           | DB written + AuditEvent kind                                                                                                                                                                                                                                                                                                                                                                                                         | Idempotency / double-submit                                                                                                                                              | Result UI                                                                                                                                                         |
| ------------------- | ------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deactivate / revoke | `POST /v1/admin/memberships/:id/revoke` **(NEW)** | `{reason?}`    | `Membership.status: ACTIVE → INACTIVE` (deactivate, terminal-ish; reactivation is a separate path) | `Membership` (`status=INACTIVE`, **`tokenEpoch`++** to instantly invalidate every outstanding access token for this membership — see schema note line 138-141), bump `updatedAt` + `AuditEvent` (expected `kind=MEMBERSHIP_REVOKED`, payload `{targetUserId,reason?,priorStatus:'ACTIVE'}`) + likely `Notification kind=membership_created`-style to owners (expected `binding_change`/`hr_update`). **NO Membership row deletion.** | **No idempotency key** — disable "Deactivate" during request; the state-machine guard (`ACTIVE→INACTIVE` only) makes a double-fire return `409 ALREADY_TERMINAL` safely. | On success: toast "{name} deactivated", status chip flips to "Inactive" (grey), action cluster swaps to a "Reactivate" affordance (if/when that endpoint exists). |

**5.4 Errors (expected).** `409 ALREADY_TERMINAL` (already INACTIVE) → "This member is already deactivated." (idempotent UX: just sync the chip). `404` bad/cross-tenant id. `403 FORBIDDEN_TARGET_ROLE` if caller can't manage that role (e.g. HR trying to revoke an HR). `401`/`429` per §0.

**5.5 States.** Confirming = button spinner + disabled + Cancel disabled. Done = optimistic chip flip reconciled with response. Never offer "Delete" anywhere.

---

## 6. Resend invite — **NEW** (`POST /admin/memberships/:id/resend-invite`)

> **Status: NEW.** Disabled "Coming soon" menu item until live.

**6.1 Purpose.** Re-send the app invite/onboarding notification to a member who hasn't onboarded (e.g. never installed the app / lost the message). From list row `⋯` or detail header.

**6.2 Action.**

| Action        | Method + path (status)                                   | Request fields    | State-machine transition                                   | DB written + AuditEvent kind                                                                                                                          | Idempotency / double-submit                                                                                                                                           | Result UI                         |
| ------------- | -------------------------------------------------------- | ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Resend invite | `POST /v1/admin/memberships/:id/resend-invite` **(NEW)** | none (id in path) | none (re-emits a notification; no membership state change) | `Notification` (kind `membership_created`/invite, channel push/SMS) + `AuditEvent` (expected `kind=MEMBERSHIP_INVITE_RESENT`); no Membership mutation | **No idempotency key on this membership write** — disable button + apply a client cooldown (~30s) to avoid spamming. Server also enforces OTP/per-phone cap in Redis. | toast "Invite re-sent to {name}". |

**6.3 Errors (expected).** `409` if member already `INACTIVE` (don't re-invite a deactivated member) → disable the action for INACTIVE rows up front in the UI and return "Cannot resend invite to a deactivated member" if endpoint is called anyway. `404` bad/cross-tenant id. `429` (per-phone OTP cap / route limit) → "Already sent recently, try again in a minute." `401` per §0.

**6.4 States.** Button shows spinner then a brief disabled cooldown with a countdown tooltip.

---

## 7. Global design notes (locked brand application)

- **The ONE accent (terracotta `#9A3412`, hover `#C2410C`)** goes on: "Invite member" / "Send invite" / "Save changes" / "Deactivate" primary buttons, active "Team" nav item, focus rings, and the single key link per view. Everything else is ink-on-cream. Terracotta also serves as the app's destructive-action emphasis (no separate red is used). Never use terracotta for status meaning.
- **Green `#059669`** is allowed ONLY on the **"Active" status chip** and **"Active" binding chip** (positive/verified). **Amber `#D97706`** is allowed ONLY on **error/attention** affordances (retry icon, validation-message icon, rate-limit notice). "Inactive" is neutral grey, not amber/red — deactivation is an end-state, not an alarm.
- **Density:** 44px table rows, 12–16px cell padding, sticky table header, sticky page header on scroll. Drawer width 640px (desktop). Everything reflows to a single column at 375px with card lists and bottom-sheets.
- **Typography:** Inter for all UI; mono for IDs, phone numbers, account numbers, and money labels. Localized copy uses Noto Sans Devanagari/Telugu for hi/te.
- **Icons:** Lucide only (`user-plus`, `more-horizontal`, `search`, `map-pin-off`, `users`, `alert-triangle`, `copy`). No emoji.
- **NEW vs EXISTS honesty:** any NEW action/screen renders a built shell with a literal "Coming soon" state — never a fake-working control. EXISTS = Team list (`GET /admin/memberships`) and Invite (`POST /admin/memberships`) only.
- **Double-submit safety everywhere:** because membership writes carry no idempotency key, every submit/confirm button disables on click for the full request duration and relies on DB unique constraints + state-machine guards (`409 MEMBERSHIP_ALREADY_EXISTS` / `409 ALREADY_TERMINAL`) as the backstop.

---

**Backend files verified:** `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/admin-memberships.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/admin-membership-service.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/middleware/role-gates.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/middleware/hr-site-scope.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/admin-memberships.ts`, and models `User`/`Membership`/`Site`/`SiteSupervisorBinding`/`AuditEvent`/`Notification` in `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma`.

Sources (UX best-practice research, did not override backend truth):

- [Data Table Design UX Patterns & Best Practices — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Enterprise UX: how to design usable data tables — MOZE Studio](https://www.mozestudio.com/journal/enterprise-ux-how-to-design-usable-data-tables)
- [How to Design Effective SaaS Roles and Permissions — Perpetual](https://www.perpetualny.com/blog/how-to-design-effective-saas-roles-and-permissions)

---

## Audit Record (read surface = NEW) + flagged-visit reference

> **Status banner (build-truth):** Every read endpoint in this area is **NEW** — none is live today. The only **EXISTS** endpoints are the two supervisor-only flagged-visit _write_ decisions (`POST /visits/:id/resolve`, `POST /visits/:id/reject`), and HR **cannot** call them (role gate is `SUPERVISOR`). Until the HR read endpoints ship, every screen here renders a **coming-soon empty state**, never fake data. Never imply an unbuilt endpoint exists.
> **Immutability is the product, not a limitation.** There is no edit and no delete anywhere in AXHY. Every write appended an `AuditEvent` (INSERT-only; `Company → AuditEvent` FK is `RESTRICT`, migration 031, "audit immutable" INVARIANT 9). The Audit Record screens must therefore show **zero** edit/delete/archive affordances. The absence of those buttons is a deliberate trust signal — design for it, do not apologise for it.

---

### A0. Area map — where these screens sit

| Screen                                   | Route (portal)                    | Primary read endpoint          | Build state |
| ---------------------------------------- | --------------------------------- | ------------------------------ | ----------- |
| Record list (audit feed, grouped by day) | `app.axhy.app/hr/record`          | `GET /v1/hr/audit`             | **NEW**     |
| Audit detail                             | `app.axhy.app/hr/record/:auditId` | `GET /v1/activity/:id`         | **NEW**     |
| Visit detail (flagged + AI text)         | `app.axhy.app/hr/visits/:visitId` | `GET /v1/visits/:id`           | **NEW**     |
| Flagged-visit list (reference)           | `app.axhy.app/hr/visits/flagged`  | `GET /v1/visits?state=FLAGGED` | **NEW**     |

Common chrome (all four): left nav rail (HR portal sections), top bar (tenant name, HR user, sign-out). Desktop-first 1440 primary; must collapse to 375. Auth context `req.auth = {userId, companyId, role, membershipId, epoch}`; the client **never** sends `companyId`. Gate: `requireAuth` → `requireRole('HR')` (these read routes are HR-scoped; flagged-visit _writes_ are `SUPERVISOR` and are **not** offered to HR).

**HR site-anchoring (load-bearing on every list/detail):** the backend resolves `getHrSiteIds(prisma, userId, companyId)` → sites where `Site.ownerHrUserId = me`. HR sees only workers/visits/audit tied to those sites. **No anchored sites ⇒ empty lists, by design** (one-HR-per-worker, site-based; founder-locked 2026-06-08; this is _not_ pods). This produces a distinct "you own no sites yet" empty state that is **not** an error.

**Global conventions (apply everywhere below):**

- Success response = the object directly. Error = `{ error: 'CODE', message? }` + HTTP status.
- Error codes in play: `QUERY_INVALID` 400, `WINDOW_OPEN` 422, `ALREADY_TERMINAL` 409, `COMPLAINT_TERMINAL` 409, `SUPERVISOR_ROLE_REQUIRED` 403; plus `AUTH_REQUIRED` 401, `403` wrong role, `404` not-found / cross-tenant (a foreign-tenant row returns **404**, never 403 — we never reveal it exists).
- Lists: cursor pagination `?cursor&limit`, response `{ items, nextCursor }`, ordered `createdAt DESC, id DESC`. (⚠️ NOTE: The supervisor activity service does not yet emit pagination cursors; cursor pagination is not yet implemented in the backend. The API response shape is currently `{ rows: [...] }` without nextCursor — this will be added when pagination is built.)
- Dates `YYYY-MM-DD`; timestamps ISO 8601; **display** en-IN (`13 Jun 2026, 2:15 pm`). Money is **paise int** → render Rupees (`50000` paise → `Rs 500`). No money fields surface in this area, but the rule is binding if any appear.

---

### A1. Record list — audit feed, grouped by day (read-only)

**(1) Purpose + placement.** The HR person's single trustworthy ledger of what happened to their workers/sites: "who did what, in plain words." It is the landing screen of the Record section. Read-only by constitutional design — the value proposition _is_ that nobody can edit or erase it.

**(2) Layout.**

- **Desktop 1440:** Three zones. (a) **Filter bar** pinned top (person, site, date, kind). (b) **Day-grouped feed** as the main column (max-width ~960px, left-aligned in content area) — each day is a sticky section header (`Today`, `Yesterday`, then `13 Jun 2026`), under which sit audit rows as a dense table-like list. (c) Right-side **context panel is absent on list**; clicking a row routes to Audit detail (A2). "Load more" button at the bottom drives the cursor.
- **375 mobile:** Filter bar collapses into a single **Filters** button opening a bottom sheet; feed becomes full-width single-column cards (one line summary + timestamp + actor). Day headers stay sticky. "Load more" is full-width.

**(3) Data fields per row.** Source of truth is the **NEW** `GET /v1/hr/audit` response: `{ items: [{ at, summary, kind, targetId }], nextCursor }`. (⚠️ NOTE: The actual supervisor activity response schema is `{ rows: [{ id, kind, when, summary, targetId }] }` with no pagination cursor yet. The HR audit response must be designed similarly or extended with actorName + cursor support during implementation.)

| Display label | Source (exact)                                                               | Type / values                                 | Notes                                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary line  | `item.summary` (DERIVED server-side via `summarizeAuditKind(kind, payload)`) | string, plain English                         | e.g. "Marked 2 workers absent." Backend composes from `AuditEvent.kind` + `payload`; client renders verbatim, never re-derives.                                                                                                                               |
| Who (actor)   | SERVER-SIDE ONLY — not yet in response schema                                | string                                        | The acting user's display name. Backend resolves from actorId; name is NOT returned in the current ActivityRow schema. If HR needs actor names, the endpoint schema must be extended to include actorName (not present in supervisor activity.ts schema yet). |
| When          | `item.at` (maps to `AuditEvent.createdAt`)                                   | ISO timestamp                                 | Display en-IN `13 Jun 2026, 2:15 pm`. Current schema uses `when` per activity.ts.                                                                                                                                                                             |
| Kind tag      | `item.kind`                                                                  | string from open taxonomy (`AuditEvent.kind`) | Not an enum (taxonomy grows without migration). Render as a small mono chip; map known kinds to friendly labels (see A1 kind map). Unknown kind → humanized fallback `Some_kind.`                                                                             |
| Target ref    | `item.targetId`                                                              | string \| null (`AuditEvent.targetId`)        | Polymorphic: worker / site / swap / visit / leave_request id. Drives the "Open detail" deeplink. May be null.                                                                                                                                                 |
| (group key)   | DERIVED from `item.at` (IST day)                                             | —                                             | Client buckets rows into day sections; server already orders `createdAt DESC, id DESC`.                                                                                                                                                                       |

**(4) List columns (desktop dense table variant).** Same fields, as columns: `When (time) | Summary | Who | Kind` — the day header carries the date so rows show **time only** (`2:15 pm`). No row checkbox, no row menu, no inline actions. Clicking anywhere on the row → A2.

**Kind → friendly label map** (mirror of `summarizeAuditKind`; render the chip label, keep raw `kind` in a tooltip/mono). ⚠️ NOTE: The current audit-summary.ts (lines 26-79) does NOT include handlers for VISIT_RESOLVED or VISIT_REJECTED. These cases must be added to audit-summary.ts before the spec's chip colors can render:

| `AuditEvent.kind`                                                | Chip label                                        | Tone color               | Status                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `WORKER_MARKED_ABSENT`                                           | Marked absent                                     | flagged-amber `#D97706`  | ✓ Implemented in audit-summary.ts                                         |
| `WORKER_MARKED_LATE`                                             | Marked late                                       | flagged-amber            | ✓ Implemented (case missing, humanized fallback)                          |
| `LEAVE_REQUESTED`                                                | Leave requested                                   | ink (neutral)            | ✓ Implemented                                                             |
| `LEAVE_APPROVED`                                                 | Leave approved                                    | verified-green `#059669` | ✓ Implemented                                                             |
| `LEAVE_REJECTED`                                                 | Leave rejected                                    | ink                      | ✓ Implemented                                                             |
| `ASSIGNMENT_CREATED`                                             | Assignment created                                | ink                      | ✓ Implemented                                                             |
| `SWAP_REQUEST_SENT`                                              | Swap requested                                    | ink                      | ✓ Implemented                                                             |
| `SITE_COMPLAINT_LOGGED`                                          | Complaint logged                                  | flagged-amber            | ✓ Implemented                                                             |
| `VISIT_RESOLVED`                                                 | Visit cleared                                     | verified-green `#059669` | ⚠️ NOT YET implemented — falls back to humanizeKind() → "Visit resolved." |
| `VISIT_REJECTED`                                                 | Visit rejected                                    | flagged-amber            | ⚠️ NOT YET implemented — falls back to humanizeKind() → "Visit rejected." |
| `VISIT_ENDED`                                                    | Visit closed                                      | ink                      | ✓ Implemented                                                             |
| `BINDING_CREATED` / `BINDING_ENDED_*`                            | Cover started / ended                             | ink                      | ✓ Implemented                                                             |
| `DWI_PROPOSED` / `DWI_APPLIED` / `DWI_DISMISSED` / `DWI_EXPIRED` | Decision proposed / applied / dismissed / expired | ink                      | ✓ Implemented                                                             |
| _unknown_                                                        | Humanized kind (server fallback)                  | ink                      | ✓ Fallback in place                                                       |

> Color rule (locked brand): green is used **only** on positive/verified kinds, amber **only** on flagged/attention kinds. Everything else stays ink. The terracotta accent is **not** used as a kind color — it is reserved for the primary nav/active filter/focus ring (see A1 design notes).

**(5) Actions.** This screen has **no write actions** — that is the feature. The only interactions:

| Action        | Method + path                                    | Request                                                    | State machine | DB writes + AuditEvent | Idempotency / double-submit         | Result UI                                                                     |
| ------------- | ------------------------------------------------ | ---------------------------------------------------------- | ------------- | ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Load feed     | `GET /v1/hr/audit` (**NEW**)                     | query: `person`, `site`, `date`, `kind`, `cursor`, `limit` | none (read)   | none                   | n/a (GET)                           | Renders day-grouped feed                                                      |
| Open a record | `GET /v1/activity/:id` (**NEW**) via row click   | path `:id` = `AuditEvent.id`                               | none          | none                   | n/a                                 | Routes to A2                                                                  |
| Next page     | `GET /v1/hr/audit?cursor=<nextCursor>` (**NEW**) | append `cursor`                                            | none          | none                   | disable "Load more" while in-flight | Appends rows, updates `nextCursor` (⚠️ pagination cursor not yet implemented) |

No edit / delete / export-mutate / reverse buttons **anywhere** on this surface. (Supervisor-only Reverse/Soft-flag exist on the mobile supervisor app within a 30-min window; they are **not** part of the HR portal and must not appear here.)

**(6) States.**

- **Loading:** skeleton = 1 sticky day header bar + 6 shimmer rows (time pill + 70%-width line + short who/kind pills).
- **Empty — no anchored sites:** title "No sites assigned to you yet." Body "You'll see records here once a site is in your name. This is set up by your admin." Lucide `map-pin-off`. This is **by design**, not an error — no retry button, no red.
- **Empty — anchored but no matching records:** title "Nothing recorded for this filter." Body "Try widening the date range or clearing filters." Lucide `inbox`. Offer a "Clear filters" link.
- **Error + retry:** generic failure card "Couldn't load the record." with a terracotta **Retry** button (re-fires the same query). For `QUERY_INVALID` 400 (bad filter value), show inline filter-bar validation instead of the full-page error and do not fire.
- **Coming-soon (endpoint NEW, not yet live):** full-width banner "The Record view is being built. It will show every action on your workers and sites, in plain words — and nothing here can ever be edited or deleted." No fake rows.
- **Machine-state chips:** N/A on rows (audit rows are events, not entities), except where a `kind` implies a visit outcome — those map to the kind chip colors above.

**(7) Filters / search / pagination (exact).**

| Filter     | Query param       | Values / type                                                                                                                          | Backend mapping                                                                                                                                                                                                                                        | Empty default                                                                                      |
| ---------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Person     | `person`          | worker id (UUID)                                                                                                                       | NEW: server narrows to events about that worker within HR's anchored sites                                                                                                                                                                             | all anchored workers                                                                               |
| Site       | `site`            | site id (UUID)                                                                                                                         | NEW: narrows to that site (must be one of HR's `getHrSiteIds`)                                                                                                                                                                                         | all anchored sites                                                                                 |
| Date       | `date`            | `today` \| `yesterday` \| `this-week` \| `all` _(mirror supervisor `DateFilter`)_ or explicit `YYYY-MM-DD` range if range UI chosen    | NEW: maps to `createdAt` IST bounds                                                                                                                                                                                                                    | default **`today`** if the NEW route follows the supervisor service default; show "Today" selected |
| Kind       | `kind`            | friendly groups (`all` \| `absences` \| `lates` \| `leaves` …) ⚠️ NOTE: No `visits` filter category in supervisor activity service yet | NEW: maps to `AuditEvent.kind` `IN (...)`; mirror `KIND_FILTER_MAP` (absences→WORKER_MARKED_ABSENT, lates→WORKER_MARKED_LATE, leaves→LEAVE_REQUESTED\|LEAVE_APPROVED\|LEAVE_REJECTED). Visit-related filter requires extension to activity-service.ts. | `all`                                                                                              |
| Pagination | `cursor`, `limit` | `cursor` opaque string; `limit` int (server caps; supervisor analogue caps 200, default 50)                                            | ⚠️ NOT YET: `{ items, nextCursor }` planned; current ActivityResponse is `{ rows }` with no cursor                                                                                                                                                     | first page no cursor                                                                               |

> Bad filter (e.g. malformed UUID, unknown enum) ⇒ `400 { error: 'QUERY_INVALID' }`. The UI must validate enum/date locally and disable apply until valid; treat any 400 as a filter problem, not a page crash.

**(8) Money / dates.** No money on this surface. Dates: day headers `Today` / `Yesterday` / `13 Jun 2026`; row timestamps time-only `2:15 pm`; tooltips show full `13 Jun 2026, 2:15 pm`. All IST.

**(9) Design notes (locked brand).** Cream page bg `#FFFBEB`; ink `#0F172A` text; rows on white cards with a hairline divider. The **single terracotta accent** `#9A3412` (hover `#C2410C`) goes on: active nav item, the selected filter pill, the focus ring, and the **Load more** button — nowhere else. Verified-green and flagged-amber appear **only** inside kind chips per the map. Day-header timestamps and the raw-kind/mono UUID labels use the mono data face; summary lines use Inter; hi/te names render in Noto Sans Devanagari/Telugu. Density: ~44px row height desktop, comfortable tap target 48px mobile. Lucide icons only, no emoji. WCAG AA contrast on all chip text (amber/green on cream verified). The whole screen should _feel_ like a permanent ledger — no hover states that suggest editability, no trailing kebab menus.

---

### A2. Audit detail

**(1) Purpose + placement.** Full record of one `AuditEvent` — the "open the line" view from A1. Confirms exactly who did what, when, to whom/what, with the structured context the summary compressed. Reached at `/hr/record/:auditId`.

**(2) Layout.**

- **Desktop 1440:** Centered detail card (~720px). Header = the plain-English summary as an H1-ish line, with the kind chip and timestamp beneath. Below: a **definition list** of fields. If `targetId` resolves to a visit/worker/site, a "Open <thing>" link routes onward (e.g. visit → A3). A back link to the feed top-left.
- **375 mobile:** Same content stacked full-width; the definition list becomes label-over-value pairs.

**(3) Data fields.** Source = **NEW** `GET /v1/activity/:id` (HR read of one `AuditEvent`). Current ActivityRow schema does not include actorName; endpoint must be extended or a separate hydration performed during implementation.

| Display label   | Source (exact)                                      | Type / values                                                                                                      | Notes                                                                                                                                                                                  |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary         | DERIVED `summarizeAuditKind(kind, payload)`         | string                                                                                                             | The headline line; verbatim from server.                                                                                                                                               |
| Who             | SERVER-SIDE ONLY — not in current response schema   | string                                                                                                             | The acting user's display name. actorId is not an FK; name resolution required server-side; may show "(removed user)" if actor offboarded. Current schema does not include this field. |
| When            | `AuditEvent.createdAt` (mapped to `when` in schema) | ISO → display `13 Jun 2026, 2:15 pm`                                                                               | IST.                                                                                                                                                                                   |
| Kind            | `AuditEvent.kind`                                   | string (open taxonomy)                                                                                             | Friendly label chip + raw kind in mono.                                                                                                                                                |
| Target          | `AuditEvent.targetId`                               | string \| null                                                                                                     | Polymorphic ref; render a typed "Open …" link when the server tells us the type.                                                                                                       |
| Context details | `AuditEvent.payload` (selected keys)                | JSON; surfaced keys e.g. `workerName`, `siteName`, `reason`, `date`, `status`, `previousState`, `supervisorReason` | Render only whitelisted human keys as a definition list; never dump raw JSON to HR. Money keys (if any) → Rupees-from-paise.                                                           |
| Record id       | `AuditEvent.id`                                     | UUID                                                                                                               | Mono, copyable; proves a specific immutable row.                                                                                                                                       |

**(4) List columns.** None (single-record view).

**(5) Actions.**

| Action      | Method + path                                        | Request    | State machine | DB writes + AuditEvent | Idempotency | Result UI                 |
| ----------- | ---------------------------------------------------- | ---------- | ------------- | ---------------------- | ----------- | ------------------------- |
| Load detail | `GET /v1/activity/:id` (**NEW**)                     | path `:id` | none          | none                   | n/a         | Renders card              |
| Open target | `GET /v1/visits/:id` or worker/site detail (**NEW**) | path       | none          | none                   | n/a         | Routes to A3 (visit) etc. |

**No mutating action exists on this screen.** Explicitly: no edit, no delete, no "undo," no reverse. (Reverse/soft-flag are supervisor-mobile-only and time-boxed; absent here.) A small inline note reinforces it: "This record is permanent. It cannot be edited or removed." — this is positive copy, not an apology.

**(6) States.**

- **Loading:** skeleton headline line + 5 label/value shimmer rows.
- **Empty:** N/A (single resource) — but a not-found / cross-tenant id ⇒ **404** → "Record not found." with back-to-feed link. (404 is also what a foreign-tenant id returns; never reveal existence.)
- **Error + retry:** failure card with terracotta **Retry**.
- **Coming-soon:** if `GET /v1/activity/:id` not yet live, show "Record detail is being built." and keep the back link.
- **Machine-state chips:** if the event references a visit decision (`VISIT_RESOLVED`/`VISIT_REJECTED`) show the resulting visit state chip (Verified green / Rejected amber) sourced from `payload.previousState` + outcome, read-only. ⚠️ NOTE: audit-summary.ts does not yet have case handlers for these kinds; they will render as humanized text until added.

**(7) Filters / pagination.** None.

**(8) Money / dates.** Dates en-IN as above. Any paise-valued payload key → Rupees (`50000 → Rs 500`).

**(9) Design notes.** Cream bg, white card, ink text. Terracotta only on back link, focus ring, and any "Open target" link hover. Mono for `id`/raw-kind/`targetId`. Green/amber strictly per outcome chip. Generous whitespace — this is a "proof" page, calm and authoritative.

---

### A3. Visit detail (flagged + AI verificationText)

**(1) Purpose + placement.** Deep view of one visit, especially a **FLAGGED** one — shows the AI's verification reasoning and the supervisor's decision trail. HR's read-only window into compliance. Reached from A4 (flagged list), from A1/A2 target links, or directly at `/hr/visits/:visitId`.

**(2) Layout.**

- **Desktop 1440:** Two columns. **Left (primary, ~60%):** state chip header → worker / site / schedule facts → **AI Verification panel** (the `verificationText`, prominent, in a bordered amber-tinted card when flagged) → decision trail (resolve/reject outcome + supervisorReason if any). **Right (~40%):** photo strip (before/after counts → thumbnails when a media endpoint exists) and correction-chain info if the visit was corrected. Back link top-left.
- **375 mobile:** Single column; state chip → facts → AI panel → photos → decision trail.

**(3) Data fields.** Source = **NEW** `GET /v1/visits/:id`, hydrating the `Visit` model (exact fields):

| Display label            | Source (`Visit.field`)                                                                 | Type / values                                                                                                                                                         | Notes                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State                    | `Visit.state`                                                                          | enum, 12-state machine: `SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED` | Render as a plain-words chip (see A3 chip map).                                                                                                                               |
| Flagged                  | `Visit.flagged`                                                                        | boolean (default false)                                                                                                                                               | When true → amber "Needs review" banner. Resolve sets it false; reject sets it false.                                                                                         |
| Worker                   | `Visit.workerId`                                                                       | UUID → name resolved server-side                                                                                                                                      | Display name; mono id in tooltip.                                                                                                                                             |
| Site                     | `Visit.siteId`                                                                         | UUID → name                                                                                                                                                           | Must be one of HR's anchored sites or 404.                                                                                                                                    |
| Scheduled for            | `Visit.scheduledFor`                                                                   | DateTime                                                                                                                                                              | en-IN.                                                                                                                                                                        |
| Started at               | `Visit.startedAt`                                                                      | DateTime \| null                                                                                                                                                      | "Not started" if null.                                                                                                                                                        |
| Completed at             | `Visit.completedAt`                                                                    | DateTime \| null                                                                                                                                                      | "Not completed" if null.                                                                                                                                                      |
| Photos before            | `Visit.photosBefore`                                                                   | Int 0–16                                                                                                                                                              | Count; thumbnails only if a media endpoint exists (none specified → counts only, no fake images).                                                                             |
| Photos after             | `Visit.photosAfter`                                                                    | Int 0–16                                                                                                                                                              | Count.                                                                                                                                                                        |
| Voice note               | `Visit.voiceKey`                                                                       | string \| null                                                                                                                                                        | Voice file deleted within 24h after STT — show "Voice note (expires in 24h)" / "Voice note removed" accordingly; do not promise playback unless a signed-URL endpoint exists. |
| **AI verification text** | `Visit.verificationText`                                                               | string \| null (1–2 KB)                                                                                                                                               | The core of this screen. Render full text in the AI panel. Null → "AI verification not available yet."                                                                        |
| AI model                 | `Visit.verificationModel`                                                              | string \| null                                                                                                                                                        | Small mono caption under the AI text (ADR-0023).                                                                                                                              |
| Created / updated        | `Visit.createdAt` / `Visit.updatedAt`                                                  | DateTime                                                                                                                                                              | en-IN; `updatedAt` reflects last decision.                                                                                                                                    |
| Correction: corrects     | `Visit.correctsVisitId`                                                                | UUID \| null                                                                                                                                                          | If set, this row corrects another visit; link to it.                                                                                                                          |
| Correction: original     | `Visit.originalVisitId`                                                                | UUID \| null                                                                                                                                                          | Root of correction chain (equals own id on root).                                                                                                                             |
| Correction reason        | `Visit.correctionReason`                                                               | `'wrong-site' \| 'wrong-time' \| 'duplicate' \| 'wrong-worker' \| 'other'` \| null                                                                                    | Friendly label.                                                                                                                                                               |
| Correction note          | `Visit.correctionNote`                                                                 | string \| null                                                                                                                                                        | Free text.                                                                                                                                                                    |
| Supervisor reason        | DERIVED from the decision `AuditEvent.payload.supervisorReason` (not a `Visit` column) | string \| null                                                                                                                                                        | Shown in decision trail; comes from the resolve/reject audit event, not the Visit row.                                                                                        |

**(4) List columns.** None (single visit). Photo thumbnails (if media endpoint ships) are a strip, not a table.

**(5) Actions.** **HR is read-only here.** The flagged-visit decisions are **SUPERVISOR-only** and must **not** be offered to HR — showing a disabled/forbidden button would mislead. Documented for completeness (these are the EXISTS writes, fired only from the supervisor mobile app):

| Action                                                        | Method + path                              | Request fields                                                        | State machine (from→to)                                                                                                                 | DB tables + AuditEvent kind                                                                                                                | Idempotency / double-submit                                                           | Result UI                                          |
| ------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Resolve flagged visit (**SUPERVISOR only — NOT shown to HR**) | `POST /v1/visits/:id/resolve` (**EXISTS**) | `{ supervisorReason?: string\|null }` (1–1000 chars trimmed, or null) | `Visit FLAGGED → VERIFIED` (also sets `flagged=false`), guard `SUPERVISOR_RESOLVED`; VERIFIED is billable terminal                      | `Visit` (conditional UPDATE on `flagged=true`); `AuditEvent` kind **`VISIT_RESOLVED`** (payload incl. `previousState`, `supervisorReason`) | `withIdempotency`, `Idempotency-Key` honored, routeKey embeds visit id; safe to retry | On supervisor app only. HR never sees this button. |
| Reject flagged visit (**SUPERVISOR only — NOT shown to HR**)  | `POST /v1/visits/:id/reject` (**EXISTS**)  | `{ supervisorReason: string }` (**required**, 1–1000)                 | `Visit FLAGGED → REJECTED` (also `flagged=false`); conditional UPDATE on `flagged=true AND state = FLAGGED` per REJECTABLE_VISIT_STATES | `Visit` UPDATE; `AuditEvent` kind **`VISIT_REJECTED`** (payload incl. `previousState`, `supervisorReason`)                                 | `withIdempotency`; typed-phrase "REJECT" confirm on client; safe to retry             | Supervisor app only.                               |
| HR read                                                       | `GET /v1/visits/:id` (**NEW**)             | path `:id`                                                            | none                                                                                                                                    | none                                                                                                                                       | n/a                                                                                   | Renders this screen                                |

Failure envelopes for the two writes (for the designer's reference, not surfaced in HR portal): `404 VISIT_NOT_FOUND` (or cross-tenant), `409 ALREADY_DECIDED` (`VISIT_NOT_FLAGGED` — already resolved/rejected by another action), `409 VISIT_STATE_INVALID {currentState}` (reject when not in a rejectable state, per RCA-B 2026-06-04: only FLAGGED is rejectable), `403 SUPERVISOR_ROLE_REQUIRED`, `401 AUTH_REQUIRED`.

> The HR portal's honest stance: HR _observes_ compliance, the supervisor _decides_. If product later wants HR to act, that is a new endpoint + new role gate — until then, no decision controls here.

**(6) States.**

- **Loading:** skeleton state chip + 6 fact rows + a tall AI-panel shimmer.
- **Empty:** N/A single-resource; not-found / cross-tenant ⇒ **404** "Visit not found."
- **Error + retry:** failure card + terracotta **Retry**.
- **Coming-soon:** `GET /v1/visits/:id` NEW → "Visit detail is being built." with back link.
- **Machine-state chips (plain words):**

| `Visit.state`           | Chip label      | Color                    |
| ----------------------- | --------------- | ------------------------ |
| `SCHEDULED`             | Scheduled       | ink                      |
| `NOTIFIED`              | Worker notified | ink                      |
| `EN_ROUTE`              | On the way      | ink                      |
| `ON_SITE`               | At site         | ink                      |
| `IN_PROGRESS`           | Cleaning        | ink                      |
| `PHOTOS_PENDING`        | Adding photos   | ink                      |
| `AWAITING_VERIFICATION` | Checking        | ink                      |
| `VERIFIED`              | Verified        | verified-green `#059669` |
| `FLAGGED`               | Needs review    | flagged-amber `#D97706`  |
| `CANCELLED`             | Cancelled       | ink/muted                |
| `NO_SHOW`               | No show         | flagged-amber            |
| `ARCHIVED`              | Archived        | ink/muted                |

**(7) Filters / pagination.** None.

**(8) Money / dates.** No money on the Visit model. All timestamps en-IN IST.

**(9) Design notes.** The AI Verification panel is the hero: on a flagged visit, wrap it in a flagged-amber `#D97706` left-border card on cream; on a verified visit, verified-green left-border. The `verificationModel` is a small mono caption ("verified by <model>"). Terracotta accent only on back link / focus ring / any onward link. Photos shown as counts (`3 before · 4 after`) until a real media endpoint exists — never render placeholder photos. Inter for body, Noto Devanagari/Telugu for names, mono for ids/state-raw/model. WCAG AA on amber/green chips.

---

### A4. Flagged-visit list (reference queue)

**(1) Purpose + placement.** A reference list of visits currently `state=FLAGGED` for HR's anchored sites — so HR knows what the AI raised and what supervisors still owe a decision on. It is a **read** reference, not an HR action queue (HR cannot resolve/reject). At `/hr/visits/flagged`.

**(2) Layout.**

- **Desktop 1440:** Dense table. Columns: Worker · Site · Scheduled · State · AI concern (truncated `verificationText`) · When flagged. Row click → A3. A muted "Needs review" amber count badge in the section header. Cursor "Load more" at bottom.
- **375 mobile:** Cards: worker + site on line 1, scheduled date + amber "Needs review" chip on line 2, one-line AI concern on line 3.

**(3) Data fields / (4) columns.** Source = **NEW** `GET /v1/visits?state=FLAGGED` → response shape TBD (likely `{ items, nextCursor }` per spec, or `{ rows }` to match supervisor activity service). Visit rows filtered to anchored sites; ordered `createdAt DESC, id DESC`.

| Column       | Source (`Visit.field`)                        | Type / values                | Notes                                          |
| ------------ | --------------------------------------------- | ---------------------------- | ---------------------------------------------- |
| Worker       | `Visit.workerId` → name                       | UUID/name                    | Anchored-site workers only.                    |
| Site         | `Visit.siteId` → name                         | UUID/name                    | One of HR's `getHrSiteIds`.                    |
| Scheduled    | `Visit.scheduledFor`                          | DateTime                     | en-IN.                                         |
| State        | `Visit.state`                                 | enum (filtered to `FLAGGED`) | Always "Needs review" amber chip here.         |
| AI concern   | `Visit.verificationText` (truncated)          | string \| null               | One-line preview; full text in A3. Null → "—". |
| Flagged      | `Visit.flagged`                               | boolean (true for all rows)  | Implicit; not a separate column.               |
| When flagged | `Visit.updatedAt` (DERIVED — last transition) | DateTime                     | Approximate "raised" time; en-IN.              |

**(5) Actions.**

| Action            | Method + path                                                | Request                                  | State machine | DB writes + AuditEvent | Idempotency                   | Result UI                                               |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------- | ---------------------- | ----------------------------- | ------------------------------------------------------- |
| Load flagged list | `GET /v1/visits?state=FLAGGED` (**NEW**)                     | query `state=FLAGGED`, `cursor`, `limit` | none          | none                   | n/a                           | Renders queue                                           |
| Open visit        | `GET /v1/visits/:id` (**NEW**)                               | path                                     | none          | none                   | n/a                           | Routes to A3                                            |
| Next page         | `GET /v1/visits?state=FLAGGED&cursor=<nextCursor>` (**NEW**) | `cursor`                                 | none          | none                   | disable "Load more" in-flight | Appends rows (⚠️ pagination cursor not yet implemented) |

No resolve/reject buttons in the HR portal (SUPERVISOR-only; see A3). The list is observe-and-drill-in only.

**(6) States.**

- **Loading:** table skeleton, 6 shimmer rows.
- **Empty — no anchored sites:** "No sites assigned to you yet." (by design, not error; same as A1).
- **Empty — anchored, nothing flagged:** "Nothing needs review." Body "When the AI raises a concern on one of your sites, it shows up here." Lucide `shield-check`, verified-green accent on the icon only. This is a _good_ empty state — calm, positive.
- **Error + retry:** failure card + terracotta **Retry**. `QUERY_INVALID` 400 only if a bad query value is sent — keep `state=FLAGGED` fixed to avoid it.
- **Coming-soon:** `GET /v1/visits?state=FLAGGED` NEW → "The flagged-visit list is being built."
- **Machine-state chip:** every row shows the "Needs review" amber chip; A3 carries the full chip map.

**(7) Filters / pagination.** Fixed `state=FLAGGED`. Optional future filters (person/site) would mirror A1 params — mark NEW if added. Pagination: `cursor` + `limit`, response shape TBD (⚠️ NOT YET IMPLEMENTED; current supervisor activity service uses `{ rows }` without cursor), order `createdAt DESC, id DESC`.

**(8) Money / dates.** No money. Dates en-IN IST.

**(9) Design notes.** Amber `#D97706` is the signature color of this queue (every row is "needs review") — used in the chip and a thin left rule on each row; do **not** flood the row background. Verified-green appears only on the positive empty state. Terracotta accent reserved for nav-active / focus ring / "Load more". Dense ~44px rows, mono for the truncated AI-concern preview is acceptable for scanability but Inter is fine; ids in mono on hover. WCAG AA. Lucide icons, no emoji.

---

### A5. Cross-area honesty checklist (for the designer)

- Tag every endpoint exactly as shown: **NEW** for all four HR reads (`/hr/audit`, `/activity/:id`, `/visits/:id`, `/visits?state=FLAGGED`); **EXISTS** only for the two SUPERVISOR writes (`/visits/:id/resolve`, `/visits/:id/reject`), which are **not** rendered as HR controls.
- Never draw an edit, delete, archive, or undo control on any audit surface — immutability (`Company → AuditEvent` FK RESTRICT, INSERT-only) is the feature.
- Never draw a resolve/reject button in the HR portal — wrong role (`SUPERVISOR_ROLE_REQUIRED` 403 if attempted).
- Honor the by-design empty state ("no anchored sites ⇒ empty") as neutral, never as an error.
- Client never sends `companyId`; tenant is server-side (`withTenantContext`/RLS). Cross-tenant ids return **404**, never reveal existence.
- One terracotta accent only (`#9A3412`/hover `#C2410C`); green only positive/verified; amber only flagged/attention; cream `#FFFBEB` bg; ink `#0F172A`. Inter + Noto Devanagari/Telugu + mono data face. Lucide icons. Desktop-first, works at 375. WCAG AA.

**Files referenced (authoritative):** schema `Visit` + `AuditEvent` at `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/prisma/schema.prisma` (lines 296–343, 564–597); `ActivityRow` Zod schema `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/activity.ts` (lines 22–51); summary derivation `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/audit-summary.ts` (lines 26–79; missing VISIT_RESOLVED/VISIT_REJECTED); supervisor activity service `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/activity-service.ts` (KIND_FILTER_MAP lines 106–111; no visit-kind filters yet); flagged-visit writes `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/visits.ts` + service `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/lib/services/visit-flagged-review-service.ts` (VISIT_RESOLVED/VISIT_REJECTED emitted per lines 132, 201); Zod shapes `/Users/thotaakshay/eclean_workspace/axhy-v3/packages/shared-schema/src/zod/wave-4-compliance.ts` (ResolveFlaggedVisitInput, RejectFlaggedVisitInput).

**Authoritative corrections to the brief:**

1. **audit-summary.ts handlers missing** — The kinds `VISIT_RESOLVED` and `VISIT_REJECTED` are emitted by the backend (visit-flagged-review-service.ts lines 132, 201) and will appear in the audit trail, but audit-summary.ts has no case statements for them (lines 26–79). Until the switch statement is extended, these kinds fall back to humanizeKind(), rendering as "Visit resolved." and "Visit rejected." instead of the spec's intended "Visit cleared" / "Visit rejected" chips.
2. **actorName not in ActivityRow schema** — The spec claims both audit list and audit detail return actorName, but the canonical ActivityRow Zod schema (activity.ts lines 22–35) does NOT include an actorName field. If HR needs actor names, the schema must be extended or a separate hydration endpoint designed.
3. **Pagination cursor not yet implemented** — The spec shows all four endpoints returning nextCursor for pagination, but the supervisor activity service's response is `{ rows: [...] }` (activity.ts line 49) with no cursor. Cursor pagination must be added to the backend before the frontend can use it.
4. **Visit-kind filters do not exist yet** — The spec claims a `kind=visits` filter category, but KIND_FILTER_MAP in activity-service.ts (lines 106–111) only supports: all, absences, lates, leaves. A new kind filter category for visits (`VISIT_RESOLVED`, `VISIT_REJECTED`, `VISIT_ENDED`) must be added to the service.
