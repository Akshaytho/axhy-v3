# C1 — BLOCKERS (must-fix before any ship)

One entry per finding. Severity claim is in the title.

---

## B-01 — `/profile` URL navigation renders SUPERVISOR profile for WORKER role

**Surface:** Worker app, URL `/profile`  
**Repro (confirmed live):**

1. Log in as worker (`+919381378257` + `123456`).
2. Navigate directly to `http://localhost:8081/profile` (browser address bar, refresh, deep link, or browser back/forward — any cold URL hit).
3. Screen renders `(supervisor)/profile.tsx` content ("Namaste, Akshay.", Resign flow, supervisor drawer).
4. Network: GET `/me`, GET `/supervisor/decisions`, GET `/chat/reload-context/state` fire from a worker session.

**Files (collision):**

- `apps/mobile/app/(worker)/profile.tsx`
- `apps/mobile/app/(supervisor)/profile.tsx`

Both files declare the same URL `/profile` under expo-router's group convention. With layout context (tab click via worker `_layout.tsx`'s `<Tabs.Screen name="profile">`), expo-router scopes to the worker file. With cold URL navigation (no parent layout context), it falls back to flat resolution and picks the supervisor file (which is also alphabetically later).

**Live evidence:**

- Tab "You" click → URL `/profile` → renders `(worker)/profile.tsx` correctly. Only `/worker/today` is called.
- Direct `Page.navigate('/profile')` → URL `/profile` → renders `(supervisor)/profile.tsx`. Calls `/me`, `/supervisor/decisions`, `/chat/reload-context/state`.

**Why this is a blocker:**

1. Worker is shown supervisor-only controls including the **Resign** flow (POST `/me/resign`). A worker tapping Resign could attempt actions reserved for supervisors.
2. Supervisor-shaped API calls fire from a worker session, surfacing role boundaries to the backend that aren't enforced (see B-02).
3. Web shipping of the worker app — even for QA/demo — exposes this on every refresh.
4. On native, deep links via push (OneSignal) or universal links can land on `/profile` cold, hitting this code path.

**Fix sketch:**

- Disambiguate URLs: put one under a sub-segment (e.g., `(supervisor)/profile.tsx` → `(supervisor)/me.tsx` so its URL becomes `/me` distinct from `/profile`).
- OR enforce role-scoped redirect at the layout level: `(supervisor)/_layout.tsx` redirects to `(auth)/phone` if the active JWT role is not SUPERVISOR.
- OR route via expo-router's `useSegments()` + `useRouter()` guard that re-routes mismatched roles.

**Severity rationale:** This is the worst defect found in the session. It cross-contaminates role boundaries on a user-facing surface.

---

## B-02 — `/supervisor/decisions` backend route has no role gate

**Surface:** Backend, `GET /supervisor/decisions`  
**File:** [apps/backend/src/routes/supervisor-decisions.ts:47](../../apps/backend/src/routes/supervisor-decisions.ts#L47)

**Evidence (full source excerpt):**

```ts
app.get('/supervisor/decisions', { preHandler: requireAuth }, async (req, reply) => {
  const auth = req.auth;
  if (!auth) {
    reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
    return;
  }
  // ...passes auth.userId and auth.companyId to buildDecisionsForSupervisor
```

`preHandler: requireAuth` only — NOT `requireRole('SUPERVISOR', ...)` or `requireSupervisorRole`.

**Live evidence:** Authenticated worker session (JWT `role=WORKER`, `availableRoles=["WORKER"]`) hits this endpoint and receives `200 OK`. The response body returns an empty list today **because the underlying query scopes results to `supervisorId == userId`** — a worker is not a supervisor of anything, so nothing comes back.

**Why this is a blocker even though no data leaks today:**

1. Defense in depth — multi-layer auth is policy across the codebase. This route is the visible exception.
2. Information disclosure — a worker can probe to confirm "I am / am not a supervisor of anyone." Useful for an attacker mapping role state.
3. Future-proofing — any future change to `buildDecisionsForSupervisor` (e.g., adding company-wide queries) would silently leak. The role gate is the structural guard.
4. The handler trusts `auth.userId` semantically as "the supervisor whose decisions to fetch." That semantic mismatch with worker-role callers is a bug already.

**Fix sketch:**

```ts
import { requireRole } from '../middleware/role-gates.js';

app.get('/supervisor/decisions',
  { preHandler: [requireAuth, requireRole('SUPERVISOR', 'COMPANY_ADMIN', 'SUPER_ADMIN')] },
  async (req, reply) => { ... }
);
```

Audit other `/supervisor/*` routes for the same pattern — based on quick code-grep, `supervisor-decisions.ts` is one of many.

---

## B-04 — R2 CORS preflight returns 403; photo uploads silently fail on web

**Surface:** Worker capture flow on web (Expo Web). Confirmed live in B8 walk.  
**Bucket:** `axhy-worker-photos.a24d2fa15ed41fab6a27bbeaf526db7c.r2.cloudflarestorage.com`  
**Origin:** `http://localhost:8081` (any web origin would fail the same way)

**Evidence:**

```
POST https://backend-production-344e1.up.railway.app/worker/captures/upload-urls
→ 200 (presigned URL returned)

OPTIONS https://axhy-worker-photos.a24d2fa15ed41fab6a27bbeaf526db7c.r2.cloudflarestorage.com/v3-captures/<userId>/<visitId>/...
→ 403 (CORS preflight rejected)

PUT to the presigned URL → never sent (browser blocked by failed preflight)
```

Review screen confirms downstream: "0 UPLOADED" with per-photo "Upload failed — tap retry". DB confirms: 0 `VisitPhoto` rows created despite 6 attempted uploads.

**Why this is a blocker:**

- Worker app on web (Expo Web build) cannot complete the capture flow. Every photo upload fails.
- The fact that there's no current production web deployment of the worker app masks this — but the moment one ships (even as QA), photo uploads break.
- The QA mandate explicitly called for the web walk; this gap is what makes the walk incomplete.

**Fix:**

Update the R2 bucket CORS config to allow `PUT`, `GET`, `HEAD` from the worker app origins (`http://localhost:8081` for dev, future prod web domain if any), with headers `Authorization`, `Content-Type`, `x-amz-*`. Cloudflare R2 dashboard → bucket → Settings → CORS Policy.

**Severity note:** On native (iOS/Android), CORS preflight doesn't apply, so this finding is web-only. But the R2 bucket configuration is a one-line dashboard change that's missing.

---

## B-03 — Sign-out is purely cosmetic: backend `/auth/sign-out` does NOT EXIST and refresh token remains valid

**Surface:** Worker drawer, Sign out  
**File:** WorkerDrawer.tsx (handleLogout) → `lib/identity-lifecycle.ts` (`onAppLogout`)

**Live evidence (CDP capture during UI sign-out):**

- Click drawer "Sign out".
- URL navigates to `/phone`.
- `localStorage`: `axhy_access_token`, `axhy_refresh_token`, `axhy_active_role` all removed.
- **Network: no POST `/auth/sign-out` is fired.** Only a residual GET `/worker/today` from the unmounting screen.

**Direct backend probe (corrects an earlier draft of this finding):**

```
POST https://backend-production-344e1.up.railway.app/auth/sign-out
Authorization: Bearer <valid worker JWT>
body: { "refreshToken": "..." }

→ 404 Not Found
  { "message": "Route POST:/auth/sign-out not found", "error": "Not Found", "statusCode": 404 }
```

The endpoint does not exist on the backend at all. Only `/auth/otp/request`, `/auth/otp/verify`, and `/auth/refresh` are registered in `apps/backend/src/routes/auth.ts` + `auth-refresh.ts`.

**Then to prove the refresh token survives:**

```
POST /auth/refresh
body: { "refreshToken": "<the same refresh token from the session that just signed out>" }

→ 200 OK
  { "accessToken": "<freshly minted token, sub matches the same worker, role=WORKER>", ... }
```

**Why this is a blocker:**

- Refresh tokens have a longer TTL (default `JWT_REFRESH_TTL_SECONDS` — confirmed env-var exists). A stolen refresh token survives the user's sign-out.
- On web (Expo Web), the refresh token sits in `localStorage` (XSS-stealable). Without server-side revocation on sign-out, a token theft is permanent until the natural refresh expiry.
- Compliance: most data-handling frameworks require sign-out to invalidate server sessions.

**Fix sketch:**

- In `onAppLogout`, before `clearTokens()`, call `apiFetch('/auth/sign-out', { method: 'POST' })` with the current refresh token in the body or header.
- Backend should revoke the refresh token family on receipt.
- Make this fire-and-forget; do not gate logout on success (user must always be able to sign out locally).
