// [ORCHESTRATOR_EXCEPTION] surgical route fix — founder live debug
/**
 * Recovery screen for any unmatched route. Replaces Expo Router's default
 * "Unmatched Route" screen. Single button clears tokens via onAppLogout()
 * and routes to /(auth)/phone so the user is never permanently stuck.
 *
 * Self-contained — does not import any worker/supervisor components so it
 * works even if those error.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { onAppLogout } from '../lib/identity-lifecycle';

/** @derives(master-plan §G) — worker surface */
export default function NotFoundScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleClear = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAppLogout();
    } catch {
      // Best-effort — even if logout errors we still navigate to auth.
    }
    router.replace('/(auth)/phone');
  }, [busy, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.header}>Page not found</Text>
        <Text style={styles.body}>
          Your session may be invalid or the screen was removed. Tap below to sign out and start
          fresh.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear session and sign in"
          onPress={handleClear}
          disabled={busy}
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{busy ? 'Clearing…' : 'Clear session & sign in'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 16,
  },
  header: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: tokens.color.ink.secondary,
    marginBottom: 16,
  },
  button: {
    backgroundColor: tokens.color.brand.accent,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: tokens.color.brand.accent2,
    opacity: 0.92,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
