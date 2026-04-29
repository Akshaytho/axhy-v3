# apps/mobile — BOUNDARY

## Owns
- Single Expo binary (worker + supervisor + owner roles in one app)
- Role-based routing via `app/_layout.tsx`
- Worker screens: today, visits, photos, voice clock-out, history, payslip, profile
- Supervisor screens: chat, today's plan, summary, updates, profile
- Owner screens: read-only mobile dashboard
- Offline queue (expo-sqlite + outbox pattern)
- Push notifications (Expo Push)
- Voice recording (expo-av → expo-audio when stable)
- Photo capture + compression (expo-camera + expo-image-manipulator)
- i18n (en/hi/te) via i18next

## Does NOT own
- Direct AI calls — always via backend
- Backend logic
- Web UI

## Internal dependencies
- `@axhy/api-client`
- `@axhy/business-rules` — same rules apply offline
- `@axhy/copy`
- `@axhy/errors`
- `@axhy/shared-schema`
- `@axhy/state-machines` — for offline state-aware behavior
- `@axhy/ui-native`
- `@axhy/ui-tokens`

## Role boundary (enforced)
- `app/(worker)/*` — only worker screens
- `app/(supervisor)/*` — only supervisor screens
- `app/(owner)/*` — read-only owner dashboard
- ESLint custom rule: `app/(worker)/*` cannot import from `app/(supervisor)/*` or vice versa.
- Server-side JWT carries role + availableRoles; mode switcher allowed for hybrid roles.

## Bundle target
- Under 12MB total
- Worker-only flow: under 8MB if code-splitting works as planned

## Lineage anchor
Master plan §G (mobile architecture). ADR-0021 — Single mobile app with role-based UI (supersedes earlier two-app proposal).
