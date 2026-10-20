import type { ConfigContext, ExpoConfig } from 'expo/config';

// Sign in with Apple needs a paid Apple Developer account. Keep it off until then.
const appleSignIn = process.env.EXPO_PUBLIC_ENABLE_APPLE_SIGNIN === 'true';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'PerkScan',
  slug: 'perkscan',
  scheme: 'perkscan',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.perkscan.app',
    supportsTablet: false,
    usesAppleSignIn: appleSignIn,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: 'com.perkscan.app',
    adaptiveIcon: {
      backgroundColor: '#0B1F17',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    ['expo-notifications', { color: '#16A34A' }],
    ...(appleSignIn ? ['expo-apple-authentication'] : []),
  ],
  experiments: { typedRoutes: true },
  extra: { appleSignIn },
});
