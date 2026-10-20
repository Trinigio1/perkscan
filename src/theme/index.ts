import { Platform, useColorScheme, type ViewStyle } from 'react-native';

const light = {
  bg: '#F4F6F3',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1EC',
  surfaceSunken: '#E6EBE5',
  border: '#E2E7E0',
  text: '#0B1410',
  textMuted: '#56635C',
  textFaint: '#8C978F',
  accent: '#0F9F59',       // money / recovered
  accentStrong: '#0B7D46',
  accentSoft: '#DDF6E8',
  accentText: '#FFFFFF',
  danger: '#D9480F',       // left on the table
  dangerSoft: '#FFE8DC',
  warn: '#C27803',         // at risk
  warnSoft: '#FFF1D1',
  hero: ['#0B3D2A', '#0E5A3B', '#13804F'] as readonly [string, string, string],
  heroText: '#F2FFF7',
  heroMuted: '#A9D8BF',
  heroTrack: 'rgba(255,255,255,0.18)',
  heroFill: '#7CF0AE',
  shadow: '#0B1410',
};

const dark: typeof light = {
  bg: '#070B09',
  surface: '#111814',
  surfaceAlt: '#18211C',
  surfaceSunken: '#0C120F',
  border: '#212C26',
  text: '#EEF4F0',
  textMuted: '#9AA8A0',
  textFaint: '#66736B',
  accent: '#3EDC8A',
  accentStrong: '#2FBF75',
  accentSoft: '#0F2E1E',
  accentText: '#03140A',
  danger: '#FF8A4C',
  dangerSoft: '#3A1A0B',
  warn: '#FBBF24',
  warnSoft: '#33260A',
  hero: ['#06261A', '#0A3D29', '#0F5C3B'] as const,
  heroText: '#F2FFF7',
  heroMuted: '#8DC2A6',
  heroTrack: 'rgba(255,255,255,0.14)',
  heroFill: '#5BEA9C',
  shadow: '#000000',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

/** Inter weights loaded in the root layout. Custom fonts ignore fontWeight on Android, so pick a family. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

/** Soft elevation that works on iOS, Android and web. */
export function shadow(c: Colors, level: 1 | 2 = 1): ViewStyle {
  const opacity = c === dark ? 0.5 : level === 1 ? 0.06 : 0.12;
  return Platform.select<ViewStyle>({
    android: { elevation: level === 1 ? 2 : 6 },
    default: {
      shadowColor: c.shadow,
      shadowOpacity: opacity,
      shadowRadius: level === 1 ? 10 : 20,
      shadowOffset: { width: 0, height: level === 1 ? 4 : 10 },
    },
  })!;
}
