/**
 * Wraps expo-camera for the before/after photo capture steps.
 *
 * On native: renders live camera preview + shutter button. Calls onCapture
 * with a CameraCapturedPicture-shaped object containing the file:// URI.
 *
 * On web (Playwright runs): renders a placeholder card with a Simulate-capture
 * button that returns a static fixture URI. Real camera capture is verified
 * on a real device only — Playwright proves the chrome + grid + retake UX.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CameraView as ExpoCameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
} from 'expo-camera';
import { tokens } from '@axhy/ui-tokens';

/** @derives(master-plan §G) */
export type CapturedPhoto = Pick<CameraCapturedPicture, 'uri' | 'width' | 'height'>;

type Props = {
  /** Slot index inside the current phase (1-based). Displayed in shutter chrome. */
  slotNumber: number;
  totalSlots: number;
  /** Called with the captured photo's URI + dimensions. */
  onCapture: (photo: CapturedPhoto) => void;
};

const SHUTTER_SIZE = 72;

/** @derives(master-plan §G) */
export function CameraView({ slotNumber, totalSlots, onCapture }: Props): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<ExpoCameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (permission && !permission.granted) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  if (Platform.OS === 'web') {
    return (
      <View style={s.webStub}>
        <Text style={s.webStubTitle}>Camera unavailable on web</Text>
        <Text style={s.webStubBody}>
          Use a real device to capture photos. Tap Simulate to seed a placeholder for the review
          screen.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            onCapture({
              uri: `https://placehold.co/600x800/3D2B1F/F8F4EB.jpg?text=Photo+${slotNumber}`,
              width: 600,
              height: 800,
            })
          }
          style={s.simulateBtn}
        >
          <Text style={s.simulateBtnText}>Simulate capture</Text>
        </Pressable>
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
          onPress={() => void requestPermission()}
          style={s.simulateBtn}
        >
          <Text style={s.simulateBtnText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  async function handleShutter(): Promise<void> {
    if (!cameraRef.current || !ready || capturing) return;
    setCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        exif: false,
      });
      if (result?.uri) {
        onCapture({
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

  return (
    <View style={s.cameraRoot}>
      <ExpoCameraView
        ref={cameraRef}
        style={s.cameraView}
        facing="back"
        onCameraReady={() => setReady(true)}
      />
      <View style={s.shutterRow}>
        <Text style={s.slotBadge}>
          Photo {slotNumber} of {totalSlots}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          onPress={handleShutter}
          disabled={!ready || capturing}
          style={[s.shutter, (!ready || capturing) && s.shutterDisabled]}
        >
          <View style={s.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cameraRoot: {
    flex: 1,
    backgroundColor: tokens.color.ink.primary,
  },
  cameraView: {
    flex: 1,
  },
  shutterRow: {
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[4],
    alignItems: 'center',
    gap: tokens.space[3],
  },
  slotBadge: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.surface.paper,
    fontWeight: String(tokens.weight.semibold) as '600',
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
  shutter: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 4,
    borderColor: tokens.color.surface.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
    backgroundColor: tokens.color.surface.paper,
  },
  permissionPending: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
    gap: tokens.space[3],
  },
  permissionText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
  webStub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
    gap: tokens.space[3],
    backgroundColor: tokens.color.surface.paper2,
    margin: tokens.space[4],
    borderRadius: tokens.radius.r3,
  },
  webStubTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  webStubBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
    lineHeight: tokens.type.body.size * 1.45,
  },
  simulateBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[5],
    minHeight: tokens.tap.minMobile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simulateBtnText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
});
