/**
 * F-006a — Mobile identity-lifecycle: ONE ordered sequence wrapping
 * `setTokens` / `clearTokens` with conditional OneSignal SDK calls.
 *
 * ALL login / logout / cold-start call-sites in the mobile app go through
 * this module — not directly through `auth-store.ts`. This preserves the
 * "ONE explicit identity contract" lock (friend's v1 lock; v2/v3/v4/v5/v6
 * iterations) so OneSignal identity-linking can never be silently bypassed.
 *
 * **Locked invariants (v6):**
 *   1. ONE ordered sequence per function — no overlapping rules, no
 *      two-paths-to-tokens. See Pick 2 in the plan file.
 *   2. JWT-scoped role rule — accept identified login ONLY when
 *      `authResult.memberships[0].role === 'SUPERVISOR'`. The local
 *      `activeRole` always matches the JWT-scoped membership (no
 *      client-side role-switch in this slice).
 *   3. Login/logout correctness MUST NOT depend on native SDK presence.
 *      `shouldCallOneSignal()` returns false on web OR when no App ID;
 *      OneSignal calls then no-op with warning log; auth flow always
 *      succeeds.
 *   4. Logout ordering — `OneSignal.logout()` is awaited (with 3s timeout
 *      that falls open) BEFORE `clearTokens()` to prevent phantom-
 *      subscription leak on User A → User B switch on the same device.
 *   5. Supervisor-shell-only routing — non-SUPERVISOR `memberships[0]` is
 *      rejected with `NonSupervisorRoleNotSupportedError`. F-006b adds
 *      WORKER shell (partial relax); mixed-role gap needs a separate
 *      auth-switch slice.
 *
 * @derives(F-006a scope round-2 v6 Pick 2)
 * @derives(ADR-0007)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */

import { Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import type { VerifyOTPOutput } from '@axhy/shared-schema';

import { setTokens, clearTokens, type StoredTokens } from './auth-store';

const ONE_SIGNAL_TIMEOUT_MS = 3_000;

/** Typed JWT payload — only the field we need. */
type JwtPayload = { userId: string; sub?: string };

/**
 * Thrown by `onIdentifiedLogin` (and `onColdStartReady` defensively) when
 * the JWT-scoped membership is not SUPERVISOR. F-006a is supervisor-shell-
 * only; WORKER / HR / OWNER memberships and mixed-role accounts where the
 * backend returned a non-SUPERVISOR role at `memberships[0]` are rejected
 * with this error rather than landed in broken supervisor UI.
 *
 * @derives(F-006a scope round-2 v6 Pick 2 — JWT-scoped role rule)
 */
export class NonSupervisorRoleNotSupportedError extends Error {
  override readonly name = 'NonSupervisorRoleNotSupportedError';
  constructor(message?: string) {
    super(
      message ??
        'Sign-in is not yet supported for your role configuration. Worker-only accounts will be supported when F-006b ships. Mixed-role accounts (where the issued token is not supervisor-scoped) require a separate auth-switch slice still to be scoped.',
    );
  }
}

/**
 * Should OneSignal SDK calls be attempted on this build?
 *
 * Returns `false` if:
 *   - `Platform.OS === 'web'` — Playwright web auth path runs without the
 *     native SDK; OneSignal calls would no-op or throw.
 *   - `process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID` is undefined or empty —
 *     local dev / EAS Build profiles without OneSignal account provisioned.
 *
 * When `false`, callers skip OneSignal entirely with a warning log; the
 * auth flow always succeeds.
 *
 * @derives(F-006a scope round-2 v6 Pick 2 — web/no-App-ID no-op rule)
 */
export function shouldCallOneSignal(): boolean {
  if (Platform.OS === 'web') return false;
  const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
  if (!appId || appId.length === 0) return false;
  return true;
}

/** Race a promise against a timeout. Resolves with the first to settle. */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutValue: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(timeoutValue);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * One-shot runtime initialization of the OneSignal JS SDK.
 *
 * Friend's CODE-phase P1 round-1 (2026-05-17 01:25): the lifecycle hooks
 * call `OneSignal.login` / `OneSignal.logout` /
 * `OneSignal.Notifications.requestPermission` directly. None of those have
 * any effect until the SDK has been initialized with the App ID —
 * `app.config.ts` only wires the native build plugin, not the runtime JS
 * surface.
 *
 * Friend's CODE-phase P1 round-2 (2026-05-17 01:51): the load-bearing
 * init-before-use guarantee lives inside `_resolveOneSignal()`, not the
 * root layout's `useEffect`. React mounts child effects before parent
 * effects, so an authed cold-start in `app/index.tsx` could otherwise call
 * `OneSignal.login` before `_layout.tsx` had a chance to init.
 *
 * **Friend's CODE-phase P1+P2 round-3 (2026-05-17 02:50):** two correctness
 * gaps remained: (P1) the bare-boolean latch flipped to `true` on success
 * but failure paths returned silently — `_resolveOneSignal()` still
 * proceeded to return a live SDK handle against an un-initialized SDK; and
 * (P2) a `if (oneSignalInitialized) return` boolean check is not
 * concurrency-safe — the warm-up in `_layout.tsx` + the first chokepoint
 * call in `_resolveOneSignal()` can both observe `false`, both start the
 * `await import(...)`, and both call `OneSignal.initialize(appId)` before
 * either flips the latch.
 *
 * **Round-3 fix:** the latch is now a `Promise<boolean>` instead of a
 * bare boolean. The first caller starts the work + caches the promise;
 * subsequent callers (including a concurrent warm-up + chokepoint pair)
 * await the SAME promise. The promise resolves to `true` only when the
 * SDK was actually initialized; on any failure path
 * (`shouldCallOneSignal()` false / missing App ID / SDK module load fail /
 * missing `initialize` function / `initialize` throws) it resolves to
 * `false`, and the chokepoint `_resolveOneSignal()` then returns `null` so
 * downstream `login` / `logout` / `requestPermission` calls never happen
 * against an un-initialized SDK.
 *
 * Init failure is session-sticky — once `initPromise` resolves to `false`,
 * subsequent calls reuse that result and continue to no-op. Real-device
 * init failures are usually deterministic (missing native module, bad
 * App ID format), so retrying within the same session would just burn
 * CPU; the next process launch gets a fresh promise.
 *
 * @derives(F-006a CODE-phase friend P1 round-1 fix 2026-05-17 01:25)
 * @derives(F-006a CODE-phase friend P1 round-2 fix 2026-05-17 01:51)
 * @derives(F-006a CODE-phase friend P1+P2 round-3 fix 2026-05-17 02:50)
 */
let initPromise: Promise<boolean> | null = null;

export function initializeOneSignal(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async (): Promise<boolean> => {
    if (!shouldCallOneSignal()) {
      if (__DEV__) {
        console.warn(
          '[identity-lifecycle] OneSignal initialize skipped (web or no app id); push lifecycle will no-op this session.',
        );
      }
      return false;
    }
    const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return false; // belt-and-braces; shouldCallOneSignal already covered this
    try {
      const mod = (await import('react-native-onesignal')) as unknown as {
        OneSignal?: { initialize?: (id: string) => void };
      };
      const fn = mod.OneSignal?.initialize;
      if (typeof fn !== 'function') {
        if (__DEV__) {
          console.warn(
            '[identity-lifecycle] OneSignal.initialize missing on SDK; lifecycle will no-op',
          );
        }
        return false;
      }
      fn(appId);
      return true;
    } catch (err) {
      if (__DEV__) {
        console.warn('[identity-lifecycle] OneSignal.initialize threw; lifecycle will no-op', err);
      }
      return false;
    }
  })();
  return initPromise;
}

/** @internal — test-only escape hatch to reset the init latch between cases. */
export function _resetOneSignalInitializedForTests(): void {
  initPromise = null;
}

/**
 * Dynamically resolve the OneSignal SDK so the module is import-safe on
 * web (where the native SDK throws at import time). Tests mock this via
 * vi.mock('react-native-onesignal').
 *
 * **Init guarantee (friend's CODE-phase round-2 P1 fix 2026-05-17 01:51):**
 * awaits `initializeOneSignal()` BEFORE returning a usable handle. The root
 * layout's `useEffect` is only a warm-up — React's mount order means child
 * effects (`app/index.tsx`) can fire before parent effects (`_layout.tsx`),
 * so the authed cold-start path could otherwise hit `OneSignal.login` before
 * init. By making init part of this chokepoint, every lifecycle path
 * (`onIdentifiedLogin` / `onAppLogout` / `onColdStartReady` / the prompt's
 * default `requestPermission`) is guaranteed init-before-call regardless of
 * useEffect ordering. Init is idempotent via the module-level latch in
 * `initializeOneSignal()`, so the warm-up + chokepoint can both fire safely.
 *
 * @internal — exported for tests only.
 */
export async function _resolveOneSignal(): Promise<{
  login: (id: string) => Promise<void>;
  logout: () => Promise<void>;
} | null> {
  if (!shouldCallOneSignal()) return null;
  // Init-before-use boundary: every lifecycle path lands here before its
  // first SDK call. If init did not actually succeed (missing function,
  // threw, or any failure path), return null so downstream callers no-op
  // instead of hitting login/logout against an un-initialized SDK
  // (friend's CODE-phase P1 round-3 fix 2026-05-17 02:50).
  const initOk = await initializeOneSignal();
  if (!initOk) return null;
  try {
    const mod = (await import('react-native-onesignal')) as unknown as {
      OneSignal?: {
        login: (id: string) => Promise<void> | void;
        logout: () => Promise<void> | void;
      };
    };
    const sdk = mod.OneSignal;
    if (!sdk) return null;
    return {
      login: async (id: string) => {
        await sdk.login(id);
      },
      logout: async () => {
        await sdk.logout();
      },
    };
  } catch (err) {
    if (__DEV__) {
      console.warn('[identity-lifecycle] react-native-onesignal failed to load', err);
    }
    return null;
  }
}

/** Extract userId from the access-token JWT. Returns null on decode failure. */
function decodeUserIdFromJwt(accessToken: string): string | null {
  try {
    const payload = jwtDecode<JwtPayload>(accessToken);
    return payload.userId ?? payload.sub ?? null;
  } catch (err) {
    if (__DEV__) {
      console.warn('[identity-lifecycle] JWT decode failed', err);
    }
    return null;
  }
}

/**
 * The single entry point for "OTP just verified, finalise the identified
 * session." Picks 2/3/5 from v6 scope land here.
 *
 * Sequence:
 *   1. Verify `authResult.memberships[0].role === 'SUPERVISOR'` (JWT-scoped
 *      role rule). If not, throw `NonSupervisorRoleNotSupportedError` and
 *      do NOT persist tokens.
 *   2. Persist tokens via `setTokens`.
 *   3. Decode userId from the JWT.
 *   4. If `shouldCallOneSignal()` is true, call `OneSignal.login(userId)`
 *      with a 3s timeout (falls open — warning logged on timeout/error).
 *      Otherwise log warning + skip.
 *
 * @derives(F-006a scope round-2 v6 Pick 2)
 */
export async function onIdentifiedLogin(authResult: VerifyOTPOutput): Promise<void> {
  const firstMembership = authResult.memberships[0];
  if (firstMembership?.role !== 'SUPERVISOR') {
    throw new NonSupervisorRoleNotSupportedError();
  }

  await setTokens({
    accessToken: authResult.accessToken,
    refreshToken: authResult.refreshToken,
    activeRole: 'SUPERVISOR',
  });

  const userId = decodeUserIdFromJwt(authResult.accessToken);
  if (!userId) {
    // JWT decode failed — identity-link skipped this session. Auth still succeeds;
    // next active login (or cold-start) re-fires the link.
    return;
  }

  const sdk = await _resolveOneSignal();
  if (!sdk) {
    if (__DEV__) {
      console.warn(
        '[identity-lifecycle] OneSignal disabled (web or no app id); auth proceeds without push identity link.',
      );
    }
    return;
  }

  try {
    await withTimeout(sdk.login(userId), ONE_SIGNAL_TIMEOUT_MS, undefined);
  } catch (err) {
    if (__DEV__) {
      console.warn(
        '[identity-lifecycle] OneSignal.login failed; auth succeeds, identity-link skipped',
        err,
      );
    }
  }
}

/**
 * The single logout sequence. Picks 2/4 from v6 scope land here.
 *
 * Sequence:
 *   1. If `shouldCallOneSignal()` is true, call `OneSignal.logout()` with a
 *      3s timeout (falls open).
 *   2. Always call `clearTokens()` — even if OneSignal.logout failed/timed
 *      out. Better to log out the user from our app than to block on the SDK.
 *
 * `OneSignal.logout()` is awaited BEFORE `clearTokens()` to prevent phantom-
 * subscription leak on User A → User B switch on the same device.
 *
 * @derives(F-006a scope round-2 v6 Pick 4)
 */
export async function onAppLogout(): Promise<void> {
  if (shouldCallOneSignal()) {
    const sdk = await _resolveOneSignal();
    if (sdk) {
      try {
        await withTimeout(sdk.logout(), ONE_SIGNAL_TIMEOUT_MS, undefined);
      } catch (err) {
        if (__DEV__) {
          console.warn(
            '[identity-lifecycle] OneSignal.logout timeout/error; proceeding to clearTokens',
            err,
          );
        }
      }
    }
  }
  await clearTokens();
}

/** Return type for `onColdStartReady` — tells the routing gate where to go. */
export type ColdStartRoute = '/(supervisor)/profile' | '/(auth)/phone';

/**
 * The single cold-start sequence. Picks 2/7 from v6 scope land here.
 *
 * Sequence:
 *   1. Defensive: if `tokens.activeRole !== 'SUPERVISOR'`, call
 *      `onAppLogout()` and return `/(auth)/phone`. (Shouldn't happen given
 *      `onIdentifiedLogin`'s Step 1 check, but covers stale-state cases.)
 *   2. Decode userId from the access-token JWT.
 *   3. If `shouldCallOneSignal()` is true, call `OneSignal.login(userId)`
 *      to re-link the device subscription (idempotent in the SDK).
 *   4. Return `/(supervisor)/profile`.
 *
 * Called from `app/index.tsx` after `getTokens()` returns non-null. Covers
 * app reinstall, OS-level subscription drift, OneSignal SDK version bumps.
 *
 * @derives(F-006a scope round-2 v6 Pick 7)
 */
export async function onColdStartReady(tokens: StoredTokens): Promise<{ route: ColdStartRoute }> {
  if (tokens.activeRole !== 'SUPERVISOR') {
    await onAppLogout();
    return { route: '/(auth)/phone' };
  }

  const userId = decodeUserIdFromJwt(tokens.accessToken);
  if (!userId) {
    return { route: '/(supervisor)/profile' };
  }

  const sdk = await _resolveOneSignal();
  if (sdk) {
    try {
      await withTimeout(sdk.login(userId), ONE_SIGNAL_TIMEOUT_MS, undefined);
    } catch (err) {
      if (__DEV__) {
        console.warn(
          '[identity-lifecycle] OneSignal cold-start re-link failed; user session continues',
          err,
        );
      }
    }
  }

  return { route: '/(supervisor)/profile' };
}
