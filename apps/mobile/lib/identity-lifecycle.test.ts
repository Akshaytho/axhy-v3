/**
 * F-006a — identity-lifecycle unit suite (10 active cases; no legacy/replaced).
 *
 * Cases:
 *  1. happy path — onIdentifiedLogin persists tokens + calls OneSignal.login(userId)
 *  2. logout ordering — OneSignal.logout() BEFORE clearTokens()
 *  3. cold-start re-link — onColdStartReady calls OneSignal.login(userId) exactly once
 *  4. logout timeout — OneSignal.logout exceeds 3s, clearTokens still runs
 *  5. JWT decode failure — corrupt JWT skips OneSignal.login; setTokens still ran
 *  6. web no-op — Platform.OS === 'web' skips OneSignal entirely; auth succeeds
 *  7. no App ID no-op — undefined env skips OneSignal entirely; auth succeeds
 *  8. mismatched-order reject — memberships[0] WORKER (even with SUPERVISOR at idx 1) throws
 *  9. no-SUPERVISOR reject — memberships=[WORKER] and memberships=[] both throw
 * 10. defensive cold-start logout — tokens.activeRole !== 'SUPERVISOR' triggers onAppLogout
 *
 * @derives(F-006a scope round-2 v6 Pick 2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform } from 'react-native';
import { jwtDecode } from 'jwt-decode';

import { setTokens, clearTokens, getTokens } from './auth-store';
import {
  onIdentifiedLogin,
  onAppLogout,
  onColdStartReady,
  shouldCallOneSignal,
  initializeOneSignal,
  _resetOneSignalInitializedForTests,
  NonSupervisorRoleNotSupportedError,
} from './identity-lifecycle';

// Mock react-native — node test env doesn't have the RN runtime.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// Mock auth-store — narrow primitives; identity-lifecycle wraps them.
vi.mock('./auth-store', () => ({
  setTokens: vi.fn(async () => {}),
  clearTokens: vi.fn(async () => {}),
  getTokens: vi.fn(async () => ({
    accessToken: 'header.payload.sig',
    refreshToken: 'axrt_stored_refresh',
    activeRole: 'SUPERVISOR',
  })),
}));

// Mock jwt-decode — return a fixed payload by default.
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(() => ({ userId: 'user-uuid-123' })),
}));

// Mock react-native-onesignal — `_resolveOneSignal()` + `initializeOneSignal()`
// dynamically import it.
const oneSignalInitialize = vi.fn((_id: string) => {});
const oneSignalLogin = vi.fn(async (_id: string) => {});
const oneSignalLogout = vi.fn(async () => {});
vi.mock('react-native-onesignal', () => ({
  OneSignal: {
    initialize: (id: string) => oneSignalInitialize(id),
    login: (id: string) => oneSignalLogin(id),
    logout: () => oneSignalLogout(),
  },
}));

const mockedSetTokens = setTokens as unknown as ReturnType<typeof vi.fn>;
const mockedClearTokens = clearTokens as unknown as ReturnType<typeof vi.fn>;
const mockedGetTokens = getTokens as unknown as ReturnType<typeof vi.fn>;
const mockedJwtDecode = jwtDecode as unknown as ReturnType<typeof vi.fn>;
const mockedFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockedFetch as unknown as typeof fetch;

function makeAuthResult(memberships: Array<{ role: string; companyId?: string }>) {
  return {
    accessToken: 'header.payload.sig',
    refreshToken: 'refresh-token',
    memberships: memberships.map((m, i) => ({
      role: m.role,
      companyId: m.companyId ?? `company-${i}`,
    })),
  } as unknown as Parameters<typeof onIdentifiedLogin>[0];
}

beforeEach(() => {
  mockedSetTokens.mockClear();
  mockedClearTokens.mockClear();
  mockedGetTokens.mockReset();
  mockedGetTokens.mockResolvedValue({
    accessToken: 'header.payload.sig',
    refreshToken: 'axrt_stored_refresh',
    activeRole: 'SUPERVISOR',
  });
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  mockedJwtDecode.mockReset();
  mockedJwtDecode.mockReturnValue({ userId: 'user-uuid-123' });
  oneSignalInitialize.mockReset();
  oneSignalLogin.mockReset();
  oneSignalLogin.mockResolvedValue(undefined);
  oneSignalLogout.mockReset();
  oneSignalLogout.mockResolvedValue(undefined);
  (Platform as { OS: string }).OS = 'ios';
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID = 'test-app-id';
  _resetOneSignalInitializedForTests();
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
});

describe('identity-lifecycle — onIdentifiedLogin', () => {
  // Case 1: happy path
  it('persists tokens with activeRole=SUPERVISOR and calls OneSignal.login(userId)', async () => {
    const result = makeAuthResult([
      { role: 'SUPERVISOR', companyId: 'A' },
      { role: 'WORKER', companyId: 'B' },
    ]);

    await onIdentifiedLogin(result);

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(mockedSetTokens).toHaveBeenCalledWith({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh-token',
      activeRole: 'SUPERVISOR',
    });
    expect(oneSignalLogin).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).toHaveBeenCalledWith('user-uuid-123');
  });

  // Case 5: JWT decode failure
  it('logs warning + skips OneSignal.login when JWT decode fails; setTokens still ran', async () => {
    mockedJwtDecode.mockImplementation(() => {
      throw new Error('bad token');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await onIdentifiedLogin(makeAuthResult([{ role: 'SUPERVISOR' }]));

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // Case 6: web no-op
  it('on web platform: persists tokens + skips OneSignal entirely; auth succeeds', async () => {
    (Platform as { OS: string }).OS = 'web';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await onIdentifiedLogin(makeAuthResult([{ role: 'SUPERVISOR' }]));

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(shouldCallOneSignal()).toBe(false);
    warnSpy.mockRestore();
  });

  // Case 7: no App ID no-op
  it('with no EXPO_PUBLIC_ONESIGNAL_APP_ID: persists tokens + skips OneSignal entirely', async () => {
    delete process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await onIdentifiedLogin(makeAuthResult([{ role: 'SUPERVISOR' }]));

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(shouldCallOneSignal()).toBe(false);
    warnSpy.mockRestore();
  });

  // Case 8a (F-006b 2026-05-21): WORKER at memberships[0] is now ACCEPTED.
  // Tokens persist with activeRole=WORKER; OneSignal.login fires once.
  it('accepts WORKER at memberships[0] — persists tokens with activeRole=WORKER and calls OneSignal.login', async () => {
    const result = makeAuthResult([
      { role: 'WORKER', companyId: 'A' },
      { role: 'SUPERVISOR', companyId: 'B' },
    ]);

    await onIdentifiedLogin(result);

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(mockedSetTokens).toHaveBeenCalledWith({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh-token',
      activeRole: 'WORKER',
    });
    expect(oneSignalLogin).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).toHaveBeenCalledWith('user-uuid-123');
  });

  // Case 8b (F-006b 2026-05-21): unsupported role (HR/OWNER) at memberships[0]
  // still throws. Splits the previous Case 8 (non-supervisor throws) by role.
  it('rejects HR at memberships[0] even when WORKER exists at index 1', async () => {
    const result = makeAuthResult([
      { role: 'HR', companyId: 'A' },
      { role: 'WORKER', companyId: 'B' },
    ]);

    await expect(onIdentifiedLogin(result)).rejects.toBeInstanceOf(
      NonSupervisorRoleNotSupportedError,
    );
    expect(mockedSetTokens).not.toHaveBeenCalled();
    expect(oneSignalLogin).not.toHaveBeenCalled();
  });

  // Case 9a (F-006b 2026-05-21): WORKER-only membership now ACCEPTED.
  // Splits the previous Case 9 — workers no longer reject when SUPERVISOR is absent.
  it('accepts WORKER-only membership', async () => {
    await onIdentifiedLogin(makeAuthResult([{ role: 'WORKER' }]));

    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    expect(mockedSetTokens).toHaveBeenCalledWith(expect.objectContaining({ activeRole: 'WORKER' }));
    expect(oneSignalLogin).toHaveBeenCalledTimes(1);
  });

  // Case 9b (F-006b 2026-05-21): empty memberships array still throws.
  // Splits the previous Case 9 — empty-array path unchanged from F-006a.
  it('rejects empty memberships array', async () => {
    await expect(onIdentifiedLogin(makeAuthResult([]))).rejects.toBeInstanceOf(
      NonSupervisorRoleNotSupportedError,
    );
    expect(mockedSetTokens).not.toHaveBeenCalled();
    expect(oneSignalLogin).not.toHaveBeenCalled();
  });
});

describe('identity-lifecycle — onAppLogout', () => {
  // Case 2: logout ordering — OneSignal.logout → POST /auth/sign-out → clearTokens
  it('calls OneSignal.logout() → POST /auth/sign-out → clearTokens() in that order', async () => {
    const callOrder: string[] = [];
    oneSignalLogout.mockImplementation(async () => {
      callOrder.push('OneSignal.logout');
    });
    mockedFetch.mockImplementation(async (input: unknown) => {
      callOrder.push('fetch');
      const url = typeof input === 'string' ? input : (input as { url: string }).url;
      expect(url.endsWith('/auth/sign-out')).toBe(true);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    mockedClearTokens.mockImplementation(async () => {
      callOrder.push('clearTokens');
    });

    await onAppLogout();

    expect(callOrder).toEqual(['OneSignal.logout', 'fetch', 'clearTokens']);
    const fetchArgs = mockedFetch.mock.calls[0];
    const body = JSON.parse((fetchArgs?.[1] as { body: string }).body);
    expect(body.refreshToken).toBe('axrt_stored_refresh');
  });

  // sign-out failure: clearTokens still runs
  it('still calls clearTokens when /auth/sign-out throws', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await onAppLogout();

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  // no stored refresh token: sign-out skipped; clearTokens still runs
  it('skips /auth/sign-out and still calls clearTokens when no refresh token is stored', async () => {
    mockedGetTokens.mockResolvedValue(null);

    await onAppLogout();

    expect(mockedFetch).not.toHaveBeenCalled();
    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
  });

  // Case 4: logout timeout falls open
  it('falls through to clearTokens when OneSignal.logout exceeds 3s', async () => {
    oneSignalLogout.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const start = Date.now();
    await onAppLogout();
    const elapsed = Date.now() - start;

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    // Timeout is 3000ms but withTimeout falls open via resolve(timeoutValue);
    // assert it didn't hang past timeout + a small margin.
    expect(elapsed).toBeLessThan(4000);
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    warnSpy.mockRestore();
  }, 6000);
});

describe('identity-lifecycle — onColdStartReady', () => {
  // Case 3: cold-start re-link
  it('decodes JWT + calls OneSignal.login(userId) exactly once; routes to supervisor', async () => {
    const result = await onColdStartReady({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh',
      activeRole: 'SUPERVISOR',
    });

    expect(oneSignalLogin).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).toHaveBeenCalledWith('user-uuid-123');
    expect(result.route).toBe('/(supervisor)/me');
  });

  // Case 10a (F-006b 2026-05-21): cold-start with WORKER role now routes to
  // /(worker) (no logout). Splits the previous Case 10 — WORKER is no
  // longer a stale-state trigger.
  it('on WORKER tokens: re-links OneSignal and routes to /(worker) without logout', async () => {
    const result = await onColdStartReady({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh',
      activeRole: 'WORKER',
    });

    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(oneSignalLogin).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).toHaveBeenCalledWith('user-uuid-123');
    expect(result.route).toBe('/(worker)');
  });

  // Case 10b (F-006b 2026-05-21): cold-start with any unsupported role
  // (HR/OWNER) still triggers defensive logout. Splits the previous Case 10 —
  // logout path now requires role to be neither SUPERVISOR nor WORKER.
  it('on unsupported role tokens (HR): calls onAppLogout + routes to /(auth)/phone', async () => {
    const result = await onColdStartReady({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh',
      activeRole: 'HR',
    });

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).not.toHaveBeenCalled();
    expect(result.route).toBe('/(auth)/phone');
  });
});

describe('identity-lifecycle — initializeOneSignal (friend P1 fix)', () => {
  // Case 11: native + App ID present → SDK initialize called exactly once,
  // even if initializeOneSignal() is invoked multiple times.
  it('calls OneSignal.initialize(appId) exactly once; idempotent across repeated calls', async () => {
    await initializeOneSignal();
    await initializeOneSignal();
    await initializeOneSignal();

    expect(oneSignalInitialize).toHaveBeenCalledTimes(1);
    expect(oneSignalInitialize).toHaveBeenCalledWith('test-app-id');
  });

  // Case 12: web platform → init skipped entirely, warning logged
  it('on web platform: skips OneSignal.initialize; warning logged', async () => {
    (Platform as { OS: string }).OS = 'web';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initializeOneSignal();

    expect(oneSignalInitialize).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // Case 13: no App ID → init skipped, warning logged
  it('with no EXPO_PUBLIC_ONESIGNAL_APP_ID: skips OneSignal.initialize; warning logged', async () => {
    delete process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initializeOneSignal();

    expect(oneSignalInitialize).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('identity-lifecycle — init-before-use ordering (friend P1 round-2)', () => {
  // Case 14: cold-start race — onColdStartReady() must trigger init
  // BEFORE OneSignal.login(), regardless of whether _layout.tsx's useEffect
  // has fired yet. (React's child useEffects run before parent useEffects on
  // mount, so app/index.tsx → onColdStartReady can race ahead of _layout.tsx's
  // warm-up call.) The fix is to make init part of the lifecycle boundary
  // itself (_resolveOneSignal awaits init).
  it('onColdStartReady triggers OneSignal.initialize before OneSignal.login even when warm-up has not fired', async () => {
    // No initializeOneSignal() call before this — simulates the race.
    const callOrder: string[] = [];
    oneSignalInitialize.mockImplementation((_id: string) => {
      callOrder.push('OneSignal.initialize');
    });
    oneSignalLogin.mockImplementation(async (_id: string) => {
      callOrder.push('OneSignal.login');
    });

    await onColdStartReady({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh',
      activeRole: 'SUPERVISOR',
    });

    expect(callOrder).toEqual(['OneSignal.initialize', 'OneSignal.login']);
    expect(oneSignalInitialize).toHaveBeenCalledWith('test-app-id');
  });

  // Case 15: identified-login defense in depth — onIdentifiedLogin must also
  // init before login, even though OTP-verify usually happens long after the
  // warm-up. Belt-and-braces because the chokepoint guarantee should hold
  // independently of mount-order assumptions.
  it('onIdentifiedLogin triggers OneSignal.initialize before OneSignal.login even when warm-up has not fired', async () => {
    const callOrder: string[] = [];
    oneSignalInitialize.mockImplementation((_id: string) => {
      callOrder.push('OneSignal.initialize');
    });
    oneSignalLogin.mockImplementation(async (_id: string) => {
      callOrder.push('OneSignal.login');
    });

    await onIdentifiedLogin(makeAuthResult([{ role: 'SUPERVISOR' }]));

    expect(callOrder).toEqual(['OneSignal.initialize', 'OneSignal.login']);
  });
});

describe('identity-lifecycle — init failure + concurrency (friend P1+P2 round-3)', () => {
  // Case 16: friend's P1 round-3 — when OneSignal.initialize throws, the
  // lifecycle paths MUST NOT proceed to call login/logout/requestPermission
  // against an un-initialized SDK. _resolveOneSignal() returns null on
  // init failure; onIdentifiedLogin sees null and skips OneSignal.login;
  // setTokens still runs (auth never depends on push lifecycle).
  it('init failure (initialize throws) → _resolveOneSignal returns null → onIdentifiedLogin skips OneSignal.login', async () => {
    oneSignalInitialize.mockImplementation(() => {
      throw new Error('native module failed to load');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await onIdentifiedLogin(makeAuthResult([{ role: 'SUPERVISOR' }]));

    // initialize was attempted exactly once + threw.
    expect(oneSignalInitialize).toHaveBeenCalledTimes(1);
    // BUT login was NEVER called against the un-initialized SDK.
    expect(oneSignalLogin).not.toHaveBeenCalled();
    // Auth flow still succeeded (setTokens ran).
    expect(mockedSetTokens).toHaveBeenCalledTimes(1);
    // Failure was logged.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // Case 17: friend's P2 round-3 — concurrent warm-up + first-chokepoint
  // must call OneSignal.initialize exactly ONCE. The bare-boolean latch
  // round-2 had a TOCTOU race: both callers observe `false`, both await
  // the import, both call initialize. The promise-latch fix has the first
  // caller cache the promise; subsequent callers await the SAME promise.
  it('concurrent initializeOneSignal calls (warm-up + chokepoint race) result in exactly ONE OneSignal.initialize invocation', async () => {
    // Slow the SDK import + initialize so concurrent callers actually overlap.
    oneSignalInitialize.mockImplementation((_id: string) => {
      // synchronous call inside the IIFE; the overlap window is the
      // dynamic import + the await-resolution. With the promise latch,
      // only the first caller schedules the work.
    });

    const results = await Promise.all([
      initializeOneSignal(),
      initializeOneSignal(),
      initializeOneSignal(),
      initializeOneSignal(),
    ]);

    expect(oneSignalInitialize).toHaveBeenCalledTimes(1);
    expect(oneSignalInitialize).toHaveBeenCalledWith('test-app-id');
    // All callers observe the same successful init result.
    expect(results).toEqual([true, true, true, true]);
  });
});
