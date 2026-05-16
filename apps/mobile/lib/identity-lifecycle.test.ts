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

import { setTokens, clearTokens } from './auth-store';
import {
  onIdentifiedLogin,
  onAppLogout,
  onColdStartReady,
  shouldCallOneSignal,
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
}));

// Mock jwt-decode — return a fixed payload by default.
vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(() => ({ userId: 'user-uuid-123' })),
}));

// Mock react-native-onesignal — `_resolveOneSignal()` dynamically imports it.
const oneSignalLogin = vi.fn(async (_id: string) => {});
const oneSignalLogout = vi.fn(async () => {});
vi.mock('react-native-onesignal', () => ({
  OneSignal: {
    login: (id: string) => oneSignalLogin(id),
    logout: () => oneSignalLogout(),
  },
}));

const mockedSetTokens = setTokens as unknown as ReturnType<typeof vi.fn>;
const mockedClearTokens = clearTokens as unknown as ReturnType<typeof vi.fn>;
const mockedJwtDecode = jwtDecode as unknown as ReturnType<typeof vi.fn>;

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
  mockedJwtDecode.mockReset();
  mockedJwtDecode.mockReturnValue({ userId: 'user-uuid-123' });
  oneSignalLogin.mockReset();
  oneSignalLogin.mockResolvedValue(undefined);
  oneSignalLogout.mockReset();
  oneSignalLogout.mockResolvedValue(undefined);
  (Platform as { OS: string }).OS = 'ios';
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID = 'test-app-id';
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

  // Case 8: mismatched-order reject (JWT-scoped rule)
  it('rejects when memberships[0] is WORKER even if SUPERVISOR exists at index 1', async () => {
    const result = makeAuthResult([
      { role: 'WORKER', companyId: 'A' },
      { role: 'SUPERVISOR', companyId: 'B' },
    ]);

    await expect(onIdentifiedLogin(result)).rejects.toBeInstanceOf(
      NonSupervisorRoleNotSupportedError,
    );
    expect(mockedSetTokens).not.toHaveBeenCalled();
    expect(oneSignalLogin).not.toHaveBeenCalled();
  });

  // Case 9: no-SUPERVISOR reject (and empty memberships)
  it('rejects WORKER-only memberships and empty memberships array', async () => {
    await expect(onIdentifiedLogin(makeAuthResult([{ role: 'WORKER' }]))).rejects.toBeInstanceOf(
      NonSupervisorRoleNotSupportedError,
    );
    await expect(onIdentifiedLogin(makeAuthResult([]))).rejects.toBeInstanceOf(
      NonSupervisorRoleNotSupportedError,
    );
    expect(mockedSetTokens).not.toHaveBeenCalled();
    expect(oneSignalLogin).not.toHaveBeenCalled();
  });
});

describe('identity-lifecycle — onAppLogout', () => {
  // Case 2: logout ordering
  it('calls OneSignal.logout() BEFORE clearTokens()', async () => {
    const callOrder: string[] = [];
    oneSignalLogout.mockImplementation(async () => {
      callOrder.push('OneSignal.logout');
    });
    mockedClearTokens.mockImplementation(async () => {
      callOrder.push('clearTokens');
    });

    await onAppLogout();

    expect(callOrder).toEqual(['OneSignal.logout', 'clearTokens']);
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
    expect(result.route).toBe('/(supervisor)/profile');
  });

  // Case 10: defensive cold-start logout
  it('on stale tokens.activeRole !== SUPERVISOR: calls onAppLogout + routes to /(auth)/phone', async () => {
    const result = await onColdStartReady({
      accessToken: 'header.payload.sig',
      refreshToken: 'refresh',
      activeRole: 'WORKER',
    });

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    expect(oneSignalLogin).not.toHaveBeenCalled();
    expect(result.route).toBe('/(auth)/phone');
  });
});
