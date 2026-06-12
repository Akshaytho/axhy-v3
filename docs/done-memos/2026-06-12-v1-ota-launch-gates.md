# Done memo — /v1 API versioning + OTA updates (the two pre-APK launch blockers)

**Date:** 2026-06-12 (afternoon autonomous session) · **ADR:** `docs/decisions/0028-v1-api-prefix-and-ota.md` · **Slice:** `v1-api-prefix-and-ota-2026-06-12`

## What changed

### /v1 API contract pin (deep-review §2 LB2)

- `apps/backend/src/server.ts` — Fastify `rewriteUrl` option strips the literal `/v1/` prefix **before routing**: `/v1/X` and `/X` hit the identical handler (same auth, tenant filter, rate limits, idempotency space). Bare paths stay accepted during the compat window so the installed QA dev-client and the deployed admin-web never break; dropping bare acceptance is a deliberate post-pilot step.
- `apps/mobile/lib/api.ts` — `API_BASE = <env base> + '/v1'` (the single fetch point; refresh path inherits).
- `apps/admin-web/lib/env.ts` — appends `/v1` once after Zod validation; `lib/api.ts` now consumes the validated env (its prior raw `process.env` read with a localhost fallback violated env.ts's own fail-loud rule).
- `docs/learnings/2026-05-20-all-api-versioning-required.md` — dead `check_pattern` (expected literal `/v1/` route registrations, matched 0 files) replaced with real detection (`rewriteUrl` in server.ts), closing the session-audit integrity-dead-pattern violation.

### OTA updates (deep-review §2 LB1/M1)

- `expo-updates@~29.0.18` (SDK-54-matched via `npx expo install`).
- `app.config.ts` — `runtimeVersion: { policy: 'appVersion' }`; rule documented in-file: any native change must bump `version`.
- `eas.json` — `channel: "production"` / `channel: "preview"` on the build profiles; dev-client profile untouched (Metro).
- **Founder step (EAS logged out on this Mac — no fake projectId committed):** `cd apps/mobile && npx eas-cli login && npx eas-cli update:configure`, commit the injected config.

### Bonus in-slice

- admin-web typecheck **38 → 0** (`@types/react`/`@types/react-dom` ^18 → ^19 to match react 19). All three apps `tsc --noEmit` clean; `next build` passes.

## Verification

- `test/v1-prefix.test.ts` **4/4** (TDD — 3 cases failed before the rewrite): `/v1/health` parity; `/v1/auth/otp/request` hits the real Zod boundary (same 400 as bare, not a router 404); `/v1abcdef` does NOT alias; querystrings survive.
- **Admin-web /v1 chain, real flow:** `/v1` OTP login (bypass on local backend, prod DB) → `POST /api/auth/session` 200 `{redirect:'/owner'}` → `GET /hr` with the WORKER cookie → `/forbidden` (closed-by-default role gate intact over /v1).
- `tsc --noEmit` EXIT 0 ×3 apps; `next build` passes; `npx expo config` parses runtimeVersion.
- Secrets (E13): nothing secret added — channels + version policy are public metadata; EAS credentials remain founder-held; this machine stays logged out.

## Honest gaps

1. **Emulator in-app /v1 smoke blocked by a QA-env quirk, not a product bug.** Differential proof: the emulator **browser** reaches `http://10.0.2.2:4000/health` (backend log counts the hit) while the **app's** fetch never arrives → the installed Jun-6 dev-client blocks cleartext http at app level. Prod uses https and is unaffected. Fix for the next QA session: build the next dev-client with `expo-build-properties` `android.usesCleartextTraffic: true`, or smoke `/v1` against prod https right after the founder's deploy (1 minute).
2. **`eas update:configure` pending founder EAS login** (Telegram-pinged with the exact command).
3. **Full local vitest vs prod DB: 105 pre-existing failures (43 files), unrelated to this slice** — baseline-proven by git-stash A/B (worker-captures fails identically without today's diff). CI's fresh-Postgres container runs the real full-suite gate. A dedicated laptop-suite triage session is recommended but not launch-gating.

## Deploy ordering (also in handoff + ADR)

1. Deploy **backend** (dual-accept goes live; nothing can break).
2. Deploy **admin-web** (its calls now use /v1; requires step 1).
3. `eas update:configure` + commit.
4. Build the release APK **last** (pins /v1 + production OTA channel).
5. Post-pilot: deliberately flip off bare-path acceptance.
