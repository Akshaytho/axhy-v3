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

const config = {
  name: 'Axhy',
  slug: 'axhy',
  scheme: 'axhy',
  version: '0.1.1',
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
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4F46E5',
    },
  },
  plugins: [
    'expo-localization',
    'expo-router',
    'expo-secure-store',
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
