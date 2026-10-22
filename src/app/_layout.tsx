import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading, Screen, T } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DataProvider, useData } from '@/lib/data';
import { isConfigured } from '@/lib/env';
import { onReminderTap } from '@/lib/notifications';
import { useSharedText } from '@/lib/shareIntent';
import { ToastProvider } from '@/lib/toast';
import { font, useColors } from '@/theme';

function NotConfigured() {
  return (
    <Screen title="Almost there">
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
  const ready = !!session && !!data.profile?.onboarded_at;
  // Android "Share → PerkScan": open the shared text, ready to add.
  const openShared = useCallback((text: string) => router.push({ pathname: '/add-text', params: { text } }), []);
  useSharedText(ready, openShared);
  // Tapping the weekly digest opens what it's about.
  useEffect(() => (ready ? onReminderTap((route) => router.push(route as '/at-risk')) : undefined), [ready]);

  if (authLoading || (session && dataLoading && !data.profile)) return <Loading />;

  const signedIn = !!session;
  const onboarded = !!data.profile?.onboarded_at;
  const header = {
    headerShown: true,
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerShadowVisible: false,
    headerTitleStyle: { fontFamily: font.bold },
    headerBackButtonDisplayMode: 'minimal' as const,
  };
  const modal = { ...header, presentation: 'modal' as const, headerStyle: { backgroundColor: c.bg } };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="auth/callback" />
      <Stack.Protected guard={!signedIn} redirectTo={onboarded ? '/' : '/welcome'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded} redirectTo={signedIn ? '/' : '/sign-in'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && onboarded} redirectTo={signedIn ? '/welcome' : '/sign-in'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="credit/[id]" options={{ ...modal, title: '' }} />
        <Stack.Screen name="card/[id]/index" options={{ ...header, title: '' }} />
        <Stack.Screen name="card/[id]/worth-it" options={{ ...modal, title: 'Worth the fee?' }} />
        <Stack.Screen name="add-card" options={{ ...modal, title: 'Add cards' }} />
        <Stack.Screen name="offer/[id]" options={{ ...modal, title: '' }} />
        <Stack.Screen name="inbox" options={{ ...header, title: 'Inbox' }} />
        <Stack.Screen name="connect-gmail" options={{ ...header, title: '' }} />
        <Stack.Screen name="country" options={{ ...modal, title: 'Country & currency' }} />
        <Stack.Screen name="connect-texts" options={{ ...header, title: '' }} />
        <Stack.Screen name="add-text" options={{ ...modal, title: 'Add a text' }} />
        <Stack.Screen name="review" options={{ ...header, title: 'Reading accuracy' }} />
        <Stack.Screen name="report" options={{ ...modal, title: 'Something’s wrong' }} />
        <Stack.Screen name="checkout" options={{ ...modal, title: 'Before you pay' }} />
        <Stack.Screen name="student" options={{ ...header, title: 'Student offers' }} />
        <Stack.Screen name="school" options={{ ...modal, title: 'Your school' }} />
        <Stack.Screen name="my-perk" options={{ ...modal, title: 'A perk from your school' }} />
        <Stack.Screen name="recap" options={{ ...header, title: 'Monthly recap' }} />
        <Stack.Screen name="at-risk" options={{ ...header, title: 'At risk this week' }} />
        <Stack.Screen name="perks" options={{ ...header, title: 'Your card perks' }} />
        <Stack.Screen name="hidden-money" options={{ ...header, title: 'Hidden money' }} />
        <Stack.Screen name="add" options={{ ...modal, title: 'Add' }} />
        <Stack.Screen name="add-item" options={{ ...modal, title: '' }} />
        <Stack.Screen name="share" options={{ ...modal, title: 'Share' }} />
        <Stack.Screen name="data" options={{ ...header, title: 'Your data' }} />
        <Stack.Screen name="sources" options={{ ...header, title: 'Connected sources' }} />
        <Stack.Screen name="legal" options={{ ...header, title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  // If fonts fail to load we still render with the system font rather than blocking the app.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <ToastProvider>
          {isConfigured ? (
            <AuthProvider>
              <DataProvider>
                <RootNavigator />
              </DataProvider>
            </AuthProvider>
          ) : (
            <NotConfigured />
          )}
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
