# Next Session

**Last updated:** 2026-06-06 (early AM) · **Branch:** `chore/handoff-late-2026-05-31` (pushed). · **Prod backend:** live at `https://backend-production-344e1.up.railway.app` (deployed via `railway up`; `/health` green). `main` is a few commits behind the running code — re-sync with `git push --no-verify --force origin chore/handoff-late-2026-05-31:main` (founder runs it; the agent is hard-blocked from force-pushing the default branch).

## Production-release status (founder push, 2026-06-05/06)

Ran a launch-readiness audit (20 agents, adversarially verified). Of the **4 real blockers + OTP**, here is the honest state:

| Blocker                                 | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C — dispatcher not running in prod**  | ✅ FIXED + LIVE + verified. `startServer()` now runs `startDispatcher()` in-process (server.ts; env off-switch `RUN_DISPATCHER_IN_PROCESS`). Proof: a 2-day-old `ai.verify` outbox row processed the instant it deployed.                                                                                                                                                                                                                                                                                                                                          |
| **D — no way to onboard a new company** | ✅ FIXED + LIVE + tested. `POST /super-admin/companies` creates Company + bootstraps OWNER in one tx (super-admin-companies.ts/.service). 4/4 real-DB tests. 20s tx timeout (PG 18 latency).                                                                                                                                                                                                                                                                                                                                                                       |
| **A — no installable app**              | ✅ Android pilot SOLVED. Built a real **release-signed, prod-pointing APK locally** (no EAS — respects the Intel-Mac "no EAS" rule): `expo prebuild` + `gradlew assembleRelease` (38 min) → re-signed with `release.keystore` (alias axhy-release, password in gitignored `apps/mobile/.keystore-password.txt`). APK: `apps/mobile/axhy-pilot-v0.1.0.apk` (48.8 MB, gitignored). Verified: cert `CN=Axhy` (not debug), bundle has prod URL ×1 / localhost ×0 / LAN ×0. eas.json added for the founder's optional cloud path. **iOS still needs an Apple account.** |
| **E — DB backups**                      | ✅ Supplement done. `apps/backend/scripts/backup-db.sh` (pg_dump ≥18 — Railway runs PG 18.3; needs `brew install postgresql@18` locally) produced a real **72 MB / 44-table** dump. **Founder still verifies Railway managed Postgres backups in the dashboard** (the primary; not CLI-toggleable).                                                                                                                                                                                                                                                                |
| **B — OTP / WhatsApp delivery**         | ⏸️ **Intentionally founder-deferred — DO NOT re-flag or change the OTP/auth flow.** See memory `project_otp_delivery_deferred.md`. Prod lacks `WHATSAPP_ACCESS_TOKEN` + Meta business-verification/template-approval (founder's external work). Only the bypass phone +919381378257 logs in. Works with zero code change once the founder sets the token.                                                                                                                                                                                                          |

## Pilot is launchable now (Android), modulo the founder's OTP/Meta setup.

## Remaining P1 polish — needs a v0.1.1 APK rebuild (real, documented, not skipped)

1. **Chat-history (locked-doc violation):** supervisor `chat.tsx` starts `messages=[]` and never loads history on mount; backend has NO GET endpoint exposing persisted `ChatMessage` (prior-messages.ts reads them only for AI context). Fix = add a GET chat-history endpoint (return the supervisor's thread's ChatMessages) + wire `chat.tsx` to load it on mount.
2. **Site-check-in honest-UI:** worker timer screen shows "SITE CHECK-IN CONFIRMED" though check-in is a pass-through with no real verification — make the label honest (it's the founder's stated "honest product" bar).
3. **Other audit P1s** (not blockers): admin-web has zero tests; schema delivery to prod is manual (no auto-migrate); migration-safety CI guard red on 3 migrations; single replica = brief deploy outages.

**To rebuild the APK after a mobile fix** (from apps/mobile, ANDROID_HOME=/usr/local/share/android-commandlinetools):
`mv .env.local .env.local.bak; cd android; EXPO_PUBLIC_API_BASE_URL=https://backend-production-344e1.up.railway.app ./gradlew assembleRelease --no-daemon; cd ..; mv .env.local.bak .env.local` → re-sign with `build-tools/35.0.0/apksigner sign --ks release.keystore --ks-key-alias axhy-release ...`.

## Onboarding a real customer (the new path)

SUPER_ADMIN → `POST /super-admin/companies {name, ownerPhone, ownerName}` → returns companyId + owner → owner logs in via OTP to ownerPhone (once OTP is wired) → owner adds sites/workers in-app.

## Method notes

- Prod DB; route+DB verification is the reliable instrument on this host. pg18 client installed via brew.
- Seed: `apps/backend/scripts/seed-qa-comprehensive.ts` (Suresh +919999999999 / Ravi +919900000002, OTP bypass 123456, all 13 visit states, 2 companies).
- Host kept awake via `caffeinate`.
