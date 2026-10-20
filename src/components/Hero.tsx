import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadow, space, useColors } from '@/theme';

/** The dark-green gradient panel used for headline numbers and the sign-in brand block. */
export function Hero({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <LinearGradient
      colors={c.hero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius.xl, padding: space.xl, gap: space.xs, overflow: 'hidden' }, shadow(c, 2), style]}
    >
      {/* Decorative glow */}
      <View pointerEvents="none" style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(124,240,174,0.16)' }} />
      <View pointerEvents="none" style={{ position: 'absolute', right: 40, bottom: -90, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' }} />
      {children}
    </LinearGradient>
  );
}

/** Small "money" mark used as the app logo in headers. */
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <LinearGradient
      colors={['#7CF0AE', '#13A35E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, borderWidth: size * 0.09, borderColor: '#06261A' }} />
      <View style={{ position: 'absolute', width: size * 0.09, height: size * 0.22, backgroundColor: '#06261A', borderRadius: 2, right: size * 0.24, bottom: size * 0.2, transform: [{ rotate: '-45deg' }] }} />
    </LinearGradient>
  );
}
