# 02 — Walk log (real taps only, no shortcuts — needing one = bug)

Live phase run 2026-06-11 00:10–00:52 IST · emulator `eclean_test` (cold boot, `-gpu host`) · PROD backend/DB/Redis · screenshots at `/tmp/walk_*.png` (session) · DB proofs via psql on DATABASE_PUBLIC_URL.

## Step 1 — App open → entry routing — as Suresh (logged out)

- At: 2026-06-11 00:31 IST
- Becoming them: first open after install; I don't know this app yet.
- UI: routed straight to Sign in (walk_10). Clean screen, brand, one field, one button. No dead UI.
- Route: none (no token → no /me call observed).
- DB proof: n/a (read-only entry).
- Verdict: **PASS**

## Step 2 — Phone entry + Get OTP — as Suresh

- At: 2026-06-11 00:33 IST
- Becoming them: typing my own number one-handed; I fear typing it wrong.
- UI: +91 fixed prefix, big digits, button disabled until number filled → enabled red (walk_11). Spinner inside button while sending (honest loading). On the earlier dead-network attempt it showed "Could not send OTP. Check your connection and try again." (walk_05) — clear, recoverable, no crash.
- Route: POST /auth/otp/request → success (advanced).
- DB proof: OTP lives in Redis (prod) — proven by verify succeeding next step.
- Verdict: **PASS**

## Step 3 — OTP entry + Verify (login) — as Suresh

- At: 2026-06-11 00:34 IST
- Becoming them: waiting for the code is the scariest wait — without it I can't work today.
- UI: "Enter OTP / Sent to +91 ••••8257" (masked — good), 6 boxes, Verify disabled till filled, "Resend OTP in 55s" honest countdown (walk_12, walk_13).
- Route: POST /auth/otp/verify → tokens issued, app advanced.
- DB proof (prod): `AUTH_LOGIN audit rows last 10 min: 1` · `RefreshToken rows last 10 min: 1` · latest payload `WORKER via otp`. Screen and DB agree.
- Side-effects: AuditEvent AUTH_LOGIN written ✅.
- Verdict: **PASS**

## Step 4 — Permissions — as Suresh

- At: 2026-06-11 00:36 IST
- Becoming them: permission dialogs usually scare me — why does it want my location?
- UI: "Allow access — Camera is for before-and-after photos. Location confirms you're at the right site when you start work." Plain reasons BEFORE the OS dialogs (walk_14). After granting: honest "Granted ✓" states and a Continue button (walk_17). (Dev-build toasts briefly covered Continue — dev-only, not a product bug.)
- Route: none (OS-level).
- Verdict: **PASS**

## Step 5 — DPDP consent — as Suresh

- At: 2026-06-11 00:38 IST
- Becoming them: I never read legal text — but this one I can actually read.
- UI: "Your privacy" in plain words: what's stored, why ("prove the work was done and to pay you on time"), never sells data, photos kept 90 days after leaving, location only while job active, delete-account email, full-notice link, real "I don't agree" option (walk_18).
- Route: POST /worker/consent → 409 ALREADY_CONSENTED (this QA user consented 2026-05-31), mobile proceeded correctly.
- DB proof (prod): `ConsentLog rows last 5 min: 0` BUT `rows for this user: 13, earliest 2026-05-31` → dedup path correct, immutable legal record intact, no duplicate appended. (13 historical rows predate the RCA-G dedup fix — fix proven working now.)
- Verdict: **PASS** (dedup behavior exactly as designed)

## Step 6 — Worker Home (Today) — as Suresh

- At: 2026-06-11 00:39 IST
- Becoming them: the first thing I want to know: do I have work today, where?
- UI: "Thursday, 11 June / Good morning / 0 DONE / 0 PLANNED / TODAY'S PLAN · 0 SITES / No work today / Your supervisor will assign jobs when ready." (walk_19). Date is CORRECT IST date at 00:39 (inside the UTC-bug danger window). Tab bar: **Today / Capture / You — NO History tab** → Bug #1 live-confirmed.
- Route: GET /worker/today → empty payload.
- DB proof (prod): worker ACTIVE in company "QA Worker Prod 2026-06-03", `visits today (IST): 0` → empty state is TRUE.
- Verdict: **PASS** (home honest) + **Bug #1 confirmed live** (history unreachable)

## Steps 7–17 — Visit detail + capture flow — BLOCKED (no visit today)

- At: 2026-06-11 00:41 IST — prod has 0 visits today for the QA worker; direct DB seeding requires founder authorization (auto-mode classifier denied `seed-real-phone-worker.ts`; Telegram ping sent 00:41 IST, HTTP 200). Walk continues on visit-independent steps; capture phase resumes on "seed ok".

## Capture tab empty state — as Suresh

- At: 2026-06-11 00:42 IST
- UI: "Nothing to capture right now… Pull for new work or head back to your home screen." + Check again + Go to home (walk_20). Both buttons REAL: Check again refetches; Go to home lands on Today (walk_21b). (The June 2 empty-state fix verified live.)
- Verdict: **PASS**

## Step 19 — Profile (You tab) + drawer — as Suresh

- At: 2026-06-11 00:43 IST
- UI: avatar W / name "Worker" / phone fully masked "+91 ••••• •••••" / Verified badge / TODAY 0-0-0 (true) / "Synced — all queued captures up to date" (true, queue empty) / support card honestly says "Supervisor contact is not configured yet." (walk_22). Drawer: My profile, Request leave, Help & support, Sign out (walk_23). Drawer→My profile resolves correctly to the You tab (walk_24) — Step 1b suspect `as never` cast CLEARED.
- Minor notes → 03-bugs observations: own phone fully masked (worker can't confirm which account); generic name "Worker".
- Verdict: **PASS** (with minor notes)

## Step 20 — Leave request — as Suresh

- At: 2026-06-11 00:45 IST
- Becoming them: asking for a day off in an app instead of begging the supervisor face-to-face — this must not feel risky.
- UI: "Tell your supervisor when you'll be away. They approve or decline — you don't go on leave until it's approved." Stepper UI (no date typing!), live summary chip "Away Fri, 12 Jun" — CORRECT IST tomorrow at 00:45 (walk_25, walk_26). Reason box, 0/500 counter. Success card: "Leave request sent — You asked to be off Fri, 12 Jun (1 day). Your supervisor will review it. You'll see the result on your profile." (walk_28).
- Route: POST /leave-requests → 201.
- DB proof (prod): `state=REQUESTED from=2026-06-12 to=2026-06-12 reason=Family functiony` — matches the screen EXACTLY.
- BUT the success card's promise "You'll see the result on your profile" is FALSE — profile (walk_29) has NO leave section at all → **Bug #2 (TRUST)**.
- Verdict: **PASS on data truth · FAIL on promise** → bug #2

## Drawer — Help & support — as Suresh

- At: 2026-06-11 01:01 IST
- Becoming them: something went wrong and I don't want to call my supervisor — let me try "Help".
- UI: opens the browser to `https://axhy.app/help` → **redirects to the admin-web login page** (curl-proven: HTTP 200, final URL `/login`); rendered as a blank tab on-device (walk_32).
- Route: WorkerDrawer.tsx:121 `Linking.openURL('https://axhy.app/help')`; admin-web has no /help route.
- Verdict: **FAIL** → bug #3

## Step 21 — Sign out — as Suresh

- At: 2026-06-11 01:06 IST
- Becoming them: end of day, maybe sharing the phone with a brother — sign-out must really sign me out.
- UI: drawer → Sign out → lands on Sign in (walk_33). BUT a dev toast fired: "Uncaught (in promise) Error: Unable to activate keep awake" — unhandled promise rejection during sign-out (logcat: `Unable to activate keep awake`, expo-keep-awake racing unmount). Silent in prod builds but it's a real unhandled error → bug #4 (MINOR).
- Route: POST /auth/sign-out.
- DB proof (prod): latest RefreshToken `revokedReason=LOGOUT` ✅ — the token family is genuinely dead, not just the screen reset.
- Verdict: **PASS on core behavior** + bug #4 (minor)

## Negative test — wrong OTP code — as Suresh

- At: 2026-06-11 01:18 IST
- Becoming them: 6 AM, half-awake, I read the code wrong and type 999999.
- UI: app silently bounces to the PHONE screen, no error anywhere (walk_36). The correct inline error ("Wrong code. Check the SMS and try again.", otp.tsx:98-99) exists in code but never renders.
- Root traced live: `api.ts:283-285` blanket-401 → handleUnauthorized() navigates first; line 261's /auth exemption covers only the refresh attempt, not the fall-through.
- Verdict: **FAIL** → bug #5

## Sibling check — consent privacy link

- At: 2026-06-11 01:22 IST — `consent.tsx:35` → `https://axhy.app/privacy` → curl -L: HTTP 200, no redirect. Page EXISTS (content quality = findings-doc O6, separate). Help (/help) remains the only broken external link.

## Bad-day scenarios run (minimum set from the protocol + open loopholes)

| Scenario                                                                              | At (IST)           | Result                                                                                                                                          | Bug # |
| ------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| No signal during OTP request (emulator network dead)                                  | 2026-06-11 00:10   | Clear inline error "Could not send OTP. Check your connection and try again."; full recovery after network returned; no crash, no stuck spinner | —     |
| Double/triple-tap Send on leave (slow-network double-submit)                          | 2026-06-11 00:50   | Exactly 1 LeaveRequest row created (`leave rows last 3 min: 1`) — button disables in flight                                                     | —     |
| App killed mid-session (battery death) → reopen                                       | 2026-06-11 00:52   | Relaunch lands directly on Home, still signed in (SecureStore tokens survive), data correct (walk_31)                                           | —     |
| Typo in reason field (fat fingers)                                                    | 2026-06-11 00:47   | "Family functiony" accepted; no validation block on free text — acceptable                                                                      | —     |
| No signal mid-capture / app killed mid-capture / two-visits-same-time / QR wrong site | pending visit seed | —                                                                                                                                               | —     |

## Environment incidents during walk (not product bugs — recorded for MAP §8)

1. Emulator snapshot-resume came up with DEAD network (ping "Network is unreachable"); wifi toggle insufficient; airplane-mode toggle fixed it briefly; cold boot (`-no-snapshot-load`) fixed it permanently. ~25 min lost.
2. Host disk hit 100% mid-walk (ENOSPC in session tmp) — the June 3 pattern. Freed 4.3GB by purging `~/.gradle/caches` (3.1G) + `apps/mobile/android/app/build` (629M) per the documented reclaimables. No build needed (app already installed) so cache loss is harmless.
3. Stale AVD `.lock` files blocked relaunch ("Running multiple emulators with the same AVD") — `rm ~/.android/avd/eclean_test.avd/*.lock` after killing processes.
