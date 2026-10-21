import { Stack } from 'expo-router';
import { OnboardingProvider } from '@/lib/onboarding';
import { useColors } from '@/theme';

export default function OnboardingLayout() {
  const c = useColors();
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="where" />
        <Stack.Screen name="pick-cards" />
        <Stack.Screen name="details" />
        <Stack.Screen name="finish" />
      </Stack>
    </OnboardingProvider>
  );
}
