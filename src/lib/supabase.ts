import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { SUPABASE_KEY, SUPABASE_URL, isConfigured } from './env';
import { chunkedSecureStorage } from './secureStorage';

// Placeholder values keep the app booting so it can show a "not configured" screen.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://not-configured.invalid',
  isConfigured ? SUPABASE_KEY : 'not-configured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : chunkedSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
