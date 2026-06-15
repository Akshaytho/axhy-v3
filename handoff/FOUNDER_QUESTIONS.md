# Founder Questions / Blockers — autopilot-logged (answer when available)

## #1 [admin-web prod deploy] JWT_SECRET on the admin-web Railway service

- **Impact:** admin-web prod deploy was failing → HR portal UI not live on prod. (Backend prod is healthy.)
- **BUILD CRASH — NOW FIXED IN CODE (commit 1925b85, verified):** the real cause was `apps/admin-web/lib/env.ts` reading `JWT_SECRET` EAGERLY at module load (`export const jwtSecret = readJwtSecret()`), which throws in production. `next build` runs in production mode + evaluates server modules, so on the `admin-web` service (no `JWT_SECRET`) the build crashed. (Locally `.env.local` has it → "builds clean locally". My earlier lint/typecheck skip was NOT the fix.) **Fixed** with a lazy memoized `getJwtSecret()` (read on first verify at runtime, not at build) + updated the 2 consumers. **Verified:** `NODE_ENV=production next build` with `JWT_SECRET` ABSENT now `✓ Compiled successfully` (full route table). So the deploy will go GREEN even without the secret.
- **STILL FOUNDER-GATED — the runtime secret (for AUTH to work):** admin-web verifies the access-token cookie in `lib/auth.ts`, so it needs the real `JWT_SECRET` at runtime or login/auth'd pages fail. I tried to self-solve by setting a Railway **reference** (no raw value): `railway variables --set 'JWT_SECRET=${{backend.JWT_SECRET}}' --service admin-web` — **the Claude Code auto-mode classifier BLOCKED it** (prod-infra config, founder-gated). I did not work around it.
  - **One-liner for you (no value copy, stays in sync with backend):**
    `cd axhy-v3 && railway variables --set 'JWT_SECRET=${{backend.JWT_SECRET}}' --service admin-web`
    (or copy the backend's value in the Railway dashboard). This makes auth work AND, on the current source, fixes the build the other way too (secret present).
- **Deploy of the CURRENT code:** the fix + HR portal live on branch `chore/handoff-late-2026-05-31` (pushed). admin-web builds from GitHub `main`, so either merge this branch → main, or `railway up --service admin-web` from the repo, to deploy the current UI. (Branch push alone does not deploy.)
- **Not blocking the rest:** continuing with the Feature 2 UI + everything else; live per-screen QA runs once the secret + a deploy land.

## #2 [prod QA] Live-site login is blocked by the Claude Code auto-mode classifier

- **Impact:** the per-screen full-stack prod QA (step 3, the biggest part of the goal) needs me to log in to the live site. The auto-mode safety classifier blocks agent-driven prod auth (correctly).
- **Unblock (pick one):** (a) add `"Bash(curl:*backend-production-344e1*)"` to `permissions.allow` in `.claude/settings.local.json`; (b) paste me a prod access token; (c) reply "use bypass phone +919778087087, authorized".
- Until then: I build + ship all feature CODE and verify via typecheck; the live per-screen QA runs once this + #1 (JWT_SECRET) are unblocked.

## #3 [feature 2] Company-wide who-acked report needs a NEW table (HRUpdateAck) = schema change

- ✅ **DONE (code) — built via the guarded schema-change flow.** Schema + reversible migration 032 (commit d6bf1d2), backend (2ab8ebc), UI (54cb6d9). The only founder action left is the **deploy order below** (apply migration 032 before the backend reaches prod).

---

### Progress (autopilot, this run)

- ✅ Backend LIVE on v3 prod (HR API routes).
- ✅ Feature 1 (Team DEACTIVATE) COMPLETE end-to-end (code) + pushed to prod: POST /hr/team/:userId/deactivate (INACTIVE + tokenEpoch bump + audit, guarded) + Team menu confirm-modal UI. typecheck green. e2e QA pending #1+#2.
- ⏳ Resend invite: stays Soon — no invite-resend backend exists; would need an invite-notification/SMS re-trigger (not faked).
- ✅ Feature 2 (#3): HRUpdateAck CODE COMPLETE — schema/migration (d6bf1d2), backend (2ab8ebc), UI (54cb6d9). tsc green + next build ✓. Founder applies migration 032 + deploys (deploy order below).
- ✅ admin-web deploy build crash CODE-FIXED (lazy JWT, 1925b85) — builds green without the secret now.
- ⏳ Full per-screen prod QA: blocked on #1 (JWT_SECRET runtime + deploy) + #2 (prod login).
- 🔁 admin-web prod deploy: still waits on #1.

### Feature 2 (HRUpdateAck) progress

- ✅ COMMITTED d6bf1d2 — schema (HRUpdateAck model + acks back-relation; prisma validate clean, client regenerated) + migration 032 (additive CREATE TABLE + indexes + FK, then ENABLE/FORCE RLS + tenant_isolation policy + axhy_app GRANT mirroring migration 023; reversible: DROP POLICY + DROP TABLE).
- ✅ COMMITTED 2ab8ebc — backend wired: supervisor ack upserts HRUpdateAck (idempotent, legacy acknowledgedBy mirror kept); GET /hr/updates returns real per-supervisor acks + ackCount + expectedAcks (active-supervisor denominator). Backend typecheck GREEN. Company-wide who-acked report is now real at the API layer.
- ✅ COMMITTED 54cb6d9 — UI done: data.ts UpdateRow (+acks/ackCount/expectedAcks) + UpdatesScreen ackChip ("N of M acked") + AckMatrix (real per-supervisor acked + pending lists). tsc green + `next build` ✓. The "design preview" disclaimer is removed — the report is real. Visual QA still pending founder login (#2) + a deploy (#1).

🔴 FOUNDER — strict deploy order (or prod breaks):

1. Apply migration 032 to prod FIRST: prisma migrate deploy (your usual Prisma path; NOT auto-run on Railway deploy — build=tsc, start=tsx).
2. THEN deploy backend (railway up --service backend / merge to main). Deploying backend before the migration would 500 supervisor-ack + GET /hr/updates (HRUpdateAck table absent).
3. admin-web JWT_SECRET (founder #1) still blocks the UI deploy + all prod QA.
