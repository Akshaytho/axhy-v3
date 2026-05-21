/**
 * Permissions screen — worker auth flow step 3 of 4.
 * (Splash/index → phone → otp → permissions → consent → (worker) home)
 *
 * Slice 1 scope: Camera permission only (capture flow needs it).
 * Location permission is requested at first checkin in slice 2 (expo-location
 * is not yet a dependency).
 * Notifications permission is requested via OneSignal in PushPermissionPrompt
 * (existing supervisor pattern; worker flow inherits it).
 *
 * Per MVP_V2_ALIGNED_PLAN.md §13 M22: single-page only (no multi-page carousel).
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2 + §13 M22)
 * @derives(F-006b — worker auth flow)
 */

import { useState, useEffect } from 'react';
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Camera } from 'expo-camera';
import { tokens } from '@axhy/ui-tokens';

type GrantState = 'unknown' | 'requesting' | 'granted' | 'denied';

/** Permission row icon-circle sizing — 44pt aligns with the V2 design + iOS tap target. */
const ICON_CIRCLE_SIZE = 40;
const ICON_CIRCLE_RADIUS = ICON_CIRCLE_SIZE / 2;

/** @derives(master-plan §G) */
export default function PermissionsScreen() {
  const [camera, setCamera] = useState<GrantState>('unknown');

  useEffect(() => {
    (async () => {
      const { status } = await Camera.getCameraPermissionsAsync();
      if (status === 'granted') setCamera('granted');
      else if (status === 'denied') setCamera('denied');
    })();
  }, []);

  async function requestCamera() {
    if (Platform.OS === 'web') {
      setCamera('granted');
      return;
    }
    setCamera('requesting');
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setCamera(status === 'granted' ? 'granted' : 'denied');
    } catch (err) {
      if (__DEV__) {
        console.warn('[permissions] camera request threw', err);
      }
      setCamera('denied');
    }
  }

  function handleContinue() {
    router.push('/(auth)/consent');
  }

  const canContinue = camera === 'granted';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.inner}>
        <Text style={s.heading}>Allow camera</Text>
        <Text style={s.sub}>
          You need camera access to take before-and-after photos for every visit.
        </Text>

        <View style={s.row}>
          <View style={s.iconWrap}>
            <Feather name="camera" size={20} color={tokens.color.brand.accent} />
          </View>
          <View style={s.info}>
            <Text style={s.label}>Camera</Text>
            <Text style={s.required}>
              {camera === 'granted'
                ? 'Granted'
                : camera === 'denied'
                  ? 'Denied — open Settings'
                  : 'Required'}
            </Text>
          </View>
          {camera === 'requesting' ? (
            <ActivityIndicator size="small" color={tokens.color.brand.accent} />
          ) : camera === 'granted' ? (
            <Feather name="check" size={20} color={tokens.color.semantic.ok} />
          ) : (
            <TouchableOpacity style={s.allowBtn} onPress={requestCamera} activeOpacity={0.8}>
              <Text style={s.allowText}>{camera === 'denied' ? 'Retry' : 'Allow'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {camera === 'denied' && (
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => Linking.openSettings().catch(() => {})} // audit-ok: Settings open failure is non-blocking
            activeOpacity={0.8}
          >
            <Text style={s.settingsText}>Open Settings</Text>
          </TouchableOpacity>
        )}

        <View style={s.spacer} />

        <TouchableOpacity
          style={[s.continueBtn, !canContinue && s.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={s.continueText}>Continue</Text>
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
    color: tokens.color.ink.tertiary,
    marginBottom: tokens.space[6],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
  },
  iconWrap: {
    width: ICON_CIRCLE_SIZE,
    height: ICON_CIRCLE_SIZE,
    borderRadius: ICON_CIRCLE_RADIUS,
    backgroundColor: tokens.color.brand.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tokens.space[3],
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  required: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  allowBtn: {
    paddingVertical: tokens.space[2],
    paddingHorizontal: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
  },
  allowText: {
    fontSize: tokens.type.bodySm.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
  settingsBtn: {
    marginTop: tokens.space[2],
    alignSelf: 'flex-start',
    paddingVertical: tokens.space[1],
    paddingHorizontal: tokens.space[2],
  },
  settingsText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  spacer: {
    flex: 1,
  },
  continueBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  continueBtnDisabled: {
    opacity: 0.45,
  },
  continueText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
});
