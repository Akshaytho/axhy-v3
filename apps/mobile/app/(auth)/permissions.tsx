/**
 * Permissions screen — worker auth flow step 3 of 4.
 * (Splash/index → phone → otp → permissions → consent → (worker) home)
 *
 * Slice 1 + sub-slice 2b-1 scope: Camera AND Location upfront. Founder
 * lock 2026-05-22 — the capture flow lands in 2b-2/2b-3 and needs GPS at
 * arrival verification, so we ask once at signup rather than at first
 * capture-tap.
 * Notifications permission is requested via OneSignal in PushPermissionPrompt
 * (existing supervisor pattern; worker flow inherits it).
 *
 * Per MVP_V2_ALIGNED_PLAN.md §13 M22: single-page only (no multi-page carousel).
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2 + §13 M22)
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
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
import * as Location from 'expo-location';
import { tokens } from '@axhy/ui-tokens';

type GrantState = 'unknown' | 'requesting' | 'granted' | 'denied';

/** Permission row icon-circle sizing — 44pt aligns with the V2 design + iOS tap target. */
const ICON_CIRCLE_SIZE = 40;
const ICON_CIRCLE_RADIUS = ICON_CIRCLE_SIZE / 2;

function statusLabel(state: GrantState): string {
  if (state === 'granted') return 'Granted';
  if (state === 'denied') return 'Denied — open Settings';
  return 'Required';
}

/** @derives(master-plan §G) */
export default function PermissionsScreen() {
  const [camera, setCamera] = useState<GrantState>('unknown');
  const [location, setLocation] = useState<GrantState>('unknown');

  useEffect(() => {
    (async () => {
      try {
        const cam = await Camera.getCameraPermissionsAsync();
        if (cam.status === 'granted') setCamera('granted');
        else if (cam.status === 'denied') setCamera('denied');

        const loc = await Location.getForegroundPermissionsAsync();
        if (loc.status === 'granted') setLocation('granted');
        else if (loc.status === 'denied') setLocation('denied');
      } catch (err) {
        if (__DEV__) {
          console.warn('[permissions] initial lookup threw', err);
        }
      }
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

  async function requestLocation() {
    if (Platform.OS === 'web') {
      setLocation('granted');
      return;
    }
    setLocation('requesting');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocation(status === 'granted' ? 'granted' : 'denied');
    } catch (err) {
      if (__DEV__) {
        console.warn('[permissions] location request threw', err);
      }
      setLocation('denied');
    }
  }

  function handleContinue() {
    router.push('/(auth)/consent');
  }

  const canContinue = camera === 'granted' && location === 'granted';
  const anyDenied = camera === 'denied' || location === 'denied';

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.inner}>
        <Text style={s.heading}>Allow access</Text>
        <Text style={s.sub}>
          Camera is for before-and-after photos. Location confirms you're at the right site when you
          start work.
        </Text>

        <View style={s.row}>
          <View style={s.iconWrap}>
            <Feather name="camera" size={20} color={tokens.color.brand.accent} />
          </View>
          <View style={s.info}>
            <Text style={s.label}>Camera</Text>
            <Text style={s.required}>{statusLabel(camera)}</Text>
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

        <View style={s.rowSpacer} />

        <View style={s.row}>
          <View style={s.iconWrap}>
            <Feather name="map-pin" size={20} color={tokens.color.brand.accent} />
          </View>
          <View style={s.info}>
            <Text style={s.label}>Location</Text>
            <Text style={s.required}>{statusLabel(location)}</Text>
          </View>
          {location === 'requesting' ? (
            <ActivityIndicator size="small" color={tokens.color.brand.accent} />
          ) : location === 'granted' ? (
            <Feather name="check" size={20} color={tokens.color.semantic.ok} />
          ) : (
            <TouchableOpacity style={s.allowBtn} onPress={requestLocation} activeOpacity={0.8}>
              <Text style={s.allowText}>{location === 'denied' ? 'Retry' : 'Allow'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {anyDenied && (
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
  rowSpacer: {
    height: tokens.space[3],
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
