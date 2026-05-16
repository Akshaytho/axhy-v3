# F-006a — Manual smoke plan

> 4 scenarios, requires real iOS or Android device + an OneSignal sandbox project provisioned with `EXPO_PUBLIC_ONESIGNAL_APP_ID` set in the EAS Build dev profile. Unit tests cover the contract — these scenarios are reality-check before merge.

> Pre-requisite: owner provisions a OneSignal app (free tier, sandbox-only). Note the App ID. Set `EXPO_PUBLIC_ONESIGNAL_APP_ID=<that-id>` in EAS Build dev profile env. Without it the SDK calls no-op cleanly + auth still succeeds, but none of the smoke scenarios below can be observed in the OneSignal dashboard.

## Scenario 1 — First install + identified login

1. Fresh install of dev build on iOS sim (or device) — confirm previous install is removed.
2. Open the app. Phone-OTP screen renders.
3. Enter a phone number wired to a supervisor-scoped Axhy account (`memberships[0].role === 'SUPERVISOR'`).
4. Receive OTP via MSG91, enter the 6-digit code, tap Verify.
5. **Expected:** the pre-prompt explainer modal renders ("Stay in the loop / We'll let you know when your supervisor changes...") with two buttons.
6. Tap Continue. OS-native permission prompt appears.
7. Tap Allow on the OS prompt.
8. **Expected:** modal closes, app navigates to `/(supervisor)/profile`. Exactly one navigation call. Profile screen loads cleanly.
9. Open OneSignal dashboard → Audience → Subscriptions. Filter by `external_id`.
10. **Expected:** the logged-in user's `User.id` (UUID) appears as a subscription. Push token is registered.

**Pass criteria:** subscription appears with `external_id = <User.id>` in OneSignal dashboard within 30s of step 7.

## Scenario 2 — Sign-out detaches the subscription

1. Continuing from Scenario 1, with the user still logged in.
2. Tap "Sign out" in the supervisor profile screen.
3. **Expected:** `OneSignal.logout()` runs (max 3s, falls open), then `clearTokens()`, then `router.replace('/(auth)/phone')`. App lands on phone-entry screen.
4. Wait ~30s for OneSignal dashboard to update.
5. Open OneSignal dashboard → Audience → Subscriptions.
6. **Expected:** the device's subscription is no longer tagged with the User.id `external_id` (either anonymous OR the `external_id` field is empty). The push token itself may still exist for the device — what matters is that the identity link is broken.

**Pass criteria:** sign-out completes within 5s end-to-end, and within 30s the subscription's `external_id` is no longer set to the prior `User.id`.

## Scenario 3 — User A → User B on same device (phantom-subscription guard)

1. Continuing from Scenario 2, on the phone-entry screen.
2. Sign in as a **different** supervisor user (different phone, different `User.id`, different company).
3. Complete OTP + push-permission prompt as in Scenario 1.
4. **Expected:** app navigates to `/(supervisor)/profile`. Profile shows User B's name + company.
5. Open OneSignal dashboard → Audience → Subscriptions.
6. **Expected:** the device's subscription is now linked to User B's `User.id` (`external_id`). The old `external_id` (User A's) is no longer associated with this device's subscription — no phantom leak.

**Pass criteria:** only User B's `User.id` appears as the `external_id` for this device. User A's identity link is fully detached.

## Scenario 4 — Cold-start re-link

1. Continuing from Scenario 3, with User B logged in.
2. Force-quit the app (swipe-up to kill on iOS, swipe-away on Android).
3. Reopen the app.
4. **Expected:** `app/index.tsx` calls `getTokens()` → tokens present → `onColdStartReady(tokens)` runs → JWT decode → conditional `OneSignal.login(userId)` → `<Redirect href="/(supervisor)/profile" />`. No re-prompt for OTP, no re-prompt for permission. Lands directly on supervisor profile.
5. Open OneSignal dashboard → Audience → Subscriptions.
6. **Expected:** User B's `external_id` is still linked (`OneSignal.login(userId)` is idempotent — second call on the same identity is a no-op in the SDK). Push token unchanged.

**Pass criteria:** cold-start lands on supervisor profile within 2s, `external_id` remains linked, no duplicate subscription created.

## Negative paths (sanity)

- **Web build (no OneSignal SDK):** `pnpm --filter @axhy/mobile dev` on `--web`, open in a browser, run an OTP login. Expect: auth succeeds, console emits `[identity-lifecycle] OneSignal disabled (web or no app id); auth proceeds without push identity link.`, supervisor profile loads. No SDK exceptions, no broken UI.
- **No EXPO_PUBLIC_ONESIGNAL_APP_ID:** dev build with the env var deliberately unset. Same observation as web — auth flow succeeds end-to-end with the no-op warning log.
- **Non-SUPERVISOR `memberships[0]`:** wire up a test account whose token returns `memberships[0].role === 'WORKER'`. OTP verify call resolves, but `onIdentifiedLogin` throws `NonSupervisorRoleNotSupportedError`. OTP screen surfaces the error message inline (the "Sign-in is not yet supported for your role configuration..." text). No tokens persisted, no OneSignal call, no navigation.

## What manual smoke does NOT cover (out-of-scope for F-006a)

- F-011 push delivery from backend → device (no adapter exists yet).
- F-006b in-app panel / banner / unread-count UI (not built).
- Mixed-role supervisor selection (separate auth-switch slice not yet scoped).
- Full Maestro/Detox E2E (separate slice once mobile surface stabilizes).

## Sign-off

Once the 4 scenarios above are observed green on a real device + the 3 negative paths confirmed sane, F-006a is ready for `CODE: APPROVED` from friend → merge to main. Until then it stays `CODE_AWAITING_APPROVAL`.
