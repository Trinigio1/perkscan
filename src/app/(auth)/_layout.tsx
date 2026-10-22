import { Stack } from 'expo-router';
import { useColors } from '@/theme';

// Always start at the email screen: the code screen only makes sense after an email was entered.
export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  const c = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify" />
    </Stack>
  );
}
