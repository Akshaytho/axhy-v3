/**
 * F-006a — Mobile identity-lifecycle: ONE ordered sequence wrapping
 * `setTokens` / `clearTokens` with conditional OneSignal SDK calls.
 *
 * ALL login / logout / cold-start call-sites in the mobile app go through
 * this module — not directly through `auth-store.ts`. This preserves the
 * "ONE explicit identity contract" lock (friend's v1 lock; v2/v3/v4/v5/v6
 * iterations + F-006b 2026-05-21 worker-shell relaxation) so OneSignal
 * identity-linking can never be silently bypassed.
 *
 * **Locked invariants (v6 + F-006b 2026-05-21):**
 *   1. ONE ordered sequence per function — no overlapping rules, no
 *      two-paths-to-tokens. See Pick 2 in the plan file.
 *   2. JWT-scoped role rule — accept identified login when
 *      `authResult.memberships[0].role` is `SUPERVISOR` or `WORKER`
 *      (F-006b 2026-05-21 relaxation; previously SUPERVISOR-only). The
 *      local `activeRole` always matches the JWT-scoped membership
 *      (no client-side role-switch in this slice). HR / OWNER / empty
 *      memberships continue to throw `NonSupervisorRoleNotSupportedError`.
 *   3. Login/logout correctness MUST NOT depend on native SDK presence.
 *      `shouldCallOneSignal()` returns false on web OR when no App ID;
 *      OneSignal calls then no-op with warning log; auth flow always
 *      succeeds.
 *   4. Logout ordering — `OneSignal.logout()` is awaited (with 3s timeout
 *      that falls open) BEFORE `clearTokens()` to prevent phantom-
 *      subscription leak on User A → User B switch on the same device.
 *   5. Worker-or-supervisor shell routing — non-SUPERVISOR-AND-non-WORKER
 *      `memberships[0]` is rejected with `NonSupervisorRoleNotSupportedError`.
 *      F-006b 2026-05-21 added WORKER acceptance. Mixed-role gap (account
 *      where the issued token role at index 0 is unsupported but a
 *      supported role exists at index 1+) still needs a separate
 *      auth-switch slice.
 *
 * @derives(F-006a scope round-2 v6 Pick 2)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 * @derives(ADR-0007)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */

import { Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';
import { RoleSchema, type VerifyOTPOutput } from '@axhy/shared-schema';

import { setTokens, clearTokens, type StoredTokens } from './auth-store';

const SUPERVISOR = RoleSchema.enum.SUPERVISOR;
const WORKER = RoleSchema.enum.WORKER;

const ONE_SIGNAL_TIMEOUT_MS = 3_000;

/** Typed JWT payload — only the field we need. */
type JwtPayload = { userId: string; sub?: string };

/**
 * Thrown by `onIdentifiedLogin` (and `onColdStartReady` defensively) when
 * the JWT-scoped membership role is neither SUPERVISOR nor WORKER. F-006a
 * supported supervisor only; F-006b 2026-05-21 added WORKER acceptance.
 * HR / OWNER / empty memberships and mixed-role accounts where the
 * backend returned an unsupported role at `memberships[0]` are rejected
 * with this error rather than landed in a broken shell.
 *
 * Name retained for backwards compatibility with code that catches the
 * class; the message text reflects the F-006b scope.
 *
 * @derives(F-006a scope round-2 v6 Pick 2 — JWT-scoped role rule)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */
export class NonSupervisorRoleNotSupportedError extends Error {
  override readonly name = 'NonSupervisorRoleNotSupportedError';
  constructor(message?: string) {
    super(
      message ??
        'Sign-in is not yet supported for your role configuration. Worker and Supervisor accounts are supported. Mixed-role accounts (where the issued token is not worker-or-supervisor-scoped at memberships[0]) require a separate auth-switch slice still to be scoped.',
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
 * See file header for the chokepoint-init-before-use rationale. Returns
 * a cached `Promise<boolean>` so concurrent warm-up + chokepoint callers
 * only invoke `OneSignal.initialize` once. The promise resolves `true`
 * only when the SDK was actually initialized; on any failure path
 * resolves `false` so downstream calls no-op safely.
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
 * Awaits `initializeOneSignal()` BEFORE returning a usable handle (P1
 * round-2 fix 2026-05-17 01:51 + P1+P2 round-3 fix 2026-05-17 02:50). If
 * init did not succeed, returns `null` so downstream callers no-op
 * instead of hitting login/logout against an un-initialized SDK.
 *
 * @internal — exported for tests only.
 */
export async function _resolveOneSignal(): Promise<{
  login: (id: string) => Promise<void>;
  logout: () => Promise<void>;
} | null> {
  if (!shouldCallOneSignal()) return null;
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
 * session." Picks 2/3/5 from v6 scope land here, with F-006b 2026-05-21
 * adding worker acceptance at memberships[0].
 *
 * Sequence:
 *   1. Read `authResult.memberships[0].role`. If it is neither SUPERVISOR
 *      nor WORKER, throw `NonSupervisorRoleNotSupportedError` and do NOT
 *      persist tokens.
 *   2. Persist tokens via `setTokens` with `activeRole` set to the actual
 *      role from the JWT (no longer hardcoded to SUPERVISOR per F-006b).
 *   3. Decode userId from the JWT.
 *   4. If `shouldCallOneSignal()` is true, call `OneSignal.login(userId)`
 *      with a 3s timeout (falls open — warning logged on timeout/error).
 *      Otherwise log warning + skip.
 *
 * @derives(F-006a scope round-2 v6 Pick 2)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */
export async function onIdentifiedLogin(authResult: VerifyOTPOutput): Promise<void> {
  return onIdentifiedLoginImpl(authResult);
}

async function onIdentifiedLoginImpl(authResult: VerifyOTPOutput): Promise<void> {
  const firstMembership = authResult.memberships[0];
  const role = firstMembership?.role;
  if (role !== SUPERVISOR && role !== WORKER) {
    throw new NonSupervisorRoleNotSupportedError();
  }

  await setTokens({
    accessToken: authResult.accessToken,
    refreshToken: authResult.refreshToken,
    activeRole: role,
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

/**
 * Return type for `onColdStartReady` — tells the routing gate where to go.
 * F-006b 2026-05-21 adds `/(worker)` to the union (group route, resolves to (worker)/index.tsx).
 */
export type ColdStartRoute = '/(supervisor)/profile' | '/(worker)' | '/(auth)/phone';

/**
 * The single cold-start sequence. Picks 2/7 from v6 scope land here, with
 * F-006b 2026-05-21 adding the WORKER branch.
 *
 * Sequence:
 *   1. Defensive: if `tokens.activeRole` is neither SUPERVISOR nor WORKER,
 *      call `onAppLogout()` and return `/(auth)/phone`. (Shouldn't happen
 *      given `onIdentifiedLogin`'s Step 1 check, but covers stale-state
 *      cases — e.g. HR token from a different installation.)
 *   2. Decode userId from the access-token JWT.
 *   3. If `shouldCallOneSignal()` is true, call `OneSignal.login(userId)`
 *      to re-link the device subscription (idempotent in the SDK).
 *   4. Return the home route for the active role: `/(supervisor)/profile`
 *      for SUPERVISOR, `/(worker)` for WORKER (group route — Expo Router
 *      resolves to (worker)/index.tsx automatically; the explicit `/index`
 *      suffix does not match on native).
 *
 * Called from `app/index.tsx` after `getTokens()` returns non-null. Covers
 * app reinstall, OS-level subscription drift, OneSignal SDK version bumps.
 *
 * @derives(F-006a scope round-2 v6 Pick 7)
 * @derives(F-006b worker-shell relaxation 2026-05-21)
 */
export async function onColdStartReady(tokens: StoredTokens): Promise<{ route: ColdStartRoute }> {
  return onColdStartReadyImpl(tokens);
}

async function onColdStartReadyImpl(tokens: StoredTokens): Promise<{ route: ColdStartRoute }> {
  if (tokens.activeRole !== SUPERVISOR && tokens.activeRole !== WORKER) {
    await onAppLogout();
    return { route: '/(auth)/phone' };
  }

  const homeRoute: ColdStartRoute =
    tokens.activeRole === SUPERVISOR ? '/(supervisor)/profile' : '/(worker)';

  const userId = decodeUserIdFromJwt(tokens.accessToken);
  if (!userId) {
    return { route: homeRoute };
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

  return { route: homeRoute };
}
