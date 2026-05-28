/**
 * Secure token storage for the mobile app.
 *
 * JWT lives exclusively in expo-secure-store — never AsyncStorage,
 * never SQLite, never Zustand persisted state.
 *
 * On web (Playwright / browser dev), expo-secure-store is a stub so we
 * fall back to localStorage. This only affects web builds — iOS/Android
 * always use the native secure enclave path.
 *
 * **F-006a discipline lock:** `setTokens` / `clearTokens` are narrow
 * storage primitives. Do NOT call them directly from identified-login or
 * logout flows — go through `identity-lifecycle.ts` instead
 * (`onIdentifiedLogin` / `onAppLogout` / `onColdStartReady`). That module
 * owns the ONE explicit identity contract (JWT-scoped role check +
 * conditional `OneSignal.login`/`logout` + logout-before-clearTokens
 * ordering). Direct use here bypasses the OneSignal lifecycle and risks
 * phantom-subscription leak on User A → User B device handoff.
 *
 * @derives(ADR-0007)
 * @derives(F-006a scope round-2 v6 Pick 2)
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Web fallback — localStorage is acceptable for Playwright screenshot runs.
// On native, SecureStore.setItemAsync is always defined.
const isWeb = Platform.OS === 'web';

const webStore = {
  getItem: (key: string) =>
    Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return Promise.resolve();
  },
  deleteItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const KEY_ACCESS = 'axhy_access_token';
const KEY_REFRESH = 'axhy_refresh_token';
const KEY_ACTIVE_ROLE = 'axhy_active_role';

/** @derives(ADR-0007) */
export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  activeRole: string;
};

/** @derives(ADR-0007) */
export async function getTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, activeRole] = await Promise.all([
    isWeb ? webStore.getItem(KEY_ACCESS) : SecureStore.getItemAsync(KEY_ACCESS),
    isWeb ? webStore.getItem(KEY_REFRESH) : SecureStore.getItemAsync(KEY_REFRESH),
    isWeb ? webStore.getItem(KEY_ACTIVE_ROLE) : SecureStore.getItemAsync(KEY_ACTIVE_ROLE),
  ]);

  if (!accessToken || !refreshToken || !activeRole) return null;

  return { accessToken, refreshToken, activeRole };
}

/** @derives(ADR-0007) */
export async function setTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    isWeb
      ? webStore.setItem(KEY_ACCESS, tokens.accessToken)
      : SecureStore.setItemAsync(KEY_ACCESS, tokens.accessToken),
    isWeb
      ? webStore.setItem(KEY_REFRESH, tokens.refreshToken)
      : SecureStore.setItemAsync(KEY_REFRESH, tokens.refreshToken),
    isWeb
      ? webStore.setItem(KEY_ACTIVE_ROLE, tokens.activeRole)
      : SecureStore.setItemAsync(KEY_ACTIVE_ROLE, tokens.activeRole),
  ]);
}

/**
 * Atomic swap of accessToken + refreshToken after a successful
 * /auth/refresh rotation. Does NOT touch activeRole — that lifecycle
 * concern stays with identity-lifecycle.ts. Owner: api.ts refresh
 * interceptor. Safe to call from outside identity-lifecycle because
 * rotation is neither login nor logout.
 *
 * @derives(F1-b trust model 2026-05-28)
 */
export async function replaceTokens(next: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  await Promise.all([
    isWeb
      ? webStore.setItem(KEY_ACCESS, next.accessToken)
      : SecureStore.setItemAsync(KEY_ACCESS, next.accessToken),
    isWeb
      ? webStore.setItem(KEY_REFRESH, next.refreshToken)
      : SecureStore.setItemAsync(KEY_REFRESH, next.refreshToken),
  ]);
}

/** @derives(ADR-0007) */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    isWeb ? webStore.deleteItem(KEY_ACCESS) : SecureStore.deleteItemAsync(KEY_ACCESS),
    isWeb ? webStore.deleteItem(KEY_REFRESH) : SecureStore.deleteItemAsync(KEY_REFRESH),
    isWeb ? webStore.deleteItem(KEY_ACTIVE_ROLE) : SecureStore.deleteItemAsync(KEY_ACTIVE_ROLE),
  ]);
}
