import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { cardArt } from '@/domain/visuals';
import { font, radius, shadow, useColors } from '@/theme';

/**
 * A stylised card face: gradient, issuer, product and last four. Colors only
 * evoke the real card; no logos or trademarked artwork are reproduced.
 */
export function CardArt({
  cardId,
  issuer,
  name,
  lastFour,
  size = 'lg',
  style,
}: {
  cardId: string;
  issuer: string;
  name: string;
  lastFour?: string;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const art = cardArt(cardId);
  const dims = size === 'lg' ? { pad: 20, issuer: 12, name: 18, four: 15 } : size === 'md' ? { pad: 14, issuer: 10, name: 14, four: 12 } : { pad: 0, issuer: 0, name: 0, four: 0 };

  if (size === 'sm') {
    return (
      <LinearGradient
        colors={art.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ width: 44, height: 28, borderRadius: 5, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)' }, style]}
      />
    );
  }

  return (
    <LinearGradient
      colors={art.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          aspectRatio: 1.586, // ISO/IEC 7810 ID-1
          borderRadius: size === 'lg' ? radius.lg : radius.md,
          padding: dims.pad,
          justifyContent: 'space-between',
          overflow: 'hidden',
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.08)',
        },
        shadow(c, 2),
        style,
      ]}
    >
      {/* Soft sheen */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: '140%', height: '70%', top: '-35%', left: '-20%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ rotate: '-12deg' }] }}
      />
      <Text style={{ color: art.subtle, fontFamily: font.semibold, fontSize: dims.issuer, letterSpacing: 1.2, textTransform: 'uppercase' }} numberOfLines={1}>
        {issuer}
      </Text>
      <View style={{ gap: 4 }}>
        <View style={{ width: dims.name * 2, height: dims.name * 1.5, borderRadius: 4, backgroundColor: 'rgba(255,215,140,0.55)', marginBottom: 6 }} />
        <Text style={{ color: art.text, fontFamily: font.bold, fontSize: dims.name }} numberOfLines={2}>
          {name}
        </Text>
        {lastFour ? (
          <Text style={{ color: art.subtle, fontFamily: font.semibold, fontSize: dims.four, letterSpacing: 2, fontVariant: ['tabular-nums'] }}>
            •••• {lastFour}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
}
