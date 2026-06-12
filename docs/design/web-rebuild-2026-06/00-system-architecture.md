# Web Rebuild — System Architecture

**Date:** 2026-06-12 · **Status:** Proposed (founder review) · **Owner:** founder (Akshay)
**Founder directive (verbatim intent):** brand-new marketing website + HR / admin (owner) / super-admin portals. Do NOT reuse the existing admin-web UI or design. New thinking, designed in parallel.

This doc is the map. The per-property design briefs (starting with `01-marketing-website-design-brief.md`) are what a designer works from.

---

## 1. The four web properties

| #   | Property               | Domain                | Who uses it                                | Auth                        | Renders                               |
| --- | ---------------------- | --------------------- | ------------------------------------------ | --------------------------- | ------------------------------------- |
| 1   | **Marketing website**  | `axhy.app`            | Buyers: cleaning-company owners, ops heads | None (public)               | Static-first, SEO, fast on 3G Android |
| 2   | **HR portal**          | `app.axhy.app/hr`     | HR managers of a customer company          | OTP login, HR role          | Logged-in app                         |
| 3   | **Owner/Admin portal** | `app.axhy.app/owner`  | Company owner / COMPANY_ADMIN              | OTP login, OWNER role       | Logged-in app                         |
| 4   | **Super-admin portal** | `app.axhy.app/system` | Axhy (founder) only                        | OTP login, SUPER_ADMIN role | Logged-in app                         |

The supervisor and worker surfaces stay on **mobile** (locked R6 design). The web portals are for people who sit at a desk: HR, owners, and us.

---

## 2. Monorepo layout (new pieces in bold)

```
axhy-v3/
  apps/
    backend/            # UNCHANGED — Fastify, /v1 API, RLS, Railway
    mobile/             # UNCHANGED — worker + supervisor app (R6 locked)
    admin-web/          # FROZEN — keeps serving until portal reaches parity, then retired
    **website/**        # NEW — marketing site (property 1)
    **portal/**         # NEW — HR + Owner + Super-admin (properties 2-4, one app, three role areas)
  packages/
    shared-schema/      # UNCHANGED — Prisma + zod types (portals import types only)
    **web-brand/**      # NEW — the new design system: tokens, primitives, icons (Lucide), NO code from ui-web
    **api-client/**     # NEW — typed /v1 fetch client + session helpers shared by website (demo form, if any) and portal
```

Why one `portal` app, not three: same auth, same session, same design system, role decided server-side per request. Three deploys for three small portals is operational drag with zero isolation benefit — role gates + RLS already isolate. (Memory rule: prefer the simpler route.) Super-admin lives behind the same gate pattern but its routes additionally require `SUPER_ADMIN` and are rate-limited + audit-logged.

Why a separate `website` app: marketing must be static-first, zero auth code, tiny JS, aggressive SEO. Mixing it into the portal bundles auth machinery into public pages (the exact mistake the current admin-web made).

---

## 3. Stack (same family as the repo, no new languages)

- **Next.js (App Router) + TypeScript** for both new apps — matches repo conventions and team knowledge.
- **website:** static generation (SSG) for every page; no server data except an optional demo-lead endpoint; images via `next/image` AVIF/WebP; zero client JS on content pages except the nav menu and FAQ accordion.
- **portal:** server components for data fetching against `/v1`; httpOnly cookie session; client components only where interaction needs them (tables, forms, sheets).
- **web-brand:** plain CSS variables (design tokens) + Tailwind config consuming them + a small primitive set (Button, Card, Field, Table, Sheet, Toast, EmptyState). Tokens come from the design direction the founder picks in the marketing brief — ONE token sheet drives all four properties so the brand reads as one product.

---

## 4. Auth & tenancy (portals)

Flow (reuses the backend exactly as the mobile app does — nothing new server-side at first):

1. `POST /v1/auth/otp/request` (phone) → WhatsApp OTP
2. `POST /v1/auth/otp/verify` → backend sets the **httpOnly session cookie** (existing admin-session pattern; JWT_SECRET shared — the env lesson from 2026-06-12 is already encoded: portal's env validation lists JWT_SECRET as required and the Railway service must carry it)
3. Next.js middleware on `app.axhy.app`: no session → `/login`; session role decides which areas render (`/hr`, `/owner`, `/system`); the BACKEND re-checks role on every API call — the middleware is UX, not security
4. Tenant isolation: companyId comes from the session membership server-side; the portal never sends companyId from the client; postgres RLS (FORCE, 27 tables) is the last line

Session expiry → 401 from /v1 → portal redirects to `/login?next=…` with state preserved. Sign-out revokes the refresh token (existing `/auth/sign-out`).

---

## 5. Feature inventory per portal (extracted from the live /v1 route surface — this is real scope, not guesses)

### 5.1 HR portal (`/hr`) — the biggest surface

| Area           | Screens                                                                                                                                                                                 | Backing routes (existing today)                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Home           | HR dashboard: today's exceptions (flagged visits, pending leave, late-reversal queue), counts                                                                                           | supervisor-summary-style aggregate — **NEW thin endpoint needed: `GET /hr/overview`**                                 |
| Workers        | List (search/filter by site/status), Worker detail (profile, history, attendance, documents), Add worker, Lifecycle actions (suspend, resign+anonymise — HR-initiated per locked model) | admin-workers, workers, worker-lifecycle, worker-history                                                              |
| Sites          | List, Site detail (roster, shifts, QR codes for visit scanning), Add/edit site, Bindings (assign workers/supervisors)                                                                   | admin-sites, sites, assignments                                                                                       |
| Leave          | Queue (REQUESTED → approve/reject with reason), history per worker                                                                                                                      | leave-requests (+ leave-request state machine — UI must render machine states only)                                   |
| Swaps          | Swap-request queue, approve/reject                                                                                                                                                      | swap-requests (+ machine)                                                                                             |
| Complaints     | Complaint queue, detail, resolve/terminal states                                                                                                                                        | complaints (+ machine)                                                                                                |
| Late reversals | The supervisor soft-flag → HR review queue (LATE_REVERSAL_REQUEST)                                                                                                                      | activity (+ audit)                                                                                                    |
| Policies       | Company policy list, edit (next-day effect — daily-cutoff rule), policy history                                                                                                         | admin-policy                                                                                                          |
| Updates        | Author company-wide compliance updates; see who acknowledged (5-word acks)                                                                                                              | supervisor-updates (read side exists; **author/ack-report side NEW: `POST /hr/updates`, `GET /hr/updates/:id/acks`**) |
| Memberships    | Invite/manage HR + supervisor accounts                                                                                                                                                  | admin-memberships                                                                                                     |
| Audit          | Read-only audit trail per worker/site/day (immutable — INVARIANT 9)                                                                                                                     | activity, visits                                                                                                      |

### 5.2 Owner/Admin portal (`/owner`) — small, glanceable, decision-only

| Area    | Screens                                                                                                                                      | Backing routes                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Pulse   | One-screen company pulse: visits today, verified vs flagged, attendance, AI-verification health                                              | aggregate — **NEW: `GET /owner/pulse`** |
| Alerts  | Owner alert feed (policy changes, membership adds — GAP 7 emissions already write these)                                                     | notifications/decisions surface         |
| People  | Read view of memberships + workers (drill into HR portal actions)                                                                            | admin-memberships, admin-workers        |
| Company | Company profile, settings                                                                                                                    | admin-company                           |
| Billing | Plain statement: visits this month × ₹8, ₹2,000 floor, what we'll invoice (billing is manual — this is a STATEMENT page, not a payment page) | **NEW: `GET /owner/billing-statement`** |
| Audit   | Same immutable trail, company-wide scope                                                                                                     | activity, visits                        |

### 5.3 Super-admin portal (`/system`) — founder ops

| Area            | Screens                                                                                     | Backing routes                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Companies       | List all tenants, onboard new company (creates first OWNER) — the customer-onboarding entry | super-admin-companies                                                                                                  |
| Memberships     | Cross-tenant membership fixes                                                               | super-admin-memberships                                                                                                |
| Platform health | API health, AI verification success/fallback rate, queue depths, error rates                | **NEW: `GET /system/health-metrics`** (today this lives in Railway/Sentry — page can start as links + simple counters) |
| AI budget       | Per-tenant AI spend vs caps                                                                 | **NEW: `GET /system/ai-usage`**                                                                                        |

**NEW-endpoint summary (backend work the rebuild needs):** `GET /hr/overview`, `POST /hr/updates` + ack report, `GET /owner/pulse`, `GET /owner/billing-statement`, `GET /system/health-metrics`, `GET /system/ai-usage`. Everything else already exists behind /v1. Each new route follows the locked rules: requireAuth + role gate + tenant wrapper + zod + tests.

### 5.4 Marketing website — full spec in `01-marketing-website-design-brief.md`

No backend dependency at launch: the demo CTA is WhatsApp-first (deep link with a prefilled message). If/when we want lead capture in-product: **NEW: `POST /public/demo-leads`** (rate-limited per IP, no auth, zod-validated) — deliberately phase 2.

---

## 6. Deployment & ops (lessons already paid for, encoded)

- Two new Railway services: `website`, `portal`. Both use the repo's `railway.json` + `nixpacks.toml` (the install phase is already pinned dev-mode — the admin-web 6-day build failure cannot recur).
- **Env validation fails loud at build:** each app ships an `env.ts` (zod) listing every required var; the README of each app lists the Railway variables to set BEFORE first deploy (JWT_SECRET on portal; none on website).
- Healthchecks: `/health` on both; healthcheckPath set in config from day one.
- Deploy order rule: backend first when API changes land (same ADR-0028 discipline).
- admin-web retirement: portal pages reach parity area-by-area; when an area is live and walked, the old page 301s to the portal; admin-web is removed only after a full dual-lens walk of the portal.

## 7. Cross-cutting requirements (all four properties)

- **Language:** UI copy in plain English first; string files structured for hi/te from day one (the app already greets "Namaste" — the web carries the same warmth).
- **Performance:** marketing pages — LCP < 2.5s on a mid Android over 3G, JS < 150KB gz per page, CLS < 0.1. Portal — TTI < 4s on the same device class; tables virtualized at 50+ rows.
- **Accessibility:** WCAG AA. 16px minimum body, 4.5:1 contrast, visible focus rings, 44px touch targets, keyboard-complete.
- **Honesty rules (constitutional for all web copy):** no invented testimonials, no fake logos, no made-up numbers. Real product screenshots only. If we have no customers yet, the site says what the product does, not who loves it.
- **Analytics:** privacy-first page analytics only (no PII, no session recording). Decision point for founder: Plausible-style hosted vs none at launch.

## 8. Phasing (parallel tracks)

1. **Now:** founder picks the visual direction (3 options in the marketing brief) → designer produces the marketing site designs → we build `website` + `web-brand` tokens.
2. **Parallel:** per-portal design briefs (HR first — biggest surface; this doc's §5 tables are the scope) → designer works portal-by-portal while website ships.
3. **Then:** portal app skeleton (auth + shell + tokens) → HR area → Owner → System; new backend endpoints land with each area, gated and tested as always.

## 9. Decision log for founder (pick in any order)

| #   | Decision                     | Options                                     | Recommendation                       |
| --- | ---------------------------- | ------------------------------------------- | ------------------------------------ |
| D1  | Visual direction             | 3 options in marketing brief §4             | Option A (Warm Proof)                |
| D2  | Demo CTA                     | WhatsApp deep link / in-site form / both    | WhatsApp first, form phase 2         |
| D3  | Analytics                    | None / privacy-first hosted                 | Privacy-first hosted, marketing only |
| D4  | Portal domain                | app.axhy.app single / per-portal subdomains | Single `app.axhy.app`                |
| D5  | admin-web retirement trigger | per-area 301s as parity lands               | Yes (no flag-day)                    |
