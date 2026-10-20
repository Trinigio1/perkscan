import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EC',
  border: '#E1E5DE',
  text: '#0E1411',
  textMuted: '#5D6862',
  textFaint: '#8D978F',
  accent: '#15803D',       // money / recovered
  accentSoft: '#DCFCE7',
  accentText: '#FFFFFF',
  danger: '#C2410C',       // left on the table
  dangerSoft: '#FFEDD5',
  warn: '#B45309',         // at risk
  warnSoft: '#FEF3C7',
  hero: '#0B1F17',
  heroText: '#F0FDF4',
  heroMuted: '#A7C4B5',
};

const dark: typeof light = {
  bg: '#090D0B',
  surface: '#121815',
  surfaceAlt: '#1A221E',
  border: '#24302A',
  text: '#EEF3F0',
  textMuted: '#9AA79F',
  textFaint: '#6A766F',
  accent: '#4ADE80',
  accentSoft: '#11331F',
  accentText: '#04140A',
  danger: '#FB923C',
  dangerSoft: '#3A1D0B',
  warn: '#FBBF24',
  warnSoft: '#36280A',
  hero: '#0F2A1E',
  heroText: '#F0FDF4',
  heroMuted: '#8DB3A1',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
