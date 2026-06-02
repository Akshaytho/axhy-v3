/**
 * Canon worker capture surface for before/after photos.
 *
 * Native uses expo-camera. Web preserves the exact navigation and capture
 * rhythm with simulated photos so QA can still walk the screen honestly.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { Fragment, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CameraView as ExpoCameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
} from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) */
export type CapturedPhoto = Pick<CameraCapturedPicture, 'uri' | 'width' | 'height'>;

type Props = {
  slotNumber: number;
  totalSlots: number;
  photoCount: number;
  minPhotos: number;
  mode: 'before' | 'after';
  siteName: string;
  stepTitle: string;
  onBack: () => void;
  onReviewPress?: () => void;
  onCapture: (photo: CapturedPhoto) => void | Promise<void>;
};

const SHUTTER_SIZE = 78;
const GPS_OK = '#4a7c59';

function getModeAccent(mode: Props['mode']): string {
  return mode === 'after' ? GPS_OK : tokens.color.brand.accent;
}

/** @derives(master-plan §G) */
export function CameraView({
  slotNumber,
  totalSlots,
  photoCount,
  minPhotos,
  mode,
  siteName,
  stepTitle,
  onBack,
  onReviewPress,
  onCapture,
}: Props): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const accent = getModeAccent(mode);
  const hasMinimum = photoCount >= minPhotos;
  const reviewLabel = mode === 'after' ? 'Review & submit' : 'Review photos';

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (permission && !permission.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  async function handleShutter(): Promise<void> {
    if (hasMinimum) return;

    if (Platform.OS === 'web') {
      await onCapture({
        uri: `https://placehold.co/600x800/3D2B1F/F8F4EB.jpg?text=${mode}+${slotNumber}`,
        width: 600,
        height: 800,
      });
      return;
    }

    if (!cameraRef.current || !ready || capturing) return;
    setCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        exif: false,
      });
      if (result?.uri) {
        await onCapture({
          uri: result.uri,
          width: result.width,
          height: result.height,
        });
      } else {
        console.warn('[CameraView] takePictureAsync returned no uri', { result });
      }
    } finally {
      setCapturing(false);
    }
  }

  function renderCameraBody(): React.JSX.Element {
    if (Platform.OS === 'web') {
      return (
        <View style={s.webBackdrop}>
          <View style={s.webGlow} />
          <Text style={s.webHint}>Web preview uses simulated captures for layout QA.</Text>
        </View>
      );
    }

    if (!permission) {
      return (
        <View style={s.permissionPending}>
          <Text style={s.permissionText}>Checking camera permission…</Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={s.permissionPending}>
          <Text style={s.permissionText}>Camera permission is required for photo capture.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Grant camera access"
            onPress={() => void requestPermission()}
            style={s.overlayButton}
          >
            <Text style={s.overlayButtonText}>Grant camera access</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ExpoCameraView
        ref={cameraRef}
        style={s.cameraView}
        facing="back"
        onCameraReady={() => setReady(true)}
      />
    );
  }

  return (
    <View style={s.root}>
      <View style={s.viewfinder}>
        {renderCameraBody()}

        {[33.3, 66.6].map((position) => (
          <Fragment key={`grid-${position}`}>
            <View key={`h-${position}`} style={[s.gridHorizontal, { top: `${position}%` }]} />
            <View key={`v-${position}`} style={[s.gridVertical, { left: `${position}%` }]} />
          </Fragment>
        ))}

        <View style={s.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={s.iconButton}
          >
            <Feather name="x" size={16} color={tokens.color.surface.card} />
          </Pressable>
          <Text style={s.photoCounter}>
            PHOTO <Text style={{ color: accent }}>{slotNumber}</Text> OF {totalSlots}
          </Text>
          <View style={s.flashWrap}>
            <Feather name="zap-off" size={18} color="rgba(253,250,243,0.72)" />
            <Text style={s.flashLabel}>OFF</Text>
          </View>
        </View>

        <View style={s.siteStrip}>
          <Text style={[s.siteEyebrow, { color: accent }]}>SITE</Text>
          <Text numberOfLines={1} style={s.siteName}>
            {siteName}
          </Text>
        </View>

        <View style={[s.modePill, { backgroundColor: accent }]}>
          <Text style={s.modePillText}>{mode === 'after' ? 'AFTER' : 'BEFORE'}</Text>
        </View>

        <View style={s.reticle}>
          {[
            { top: 0, left: 0 },
            { top: 0, right: 0 },
            { bottom: 0, left: 0 },
            { bottom: 0, right: 0 },
          ].map((pos, index) => (
            <View
              key={index}
              style={[
                s.bracket,
                pos,
                {
                  borderTopWidth: pos.top === 0 ? 3 : 0,
                  borderLeftWidth: pos.left === 0 ? 3 : 0,
                  borderBottomWidth: pos.bottom === 0 ? 3 : 0,
                  borderRightWidth: pos.right === 0 ? 3 : 0,
                  borderColor: accent,
                },
              ]}
            />
          ))}
        </View>

        <View style={s.gpsPill}>
          <View style={s.gpsDot} />
          <Text style={s.gpsText}>GPS LOCKED</Text>
        </View>
      </View>

      <View style={s.controls}>
        <Text style={s.stepTitle}>{stepTitle}</Text>

        <View style={s.dotRow}>
          {Array.from({ length: minPhotos }).map((_, index) => (
            <View
              key={index}
              style={[
                s.dot,
                index < photoCount && { backgroundColor: accent, borderColor: accent },
              ]}
            />
          ))}
        </View>

        <Text style={s.minimumLabel}>
          <Text style={{ color: accent }}>{photoCount}</Text>/{minPhotos} MINIMUM
        </Text>

        <View style={s.shutterRow}>
          <View style={s.galleryThumb}>
            <Text style={[s.galleryThumbText, { color: photoCount > 0 ? accent : '#a09182' }]}>
              {photoCount > 0 ? photoCount : ''}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasMinimum ? reviewLabel : 'Take photo'}
            onPress={hasMinimum ? onReviewPress : () => void handleShutter()}
            disabled={capturing || (!ready && Platform.OS !== 'web' && !hasMinimum)}
            style={[
              s.shutter,
              { borderColor: accent },
              (capturing || (!ready && Platform.OS !== 'web' && !hasMinimum)) && s.shutterDisabled,
            ]}
          >
            <View style={[s.shutterAura, { borderColor: `${accent}44` }]} />
            <View style={[s.shutterInner, { backgroundColor: accent }]} />
          </Pressable>

          <View style={s.flipStub}>
            <Feather name="refresh-ccw" size={20} color={tokens.color.ink.tertiary} />
          </View>
        </View>

        {hasMinimum ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reviewLabel}
            onPress={onReviewPress}
            style={({ pressed }) => [s.reviewButton, pressed && { opacity: 0.92 }]}
          >
            <Text style={s.reviewButtonText}>{reviewLabel}</Text>
          </Pressable>
        ) : (
          <Text style={s.captureHint}>
            {Platform.OS === 'web'
              ? 'Simulate captures here, then continue to review.'
              : 'Capture at least 3 photos before moving on.'}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1612',
  },
  viewfinder: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#2a221a',
  },
  cameraView: {
    flex: 1,
  },
  webBackdrop: {
    flex: 1,
    backgroundColor: '#2a221a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(253,250,243,0.06)',
  },
  webHint: {
    color: 'rgba(253,250,243,0.9)',
    fontSize: tokens.type.body.size,
    textAlign: 'center',
    paddingHorizontal: tokens.space[5],
    lineHeight: tokens.type.body.size * 1.45,
  },
  gridHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(253,250,243,0.07)',
  },
  gridVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(253,250,243,0.07)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(253,250,243,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCounter: {
    flex: 1,
    textAlign: 'center',
    color: tokens.color.surface.card,
    fontFamily: tokens.font.mono,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  flashWrap: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  flashLabel: {
    color: 'rgba(253,250,243,0.72)',
    fontFamily: tokens.font.mono,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  siteStrip: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(253,250,243,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  siteEyebrow: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  siteName: {
    flexShrink: 1,
    color: tokens.color.surface.card,
    fontSize: 13,
  },
  modePill: {
    position: 'absolute',
    top: 110,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
  },
  modePillText: {
    color: tokens.color.surface.card,
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: String(tokens.weight.bold) as '700',
    letterSpacing: 1.1,
  },
  reticle: {
    position: 'absolute',
    top: '20%',
    left: '15%',
    right: '15%',
    bottom: '22%',
  },
  bracket: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderStyle: 'solid',
  },
  gpsPill: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(74,124,89,0.18)',
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GPS_OK,
  },
  gpsText: {
    color: GPS_OK,
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  controls: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: tokens.color.surface.paper,
  },
  stepTitle: {
    textAlign: 'center',
    color: tokens.color.ink.tertiary,
    fontSize: 12,
    marginBottom: 10,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.color.surface.paper3,
    borderWidth: 1,
    borderColor: tokens.color.surface.paper3,
  },
  minimumLabel: {
    textAlign: 'center',
    color: tokens.color.ink.tertiary,
    fontFamily: tokens.font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginBottom: 14,
  },
  galleryThumb: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: tokens.color.surface.paper3,
    borderWidth: 1,
    borderColor: 'rgba(40,30,20,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryThumbText: {
    fontSize: 18,
    fontWeight: String(tokens.weight.bold) as '700',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterAura: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: (SHUTTER_SIZE + 16) / 2,
    borderWidth: 1,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  flipStub: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: tokens.color.ink.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    color: tokens.color.surface.card,
    fontSize: 16,
    fontWeight: String(tokens.weight.bold) as '700',
  },
  captureHint: {
    textAlign: 'center',
    color: tokens.color.ink.tertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  permissionPending: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
    gap: tokens.space[3],
    backgroundColor: '#201913',
  },
  permissionText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.surface.card,
    textAlign: 'center',
  },
  overlayButton: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[5],
    minHeight: tokens.tap.minMobile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayButtonText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
});
