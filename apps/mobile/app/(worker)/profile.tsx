/**
 * Worker Profile — settings, language, logout.
 *
 * Slice 1 scaffold: placeholder with logout button only. Full implementation
 * (language switcher en/hi/te, account info, account delete via email)
 * lands in slice 3 per MVP_V2_ALIGNED_PLAN.md §2 (V2 ProfileScreen.tsx).
 * Theme picker explicitly cut at MVP per DO_NOT_BUILD_MVP.md.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 */

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { onAppLogout } from '../../lib/identity-lifecycle';
import { NAV_ROUTES } from '../../lib/api-routes';

/** @derives(master-plan §G) — worker surface */
export default function WorkerProfile() {
  async function handleLogout() {
    try {
      await onAppLogout();
    } catch (err) {
      // Defensive: onAppLogout already falls open on OneSignal/clearTokens
      // failures, but we still guard the route navigation so a thrown error
      // never leaves the user stranded on a Profile that "did nothing."
      if (__DEV__) {
        console.warn('[worker-profile] onAppLogout threw; navigating to phone anyway', err);
      }
    }
    router.replace(NAV_ROUTES.authPhone);
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.inner}>
        <Text style={s.heading}>Profile</Text>
        <Text style={s.sub}>Language, account info, support land in slice 3.</Text>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  inner: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[6],
  },
  heading: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
  },
  sub: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    marginBottom: tokens.space[6],
  },
  logoutBtn: {
    marginTop: tokens.space[4],
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
    alignSelf: 'flex-start',
  },
  logoutText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent,
  },
});
