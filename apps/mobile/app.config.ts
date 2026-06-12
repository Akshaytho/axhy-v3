/**
 * Expo config — TypeScript form so the OneSignal plugin can read
 * `EXPO_PUBLIC_ONESIGNAL_APP_ID` at build time. Migrated from `app.json`
 * during F-006a (v6 LOCKED in plan file
 * `/Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md`).
 *
 * Static JSON cannot reference env vars; OneSignal's Expo plugin needs
 * dynamic env-var resolution at config-resolution time.
 *
 * EAS Build profiles (dev / staging / prod) each set their own
 * `EXPO_PUBLIC_ONESIGNAL_APP_ID` env var. Local development without
 * the env var set: identity-lifecycle's `shouldCallOneSignal()` returns
 * false; OneSignal calls no-op cleanly; auth flow still succeeds.
 *
 * @derives(F-006a scope round-2 v6 Pick 6)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */
const oneSignalAppId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID ?? '';

// Dev-client builds only (APP_VARIANT=development — set by eas.json's
// development profile and by local `expo run:android` QA builds). Allows the
// emulator dev-client to reach http:// hosts (local backend / 10.0.2.2);
// release and preview APKs never set the variant, so they stay cleartext-locked.
const isDevClientBuild = process.env.APP_VARIANT === 'development';

const config = {
  name: 'Axhy',
  slug: 'axhy',
  scheme: 'axhy',
  version: '0.1.2',
  // ADR-0028 OTA: ties update compatibility to the app version — an OTA
  // bundle built for 0.1.1 never applies to a different native runtime (the
  // classic OTA crash vector). Any native change (new library, permission)
  // MUST bump `version` so older installs keep their embedded bundle until a
  // real APK reaches them. `updates.url` + the EAS projectId are injected by
  // `eas update:configure` (needs EAS login — founder step, see ADR-0028).
  runtimeVersion: { policy: 'appVersion' as const },
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#4F46E5',
  },
  platforms: ['ios', 'android', 'web'],
  web: {
    bundler: 'metro',
  },
  ios: {
    bundleIdentifier: 'app.axhy.mobile',
    supportsTablet: false,
    buildNumber: '2',
  },
  android: {
    package: 'app.axhy.mobile',
    versionCode: 3,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
  },
  plugins: [
    'expo-localization',
    'expo-router',
    'expo-secure-store',
    // Cleartext http for DEV-CLIENT builds only (emulator QA against local
    // backends — the Jun-6 dev-client blocked app-level http while the
    // emulator browser could reach it; see handoff 2026-06-12 incomplete #2).
    [
      'expo-build-properties',
      {
        android: { usesCleartextTraffic: isDevClientBuild },
      },
    ] as [string, { android: { usesCleartextTraffic: boolean } }],
    // expo-audio plugin — registers microphone permission strings + native
    // audio session config. Required for the voice-capture mic in Chat.
    [
      'expo-audio',
      {
        microphonePermission:
          'Axhy uses the microphone to capture supervisor voice notes for chat.',
      },
    ] as [string, { microphonePermission: string }],
    // OneSignal plugin — present only when an App ID is configured. Without
    // an App ID, omit the plugin entry entirely so EAS Build doesn't try
    // to wire native push capabilities against an empty string.
    ...(oneSignalAppId
      ? [
          [
            'onesignal-expo-plugin',
            {
              mode: 'development',
            },
          ] as [string, { mode: string }],
        ]
      : []),
  ],
  extra: {
    oneSignalAppId,
  },
};

export default config;

export type ExpoAppConfig = typeof config;
