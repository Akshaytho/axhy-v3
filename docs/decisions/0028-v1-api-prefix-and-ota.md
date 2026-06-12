# ADR-0028 — /v1 API contract pin + OTA updates (the two pre-APK launch blockers)

**Date:** 2026-06-12 · **Status:** Accepted (founder pre-authorized autonomous session; design summary sent via Telegram) · **Slice:** `v1-api-prefix-and-ota-2026-06-12`

## Context

The 2026-06-10 deep review (§2) named two launch blockers that MUST land before any APK ships, because both are irreversible after distribution:

1. **No API versioning** — all routes registered bare paths (`/chat/messages`). One breaking backend change would strand every installed client with no migration path.
2. **No OTA update path** — without expo-updates, every post-launch mobile bug requires rebuilding and re-distributing the APK by hand.

## Decision

### 1. `/v1` alias via Fastify `rewriteUrl` (dual-accept compat window)

- `server.ts` strips the literal `/v1/` prefix **before routing** (`rewriteUrl` server option — the only pre-routing rewrite point; `onRequest` hooks run after the router matches). `/v1/X` and `/X` hit the **identical** handler: same auth, tenant filter, rate limits, idempotency space.
- **Bare paths stay accepted** during the compat window, so the already-installed QA dev-client and the deployed admin-web keep working through the founder's deploy window. Dropping bare acceptance is a deliberate post-pilot step (invert the rewrite to 404 bare API paths).
- Clients pin `/v1` at exactly one point each:
  - mobile: `apps/mobile/lib/api.ts` — `API_BASE = <env base> + '/v1'`
  - admin-web: `apps/admin-web/lib/env.ts` — appends `/v1` after Zod validation (and `lib/api.ts` now consumes the validated env instead of a raw `process.env` read with a fallback, fixing a fail-loud-rule violation).
- A future breaking change mounts real `/v2` handlers; `/v1` keeps serving installed clients.

**Why not a prefixed plugin wrapper:** ~38 route modules register directly on `app`; double-registering them under a prefix duplicates the route table and any module-level effects. The rewrite is one pure function, O(1) per request, trivially reversible.

**Proof:** `apps/backend/test/v1-prefix.test.ts` (TDD — 3 cases failed before the rewrite): `/v1/health` parity with `/health`; `/v1/auth/otp/request` hits the real Zod boundary (same 400 as bare, not a router 404); `/v1abcdef` does NOT alias; querystrings survive.

### 2. OTA via expo-updates, `runtimeVersion: appVersion`, EAS channels

- `expo-updates@~29.0.18` (SDK 54-matched via `npx expo install`).
- `runtimeVersion: { policy: 'appVersion' }` — an OTA bundle never applies to a different native runtime. **Rule: any native change (new library, new permission) must bump `version`** in `app.config.ts`; old installs then keep their embedded bundle until a real APK reaches them.
- `eas.json`: `channel: "production"` and `channel: "preview"` on the respective build profiles. The dev-client profile keeps loading from Metro (no channel).
- A failed/interrupted OTA download falls back to the embedded bundle — no crash-loop vector.

## The one remaining step (founder — EAS credentials)

This machine is **not logged into EAS**, so `updates.url` + the EAS `projectId` are deliberately NOT committed (no fake values). When back:

```bash
cd apps/mobile
npx eas-cli login          # founder credentials
npx eas-cli update:configure   # injects updates.url + projectId into app.config
```

Then commit the injected config. After that, the release flow is: `eas build --profile production` (APK with OTA enabled) and later `eas update --channel production` for JS-level fixes.

## Deploy ordering (added to the handoff runbook)

1. Deploy **backend** first (dual-accept goes live; nothing can break — bare still served).
2. Deploy **admin-web** (its server calls now use `/v1`; requires step 1).
3. Founder runs `eas update:configure` + commits.
4. Build the release APK **last** — it pins `/v1` + the production OTA channel.
5. Post-pilot (deliberate, separate): flip off bare-path acceptance once no bare clients remain.

## Consequences

- Shipped APKs have a stable, versioned contract AND a same-day fix path (OTA) — the two §2 blockers close.
- The session-audit learning `2026-05-20-all-api-versioning-required.md` had a dead `check_pattern` (expected literal `/v1` route registrations); updated to detect the real implementation (rewriteUrl marker + client pins) so the audit guards the invariant honestly.
- One extra string comparison per request; no measurable cost.
