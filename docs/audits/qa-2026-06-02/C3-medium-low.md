<!-- [ORCHESTRATOR_EXCEPTION] QA audit findings — medium/low tier -->

# C3 — MEDIUM + LOW (backlog)

---

## M-01 — User display name shows dev annotation: "Akshay (real-phone)"

**Surface:** Worker `/profile` Name field  
**Live evidence:**

```
Name
Akshay (real-phone)
```

This looks like seed/test data scaffolding bleeding into the rendered name.

**Fix sketch:** Update the seed/user record. If this is intentional internal marking, strip it before rendering OR put it behind a `__DEV__` gate.

---

## M-02 — Phone number in URL query string at `/otp`

**Surface:** Auth `/otp?phone=%2B919381378257`  
**Privacy concern:** URL query strings are logged in:

- Browser history (persistent, syncs to cloud accounts)
- Browser session DevTools
- Server access logs (CloudFlare, Railway proxy, etc.)
- Analytics scripts (`document.referrer` leaks to third parties on next navigation)

**Fix sketch:** Pass phone via React state (router params via `state`) instead of querystring. expo-router supports `router.push({ pathname: '/otp', params: {} })` with state-only params.

---

## M-03 — No accessibility labels / testIDs on auth inputs and buttons

**Surface:** `/phone`, `/otp`  
**Live evidence:**

```
INPUT: type=tel, placeholder="98765 43210", aria=null, role=null, testID=null
CLICKABLE: <div>Get OTP</div>, aria=null, role=null, testID=null
```

**Impact:**

- WCAG 2.1 fail for screen-reader users (worker accessibility was identified as a memory point: "lightweight indicators").
- e2e tests (Maestro, Detox, Playwright) need brittle text-based selectors instead of stable testIDs.

**Fix sketch:** Add `accessibilityLabel` + `testID` to the TextInput, Pressable, and parent View in [apps/mobile/app/(auth)/phone.tsx](<../../apps/mobile/app/(auth)/phone.tsx>) and `/otp` equivalent.

---

## M-04 — Stale `/phone` input persists in DOM after navigation to `/otp`

**Surface:** Auth flow on web  
**Live evidence:** Inputs query at `/otp` shows three inputs: the phone input from `/phone` (hidden, value persisted) plus 2 OTP inputs.

```
{idx: 0, type: 'tel', value: '9381378257', visible: False, x: 0, y: 0, w: 0, h: 0}
{idx: 1, type: 'text', placeholder: '------', visible: False}  // hidden composite paste input
{idx: 2, type: 'text', placeholder: '------', visible: True, w: 468}  // actual OTP entry
```

**Cause:** expo-router stack navigator keeps previous screens mounted (typical RN pattern). On native this is fine (each screen in its own container). On web, all screens share the document, causing memory waste + DOM bloat + potential focus-management bugs.

**Severity:** LOW on native (expected); MEDIUM on web if shipped.

**Fix sketch:** Configure stack navigator to unmount screens on transition for web only, OR migrate to a screen-mount strategy that doesn't leak DOM nodes.

---

## L-01 — Console: `shadow*` style props deprecated

**Surface:** Every screen, dev console (web)  
**Evidence:** `Warning: "shadow*" style props are deprecated. Use "boxShadow".`

**Cause:** RN-Web 0.74+ deprecated `shadowColor/shadowOffset/shadowOpacity/shadowRadius` in favor of `boxShadow`. The codebase still uses the legacy props.

**Severity:** LOW — works fine, just spammy dev console. Future RN-Web could remove the polyfill.

**Fix sketch:** Migration pass across all `StyleSheet.create` calls to `boxShadow`. Easy mechanical refactor.

---

## L-02 — Console: `pointerEvents` prop deprecated

**Surface:** Every screen  
**Evidence:** `Warning: props.pointerEvents is deprecated. Use style.pointerEvents.`

**Fix sketch:** Move `pointerEvents={...}` prop usages into `style={{ pointerEvents: ... }}`. Mechanical.

---

## L-03 — Console: `useNativeDriver` warning on web

**Surface:** Animations on web (expected)  
**Evidence:** `Warning: Animated: useNativeDriver is not supported because the native animated module is missing. Falling back to JS-based animation.`

**Severity:** LOW (expected web behavior). Filter from QA dev console.

**Fix sketch:** Either set `useNativeDriver: Platform.OS !== 'web'` in Animated configs, OR ignore. This warning is irrelevant on the native production path.

---

## L-04 — Phone input `autocomplete="on"` — should be `"tel"`

**Surface:** `/phone` input  
**Evidence:** `autocomplete: "on"`

**Fix sketch:** Set `autoComplete="tel"` (or `"tel-national"` since the input excludes the +91 prefix shown alongside).

---

## L-05 — OTP input `autocomplete="on"` — should be `"one-time-code"`

**Surface:** `/otp` input  
**Evidence:** `autocomplete: "on"`, `inputMode: numeric`

**Fix sketch:** Set `autoComplete="one-time-code"` to enable iOS/Android SMS-autofill chips. Workers will appreciate not having to switch apps to copy OTPs.

---

## L-06 — Drawer "Help & support" link target unverified

**Surface:** Worker drawer "Help & support"  
**File:** WorkerDrawer.tsx audit identified target as `https://axhy.app/help` (external).

**Not verified live:** I did not click the link or confirm the destination renders for workers. Worth a manual check.

---

## L-07 — Confirm bottom-tab icon glyphs render uniquely (cosmetic dup)

**Surface:** Worker bottom tabs  
**Evidence:** Visible-text-leaf inspection found each tab icon character appearing twice in textContent (e.g., `\n` for Today, `\n` for Capture).

Most likely caused by `<Feather>` icon rendered twice (focused + unfocused state stacking) — typical RN-Web tab nav. Verify visually no actual double icons.

---

## OBS-01 — JWT subject (User.id) ≠ payload workerId (Worker.id) — by design

**Evidence:**

- JWT `sub = aa3699e4-95a3-4880-8bff-0c69c49621cb` (User.id)
- `/worker/today` response `workerId = 497fbe55-28a1-48d3-9e30-c31a5156a21d` (Worker.id)

This matches the persona-graph audit memory note ("workerId User.id vs Worker.id, fixed in 1edbbfd"). No bug; recording for completeness. Downstream calls (`/worker/visits/{id}/submit`) must use the Worker.id form — not verified in this session because no visits exist on the test account.

---

## OBS-02 — Worker app emits a clean privacy notice with retention disclosure

**Surface:** `/consent`  
**Evidence (live body):**

> "Photos are kept until 90 days after you leave."
> "Location is only tracked while a job is active."
> "You can delete your account by emailing support@axhy.app."

Aligns with locked-doc retention policy. No fake claims. Honest copy.

---

## OBS-03 — Onboarding sequence is 4 screens

**Evidence:** `/phone` → `/otp` → `/permissions` → `/consent` → `/`

Tracked here as a fact, not a bug. Founder may want to verify "is 4 onboarding screens too heavy?" — but each gate has a clear purpose:

1. Identify user
2. Confirm identity
3. Get device permissions (camera + location)
4. Get policy consent

Resign / sign-out → returns to `/phone` (verified).
