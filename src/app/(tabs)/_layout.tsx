import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, type ColorValue } from 'react-native';
import type { IconName } from '@/components/ui';
import { font, useColors } from '@/theme';

const icon = (on: IconName, off: IconName) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? on : off} color={color as string} size={24} />;
  };

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textFaint,
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="stuff" options={{ title: 'Your stuff', tabBarIcon: icon('wallet', 'wallet-outline') }} />
      <Tabs.Screen name="money" options={{ title: 'Activity', tabBarIcon: icon('time', 'time-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings', 'settings-outline') }} />
    </Tabs>
  );
}
