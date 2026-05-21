/**
 * Consent screen — worker auth flow step 4 of 4.
 * (Splash/index → phone → otp → permissions → consent → (worker) home)
 *
 * Single-page DPDP consent (Critic-MVP-Scope M22 cut from the 3-page carousel).
 * Posts to POST /worker/consent with the current policy version; backend
 * appends a row to the ConsentLog table.
 *
 * On accept: routes to (worker) home. On decline (back button): logs out and
 * returns to phone screen.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §6 + §13 M22)
 * @derives(F-006b — worker auth flow)
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { apiFetch, ApiError } from '../../lib/api';
import { API_ROUTES, NAV_ROUTES } from '../../lib/api-routes';
import { onAppLogout } from '../../lib/identity-lifecycle';

const POLICY_VERSION = '2026-05-21';
const POLICY_URL = 'https://axhy.app/privacy';

/** @derives(master-plan §G) */
export default function ConsentScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(API_ROUTES.workerConsent, {
        method: 'POST',
        body: { policyVersion: POLICY_VERSION },
      });
      router.replace(NAV_ROUTES.workerHome);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already consented — treat as success.
        router.replace(NAV_ROUTES.workerHome);
        return;
      }
      setError('Could not record consent. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDecline() {
    try {
      await onAppLogout();
    } catch (err) {
      if (__DEV__) {
        console.warn('[consent] onAppLogout threw; navigating to phone anyway', err);
      }
    }
    router.replace(NAV_ROUTES.authPhone);
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.inner}>
        <Text style={s.heading}>Your privacy</Text>
        <Text style={s.sub}>
          Axhy stores your name, phone, photos you take during work, and your location while you are
          on a job. We use this to prove the work was done and to pay you on time. We never sell
          your data.
        </Text>

        <View style={s.bulletList}>
          <Text style={s.bullet}>• Photos are kept until 90 days after you leave.</Text>
          <Text style={s.bullet}>• Location is only tracked while a job is active.</Text>
          <Text style={s.bullet}>• You can delete your account by emailing support@axhy.app.</Text>
        </View>

        <TouchableOpacity
          onPress={() => Linking.openURL(POLICY_URL).catch(() => {})} // audit-ok: external URL open failure is non-blocking
          activeOpacity={0.7}
        >
          <Text style={s.link}>Read the full privacy notice →</Text>
        </TouchableOpacity>

        {error !== null && <Text style={s.error}>{error}</Text>}

        <View style={s.spacer} />

        <TouchableOpacity
          style={s.acceptBtn}
          onPress={handleAccept}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={tokens.color.surface.paper} />
          ) : (
            <Text style={s.acceptText}>I agree, continue</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDecline} activeOpacity={0.7} style={s.declineBtn}>
          <Text style={s.declineText}>I don't agree</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  inner: {
    flexGrow: 1,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[6],
    paddingBottom: tokens.space[6],
  },
  heading: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: tokens.type.display.tracking,
    marginBottom: tokens.space[1],
  },
  sub: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[3],
  },
  bulletList: {
    marginBottom: tokens.space[3],
  },
  bullet: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[1],
  },
  link: {
    fontSize: tokens.type.body.size,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.medium) as '500',
    marginBottom: tokens.space[3],
  },
  error: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[2],
  },
  spacer: {
    flex: 1,
    minHeight: tokens.space[6],
  },
  acceptBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  acceptText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
  declineBtn: {
    marginTop: tokens.space[2],
    paddingVertical: tokens.space[3],
    alignItems: 'center',
  },
  declineText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    fontWeight: String(tokens.weight.medium) as '500',
  },
});
