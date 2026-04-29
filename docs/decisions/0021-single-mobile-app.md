# ADR-0021: Single mobile app with role-based UI (supersedes two-app proposal)

- **Status:** Accepted
- **Date:** 2026-04-29
- **Master plan §:** §G (mobile architecture)
- **Panel debate:** 2026-04-29-single-mobile-app
- **Supersedes:** earlier two-app assumption (worker-mobile + supervisor-mobile)

## Context

Earlier panel iteration assumed two separate mobile apps based on a bundle-size argument. Founder questioned this. Re-debate confirmed the original pick was wrong on weak grounds.

Indian SMB context: workers and supervisors have fluid roles. Promoted-to-supervisor workers, supervisors covering worker shifts, owners spot-checking sites — all common. Two apps create friction at every role transition.

## Decision

Single Expo binary `apps/mobile` with role-based UI:
- `app/(worker)/*` — worker-only screens
- `app/(supervisor)/*` — supervisor-only screens
- `app/(owner)/*` — read-only owner dashboard
- `app/_layout.tsx` reads JWT role + availableRoles, routes accordingly
- Mode switcher in header for hybrid roles
- ESLint rule: `(worker)/*` cannot import from `(supervisor)/*`
- Server-side JWT scope is the source of truth for role enforcement; UI gating is convenience only

Bundle target: under 12MB total.

## Consequences

### Positive
- One Play Store + App Store listing
- One EAS build pipeline
- Smooth role transitions (promotion, shift cover, spot-check)
- ~40% mobile-maintenance savings for solo founder
- Single QR-code onboarding from depot poster

### Negative
- Slightly larger worker bundle than worker-only app would be (acceptable: still <12MB)
- Role gating must be enforced at multiple layers (UI + API + state machine)

## Lineage

- **Derives from:** master plan §G, panel debate 2026-04-29
- **Supersedes:** earlier two-app implicit assumption
- **Affects:** apps/mobile, build plan phase 1+2 timeline
