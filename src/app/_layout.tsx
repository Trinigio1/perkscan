import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading, Screen, T } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DataProvider, useData } from '@/lib/data';
import { isConfigured } from '@/lib/env';
import { useColors } from '@/theme';

function NotConfigured() {
  return (
    <Screen>
      <T variant="title">Almost there</T>
      <T muted>
        PerkScan can’t find its Supabase settings. Copy .env.example to .env, fill in EXPO_PUBLIC_SUPABASE_URL and
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart with `npx expo start --clear`.
      </T>
    </Screen>
  );
}

function RootNavigator() {
  const { session, loading: authLoading } = useAuth();
  const { data, loading: dataLoading } = useData();
  const c = useColors();

  if (authLoading || (session && dataLoading && !data.profile)) return <Loading />;

  const signedIn = !!session;
  const onboarded = !!data.profile?.onboarded_at;
  const modal = { presentation: 'modal' as const, headerShown: true, headerStyle: { backgroundColor: c.surface }, headerTintColor: c.text };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="auth/callback" />
      <Stack.Protected guard={!signedIn} redirectTo={onboarded ? '/' : '/pick-cards'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded} redirectTo={signedIn ? '/' : '/sign-in'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded} redirectTo={signedIn ? '/pick-cards' : '/sign-in'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="credit/[id]" options={{ ...modal, title: 'Credit' }} />
        <Stack.Screen name="card/[id]/index" options={{ headerShown: true, title: 'Card', headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false }} />
        <Stack.Screen name="card/[id]/worth-it" options={{ ...modal, title: 'Worth the fee?' }} />
        <Stack.Screen name="add-card" options={{ ...modal, title: 'Add cards' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        {isConfigured ? (
          <AuthProvider>
            <DataProvider>
              <RootNavigator />
            </DataProvider>
          </AuthProvider>
        ) : (
          <NotConfigured />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
