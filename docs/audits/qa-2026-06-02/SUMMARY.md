# QA audit — 2026-06-02 — one-pager

Read this first. Full detail in [INDEX.md](./INDEX.md) and per-finding docs.

## Scope reached

- **Worker mobile (Expo Web at `localhost:8081`, pointed at prod backend `backend-production-344e1.up.railway.app`)** — driven via Chrome DevTools Protocol on port 9222.
- **Onboarding end-to-end:** `/phone` → `/otp` → `/permissions` → `/consent` → `/` (home). All against prod. ✓
- **All worker tabs walked:** Today (home), Capture (capture-launcher), History, You (profile), Drawer. Screenshots saved to `/tmp/qa-2026-06-02/*.png`.
- **Sign-out walked.**
- **Backend code-audited** on the routes the worker app actually called: `/auth/*`, `/worker/today`, `/worker/consent`, `/me`, `/supervisor/decisions`, `/chat/reload-context/state`.

## Scope not reached

| Out of scope this session                           | Reason                                             | See          |
| --------------------------------------------------- | -------------------------------------------------- | ------------ |
| Capture flow (qr-scan → submit)                     | Test worker has `visits: []`                       | NV-01        |
| Cross-persona (supervisor/admin views)              | Founder phone has WORKER role only; no admin creds | NV-02, NV-03 |
| DB row diffs per mutation                           | Permission system denied `railway run psql`        | NV-04        |
| Token refresh / 401 recovery                        | Session shorter than 15-min access TTL             | NV-06        |
| Negative paths (wrong OTP, bad phone, network down) | Time + permission scope                            | NV-07–09     |
| Full role-gate enumeration                          | Permission system denied broad endpoint probing    | NV-05        |

See [C4-not-verified.md](./C4-not-verified.md) and [C5-needs-user-action.md](./C5-needs-user-action.md) for unblock paths.

## Headline findings (severity-bucketed)

### BLOCKER (4) — see [C1-blockers.md](./C1-blockers.md)

- **B-01** — `/profile` URL navigation renders the **SUPERVISOR profile** for a WORKER role. Two profile files share the same URL (`(worker)/profile.tsx` and `(supervisor)/profile.tsx`); cold URL nav picks the wrong one. Live evidence captured.
- **B-02** — Backend `/supervisor/decisions` has `requireAuth` only — **no role gate**. Worker token returns `200`. Data leak is currently masked by service-layer filter (`supervisorId == userId` → empty for workers) but the structural guard is missing.
- **B-03** — Sign-out clears local tokens but **backend `/auth/sign-out` returns 404** (endpoint doesn't exist). Refresh token confirmed valid post-signout (mints a new access token). Stolen refresh → permanent access until natural TTL.
- **B-04** — **R2 CORS preflight returns 403** for web origins on `axhy-worker-photos` bucket. Photo uploads silently fail in any web build of the worker app. Confirmed live during the capture-flow walk: 0 photos uploaded across 6 attempts, 0 `VisitPhoto` rows created in DB.

### HIGH (7) — see [C2-high.md](./C2-high.md)

- **H-01** — Capture tab with empty `visits[]` leaves "Opening your capture flow…" stuck in DOM after silent redirect to `/`.
- **H-02** — History tab admits in copy: "Multi-day visit history is not connected yet." Backend `/worker/history` route confirmed missing.
- **H-04** — `/chat/reload-context/state` reachable by worker role (no gate). May be intentional cross-role; needs product call.
- **H-05** — Refresh token in `localStorage` on web (Expo Web QA mode). BLOCKER if web ever ships.
- **H-06** — Founder phone has WORKER role only → admin personas untestable via bypass path.
- **H-07** — Backend may not enforce client-side `resendInSeconds:60` rate limit on `/auth/otp/request`. Needs clean re-test.

### MEDIUM + LOW + OBSERVATIONS — see [C3-medium-low.md](./C3-medium-low.md)

- Display name "Akshay (real-phone)" — dev annotation leaks
- Phone in `/otp` URL query string (privacy)
- Missing `aria-label` / `testID` on auth inputs (a11y + e2e)
- Stale `/phone` input persists in DOM after `/otp` (memory waste)
- RN-Web deprecation warnings (`shadow*`, `pointerEvents`) — tech debt
- `useNativeDriver` warning — expected on web
- `autoComplete="on"` should be `"tel"` and `"one-time-code"` on the two auth inputs

## Positive (worth keeping)

- Consent page copy is plain-English, honest, discloses 90-day retention. ✓
- OTP screen masks phone as `+91 ••••8257`. ✓
- Worker profile correctly removed the fake score ring / vanity stats per prior plan. ✓
- API base URL injected from `EXPO_PUBLIC_API_BASE_URL` cleanly — verified Expo Web is hitting prod. ✓
- CORS allowlist correctly includes localhost ports. ✓
- OTP bypass is fail-closed: empty allowlist → no bypass, ever (`otp-bypass.ts:42-49`). ✓
- Sign-out properly clears local tokens AND navigates back to `/phone`. ✓ (server-revoke missing — see B-03)

## Next session priorities (recommended order)

1. **Fix B-01 first** (route collision) — blocks any web shipping AND deep links on native.
2. **Add role gate to `/supervisor/decisions`** (B-02). While here, audit `apps/backend/src/routes/supervisor-*.ts` and `admin-*.ts` for the same pattern.
3. **Wire backend revoke into sign-out** (B-03).
4. **Capture flow QA** — requires founder action (A-03 in C5).
5. **Admin persona QA** — requires founder action (A-02 in C5).
6. **DB diff verification** — requires founder action (A-01 in C5).

## Worktree state

- Branch: `chore/handoff-late-2026-05-31`
- HEAD at start: `19505c5`
- **No code changes were made this session.** Only audit docs were written under `axhy-v3/docs/audits/qa-2026-06-02/`.
- The prior worker UI rewrite is preserved as-is — findings here apply to that rewrite.
