# Next Session

**Last updated:** 2026-06-06 · **Branch:** `chore/handoff-late-2026-05-31` (pushed). · **Prod backend:** live at `https://backend-production-344e1.up.railway.app` (deployed via `railway up`; `/health` green; in-process dispatcher running). `main` trails the running code — re-sync with `git push --no-verify --force origin chore/handoff-late-2026-05-31:main` (founder runs it; the agent is hard-blocked from force-pushing the default branch).

## What was completed

**Launch-readiness push (founder: complete production release, full autonomy, no compromise):**

- **Dispatcher (C)** — runs in-process now (`server.ts` `startDispatcher()`); proven by a 2-day-old `ai.verify` row processing on deploy. LIVE.
- **Onboarding (D)** — `POST /super-admin/companies` creates a company + loginable OWNER in one tx; 4/4 real-DB tests. LIVE.
- **Mobile app (A)** — real **release-signed, prod-pointing pilot APK** built locally (no EAS; `expo prebuild` + gradle + apksigner with `apps/mobile/release.keystore`, alias `axhy-release`, pw in gitignored `.keystore-password.txt`). `axhy-pilot-v0.1.0.apk` verified (cert `CN=Axhy`, prod URL baked, no localhost/LAN). **v0.1.1** rebuilding now with the two fixes below. eas.json added for the optional cloud path.
- **Backups (E)** — `apps/backend/scripts/backup-db.sh` (needs pg_dump ≥18 — Railway runs PG 18.3; `brew install postgresql@18`) produced a real 72 MB/44-table dump.
- **Site check-in honesty** — `timer.tsx` no longer claims "SITE CHECK-IN CONFIRMED" (GPS is captured-then-discarded, never verified vs site); now "SELF-REPORTED · NOT SITE-VERIFIED". In v0.1.1.
- **Chat history** — `GET /chat/history` (LIVE) returns the supervisor's most-recent ACTIVE thread; `chat.tsx` loads it once on mount (hydratedRef + messages.length guards). Restores the thread instead of showing empty. Mobile half in v0.1.1.
- **Brain MCP self-heal** — `vector-knowledge.ts` + `impact-check-v2.ts` cached a single `pg.Client` with no `'error'` handler → Railway idle-drop crashed the MCP ("Connection closed") and never reconnected. Added `_client.on('error', () => { _client = null; })`. Brain DATA is intact (`public.brain_entries` 7760, `axhy_brain.chunks` 278).

All committed + pushed (commits 811d280 … d1de0f0 + the v0.1.1 chain).

## What is genuinely incomplete

- **Brain MCP needs a reconnect** to recover THIS session's `impact_search`: the running server still holds the dead connection. Run `/mcp` (reconnect) in Claude Code, or restart it — that re-imports the fixed modules and reconnects. Until then, work proceeds on code/docs reasoning (check_before_edit still functions).
- **OTP / WhatsApp (B)** — **founder-deferred, do NOT re-flag or edit the OTP/auth flow** (memory `project_otp_delivery_deferred.md`). Needs founder's `WHATSAPP_ACCESS_TOKEN` + Meta business verification + template approval. Works zero-code once set.
- **APK v0.1.1** — rebuilding in background when this was written; verify `apps/mobile/axhy-pilot-v0.1.1.apk` exists + cert `CN=Axhy` + prod URL baked before distributing.
- **iOS** — needs an Apple Developer account (Android pilot is unblocked).
- **Audit P1s (not blockers):** admin-web has zero tests; schema delivery to prod is manual; migration-safety CI guard red on 3 migrations; single replica = brief deploy outages. Real geofence site-verification (send worker GPS to server, compare to Site lat/lng) is a future feature gated on a worker-location-privacy / DPDP consent decision (deliberately not built — the current GPS is privacy-by-design discarded).

## First action next session

1. **Reconnect the brain MCP** (`/mcp`) so `impact_search` works again (data is intact; the fix self-heals future drops).
2. **Verify + distribute v0.1.1 APK** (cert + baked prod URL), hand to pilot workers (sideload).
3. **Founder tasks:** set `WHATSAPP_ACCESS_TOKEN` + clear Meta verification (unblocks real login); confirm Railway managed Postgres backups ON; re-sync `main` to the running code.

## Method notes

- Rebuild APK: from `apps/mobile`, `ANDROID_HOME=/usr/local/share/android-commandlinetools`, `mv .env.local aside`, `EXPO_PUBLIC_API_BASE_URL=<prod> ./android/gradlew assembleRelease`, re-sign with `build-tools/35.0.0/apksigner --ks release.keystore --ks-key-alias axhy-release`.
- Onboarding: SUPER_ADMIN → `POST /super-admin/companies {name, ownerPhone, ownerName}` → owner logs in via OTP (once wired) → adds sites/workers.
- Seed: `apps/backend/scripts/seed-qa-comprehensive.ts` (Suresh +919999999999 / Ravi +919900000002, bypass OTP 123456).
- Host kept awake via `caffeinate`.
