# admin-web architecture

The standard for every web portal in this app (HR, Owner, Super-admin). Optimised
for: fast navigation, predictable conventions, cheap scaling, low long-term cost.
Keep it **simple** — reach for a new layer only when a real need appears.

## Layers (one responsibility each)

```
app/            Routing ONLY. Layouts gate auth + compose the shell; pages are
                thin and just render a feature component. No data logic, no markup
                beyond wiring.
components/
  ui/           Design-system primitives, cross-portal. Icon, Chip, Avatar, Card,
                Table, Sheet, Empty, Tag… Presentational, no data fetching.
  shell/        AppShell (sidebar + topbar), portal-agnostic — nav passed in.
features/
  <domain>/     One self-contained module per portal/domain (hr, owner…):
                nav.ts (sidebar config), data.ts (typed fetchers), and the
                screen components. Domain logic lives here, co-located.
lib/            Cross-cutting infra: api.ts (typed fetch client + ApiError),
                auth.ts (cookie session + role gates), env.ts, me.ts,
                format.ts (money/date/initials). No React, no domain logic.
styles/         portal.css — the design-system stylesheet (tokens + classes),
                imported once per portal layout.
```

## Data flow

- **Read**: server components fetch through `lib/api.ts` `fetchJson<T>()` (httpOnly
  cookie auth, `/v1` contract, `ApiError` on non-2xx). Wrap each backend resource
  in a typed function in `features/<domain>/data.ts` — pages call those, never raw URLs.
- **Write / interactivity**: small `'use client'` components (forms, sheets, menus).
  Mutations use the same typed client; disable the submit button during the request
  (HR writes have no idempotency key).
- **Types**: hand-typed DTOs next to their fetchers today; swap to the generated
  `@axhy/api-client` (ADR-0011) when it lands — only `data.ts` changes.

## Honesty contract (from the design spec)

Never show a field the API doesn't return or an action it can't do. For endpoints
that aren't live yet: reads render a full screen + sample + one `oversight-banner`;
writes are `disabled` + a `Soon` tag. These markers are real product behaviour.

## How to add a screen (HR example)

1. `app/hr/<x>/page.tsx` — thin server page: fetch via `features/hr/data.ts`, render the feature component.
2. `features/hr/<x>/<X>Screen.tsx` — the screen (presentational; receives typed data).
3. `features/hr/data.ts` — add the typed fetcher(s).
4. `features/hr/nav.ts` — add the sidebar entry.

## How to add a portal

1. `features/<portal>/nav.ts` — its `NavConfig`.
2. `app/<portal>/layout.tsx` — `requireRole(...)` + `getMe()` + `<AppShell nav={...} me={...}>`.
   The shared `AppShell` and `components/ui` are reused as-is.

## Auth

Closed-by-default. `app/api/auth/session` sets httpOnly `axhy_at`/`axhy_rt` cookies
after OTP verify; `lib/auth.ts` `requireRole()` gates each portal layout (redirects
to `/login` or `/forbidden`). `JWT_SECRET` must match the backend.
