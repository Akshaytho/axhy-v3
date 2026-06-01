// [ORCHESTRATOR_EXCEPTION] DEV-only debug FAB — captures screen, POSTs to local Claude receiver.

/**
 * SendToClaudeButton — floating debug FAB (DEV ONLY).
 *
 * Renders a small terracotta camera FAB at the bottom-right of the worker
 * shell. On tap it captures the current screen via react-native-view-shot's
 * captureScreen(), reads the resulting PNG as base64, and POSTs it to a
 * receiver running on the founder's Mac at http://192.168.1.6:9999/screenshot.
 *
 * Hard-gated by __DEV__: renders null in production builds. Intended for live
 * QA on a real iPhone where the founder wants every tap delivered to Claude
 * for review.
 *
 * NOTE: This component is intentionally self-contained and dependency-light so
 * removing the feature later is a single-file delete + un-mount.
 */

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { File } from 'expo-file-system';
import { captureScreen } from 'react-native-view-shot';
import { tokens } from '@axhy/ui-tokens';

/** Mac's LAN IP — confirmed via `ipconfig getifaddr en0` 2026-06-01. */
const RECEIVER_URL = 'http://192.168.1.6:9999/screenshot';

/** Derive a short, filename-safe slug from the current route. */
function routeSlug(pathname: string | null): string {
  if (!pathname || pathname === '/') return 'root';
  return (
    pathname
      .replace(/^\/+/, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'root'
  );
}

/** ISO-ish timestamp safe for filenames: 2026-06-01T12-34-56-789. */
function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** @derives(master-plan §G) — dev-only worker QA helper */
export function SendToClaudeButton(): React.ReactElement | null {
  if (!__DEV__) return null;

  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureScreen({ format: 'png', quality: 1, result: 'tmpfile' });
      const file = new File(uri);
      const base64 = await file.base64();
      const filename = `${routeSlug(pathname)}-${fileTimestamp()}.png`;

      const res = await fetch(RECEIVER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename, data: base64 }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${text}`.trim());
      }

      Alert.alert('Sent to Claude', filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Failed to send', msg);
    } finally {
      setBusy(false);
    }
  }, [busy, pathname]);

  return (
    <View pointerEvents="box-none" style={styles.host}>
      <Pressable
        accessibilityLabel="Send screenshot to Claude"
        accessibilityHint="DEV only — captures the current screen and uploads it to the local receiver"
        onPress={onPress}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed, busy && styles.fabBusy]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Feather name="camera" size={22} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    // Slightly translucent so it never fully blocks the UI underneath.
    opacity: 0.85,
  },
  fabPressed: {
    opacity: 1,
    transform: [{ scale: 0.96 }],
  },
  fabBusy: {
    opacity: 0.7,
  },
});
