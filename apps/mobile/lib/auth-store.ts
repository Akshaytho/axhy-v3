/**
 * Secure token storage for the mobile app.
 *
 * JWT lives exclusively in expo-secure-store — never AsyncStorage,
 * never SQLite, never Zustand persisted state.
 *
 * @derives(ADR-0007)
 */

import * as SecureStore from 'expo-secure-store';

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
    SecureStore.getItemAsync(KEY_ACCESS),
    SecureStore.getItemAsync(KEY_REFRESH),
    SecureStore.getItemAsync(KEY_ACTIVE_ROLE),
  ]);

  if (!accessToken || !refreshToken || !activeRole) return null;

  return { accessToken, refreshToken, activeRole };
}

/** @derives(ADR-0007) */
export async function setTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEY_ACCESS, tokens.accessToken),
    SecureStore.setItemAsync(KEY_REFRESH, tokens.refreshToken),
    SecureStore.setItemAsync(KEY_ACTIVE_ROLE, tokens.activeRole),
  ]);
}

/** @derives(ADR-0007) */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS),
    SecureStore.deleteItemAsync(KEY_REFRESH),
    SecureStore.deleteItemAsync(KEY_ACTIVE_ROLE),
  ]);
}
