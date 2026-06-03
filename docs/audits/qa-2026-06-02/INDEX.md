<!-- [ORCHESTRATOR_EXCEPTION] full-file QA audit scaffold — markdown only, guardrail-optional path -->

# QA audit — 2026-06-02

Strict prod QA pass on the worker mobile app + connected personas. **No code changes this session.** Findings only, split per surface, handed to next session.

## Mandate (founder, 2026-06-02 ~01:50 IST)

- Real prod server only. No local mocks, no synthetic data.
- All scenarios: positive, negative, edge, special.
- Worker mobile app screens must be exercised with dev tools (network, console, loggers). No skipping.
- Connected personas (supervisor, COMPANY_ADMIN, SUPER_ADMIN) must also work end-to-end against worker writes — no placeholders.
- Split into multiple docs in this folder. No mega-doc.
- DB updates must be verified, not assumed.

## Branch at session start

`chore/handoff-late-2026-05-31` / HEAD `19505c5` (worktree dirty across worker UI + handoff cleanup).

## How worker app is being driven

Worker mobile is React Native (Expo SDK 54) — no worker-web deployment in Railway. Confirmed `platforms: ['ios','android','web']` + `web: { bundler: 'metro' }` in `apps/mobile/app.config.ts`. Therefore:

- Worker app started in **Expo Web mode locally** (`expo start --web --port 8081`) — a running instance was already up at session start (PID 18357, not started by this session)
- Bundle reports `EXPO_PUBLIC_API_BASE_URL = https://backend-production-344e1.up.railway.app` at runtime — verified via CDP `Runtime.evaluate`
- CORS allowlist confirmed: `http://localhost:8081` is in `AXHY_CORS_ORIGINS`
- Chrome on `--remote-debugging-port=9222` drives the browser via DevTools Protocol (Python `websockets` 15.0.1)
- Every screen capture includes: network requests/responses, console messages, DOM state

Caveats of Expo Web vs native:

- `expo-camera` has a documented web placeholder (placehold.co mock) — verified in code audit
- `expo-secure-store` falls back to localStorage on web
- GPS / haptics / push are no-op on web

These caveats are flagged per finding when they matter.

## Auth flow used

- Worker OTP bypass: phone `+919381378257` (allowlisted in `AXHY_OTP_BYPASS_PHONES`) + magic code `123456`
- `apps/backend/src/lib/otp-bypass.ts` confirms fail-closed: empty allowlist → no bypass, ever
- Admin login mechanism: deferred to live walk (creds pending)

## Personas to walk

| Persona       | App                                                             | Status                      |
| ------------- | --------------------------------------------------------------- | --------------------------- |
| Worker        | Expo Web (worker mobile RN)                                     | bypass phone available      |
| Supervisor    | Expo Web (supervisor-preview is a web build)                    | needs role discovery via DB |
| COMPANY_ADMIN | admin-web (Next.js, `admin-web-production-d922.up.railway.app`) | needs credentials           |
| SUPER_ADMIN   | admin-web                                                       | needs credentials           |

## What's blocked & needs founder action

See [C5-needs-user-action.md](./C5-needs-user-action.md) for the consolidated ask list:

- **DB direct reads blocked** by permission system despite founder's verbal "take from Railway"
- **Admin credentials not in Railway env** (no seeded admin password)
- These gate Phase B3 (DB diffs) and the COMPANY_ADMIN / SUPER_ADMIN persona walks

## File map

Each file is one concern. Open the one you need.

### Phase A — code-level (creds not required)

- [A1-worker-home.md](./A1-worker-home.md) — Worker Home: `index.tsx`, `capture-launcher`, `worker-today-helpers`, `_layout`
- [A2-capture-flow.md](./A2-capture-flow.md) — `CameraView`, `PhasePhotoCapture`, `PhotoGridReview`, `qr-scan`, `review`, `submit`
- [A3-history-profile.md](./A3-history-profile.md) — Worker `history.tsx`, `profile.tsx`, `WorkerDrawer`
- [A4-shared-libs.md](./A4-shared-libs.md) — `api.ts`, `api-routes.ts`, `r2-upload-queue`, queries, helpers
- [A5-backend-worker-routes.md](./A5-backend-worker-routes.md) — Every backend route the worker hits, full handler source
- [A6-persona-graph.md](./A6-persona-graph.md) — Worker writes → supervisor/admin reads (contract map)
- [A7-admin-views-on-worker.md](./A7-admin-views-on-worker.md) — Admin/supervisor views that surface worker data

### Phase B — live prod (needs creds + permissions)

- [B1-network-trace.md](./B1-network-trace.md) — Per-screen CDP network capture
- [B2-console-errors.md](./B2-console-errors.md) — Per-screen CDP console capture
- [B3-db-diffs.md](./B3-db-diffs.md) — DB row state before/after each mutation (BLOCKED on DB read permission)
- [B4-railway-logs.md](./B4-railway-logs.md) — Backend log paths for each mutation
- [B5-multi-persona-walk.md](./B5-multi-persona-walk.md) — Worker write → supervisor sees → admin sees

### Phase C — synthesis

- [C1-blockers.md](./C1-blockers.md) — Must-fix
- [C2-high.md](./C2-high.md) — Should-fix
- [C3-medium-low.md](./C3-medium-low.md) — Backlog
- [C4-not-verified.md](./C4-not-verified.md) — What I could not verify + why
- [C5-needs-user-action.md](./C5-needs-user-action.md) — Open asks (permissions to grant, creds to paste)

## Severity legend

- **BLOCKER** — ship-stopping. Crash, data loss, security, multi-tenant leak, broken happy path.
- **HIGH** — wrong but not ship-stopping. Stale UI, missing state, fake data, route 404, UX dead-end.
- **MEDIUM** — degrades trust. Slow, ugly, confusing copy, accessibility gap.
- **LOW** — polish.
- **OBSERVATION** — fact, no severity yet.

## Finding format (every entry)

```
[SEVERITY] <title>
  Surface: <screen / route / view>
  File: <path:line>
  Evidence: <code excerpt | network response | DB row | log line>
  Expected: <correct behavior>
  Actual: <observed behavior>
  Repro: <steps>
  Fix sketch: <one sentence>
```

No padding. No generic React advice. Cite `file:line` every time.
