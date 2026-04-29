# apps/admin-web — BOUNDARY

## Owns
- Marketing site (`/`, `/pricing`, `/about`, `/contact`)
- Owner dashboard (`/owner/*`)
- HR portal (`/hr/*`) — payroll, attendance, AI conversational onboarding
- Super admin portal (`/super/*`) — Axhy team's tools
- Public assets (favicons, og images, fonts)
- Authentication UI (phone+OTP, multi-company picker)

## Does NOT own
- Backend logic
- Mobile UI
- Database queries (uses `@axhy/api-client`)

## Internal dependencies
- `@axhy/api-client`
- `@axhy/copy`
- `@axhy/errors`
- `@axhy/shared-schema`
- `@axhy/ui-tokens`
- `@axhy/ui-web`

## Routing layout
- Marketing: `/`, `/pricing`, `/about`, `/contact`, `/login`
- Authenticated: `/owner/*`, `/hr/*`, `/super/*`
- AI onboarding: `/setup/{tenant-slug}` (per master plan §G)

## Lineage anchor
Master plan §G (admin web). ADR-0005 — Next.js for marketing + admin in one app.
