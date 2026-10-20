import Constants from 'expo-constants';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const APPLE_SIGN_IN_ENABLED = Constants.expoConfig?.extra?.appleSignIn === true;

export const isConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_KEY.length > 0;
