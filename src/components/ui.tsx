import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { formatMoney } from '@/domain/format';
import type { IconTone } from '@/domain/visuals';
import { font, radius, shadow, space, useColors, useIsDark } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  refreshControl,
  title,
  subtitle,
  right,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  /** Large page title shown at the top of the scroll content. */
  title?: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const c = useColors();
  const header = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginBottom: space.xs }}>
      <View style={{ flex: 1, gap: 2 }}>
        {subtitle ? <T variant="overline" muted>{subtitle}</T> : null}
        <T variant="display">{title}</T>
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: space.lg, gap: space.lg }}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Panel({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: padded ? space.lg : 0,
    gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    ...shadow(c, 1),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.985 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <Row style={{ marginTop: space.sm }}>
      <T variant="heading" style={{ flex: 1 }}>{title}</T>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <T variant="label" color={c.accent}>{action}</T>
        </Pressable>
      ) : null}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type TextVariant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'label' | 'caption' | 'overline';
const variants: Record<TextVariant, TextStyle> = {
  display: { fontSize: 32, fontFamily: font.heavy, letterSpacing: -0.8, lineHeight: 38 },
  title: { fontSize: 24, fontFamily: font.bold, letterSpacing: -0.4, lineHeight: 30 },
  heading: { fontSize: 18, fontFamily: font.bold, letterSpacing: -0.2, lineHeight: 24 },
  subheading: { fontSize: 16, fontFamily: font.semibold, lineHeight: 22 },
  body: { fontSize: 15, fontFamily: font.regular, lineHeight: 22 },
  label: { fontSize: 14, fontFamily: font.semibold, lineHeight: 19 },
  caption: { fontSize: 13, fontFamily: font.regular, lineHeight: 18 },
  overline: { fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.8, textTransform: 'uppercase' },
};

export function T({
  variant = 'body',
  muted,
  faint,
  color,
  style,
  children,
  numberOfLines,
  center,
}: {
  variant?: TextVariant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  center?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        variants[variant],
        { color: color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text) },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Big dollar figure. With `animate`, counts up from the previous value. */
export function Money({
  value,
  size = 56,
  color,
  style,
  animate = false,
}: {
  value: number;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  animate?: boolean;
}) {
  const c = useColors();
  const shown = useCountUp(value, animate);
  return (
    <Text
      adjustsFontSizeToFit
      numberOfLines={1}
      style={[
        { fontSize: size, fontFamily: font.heavy, letterSpacing: -size * 0.035, color: color ?? c.text, fontVariant: ['tabular-nums'] },
        style,
      ]}
    >
      {formatMoney(shown)}
    </Text>
  );
}

function useCountUp(target: number, enabled: boolean) {
  const [shown, setShown] = useState(0);
  // Last value drawn, so a new target animates from where the number currently is.
  const current = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const v = new Animated.Value(0);
    const start = current.current;
    const id = v.addListener(({ value }) => {
      current.current = Math.round(start + (target - start) * value);
      setShown(current.current);
    });
    Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => {
      v.stopAnimation();
      v.removeListener(id);
    };
  }, [target, enabled]);
  return enabled ? shown : target;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  kind = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : kind === 'ghost' ? c.accent : c.text;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={off}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: size === 'sm' ? 9 : 15,
          paddingHorizontal: size === 'sm' ? space.md : space.xl,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: off ? 0.45 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        kind === 'primary' && !off ? shadow(c, 1) : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: size === 'sm' ? 14 : 16, fontFamily: font.bold }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.accent : c.surfaceAlt,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? c.accentText : c.textMuted} /> : null}
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: selected ? c.accentText : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={c.textFaint}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: c.surface,
            borderColor: error ? c.danger : focused ? c.accent : c.border,
            borderWidth: focused || error ? 2 : 1,
            borderRadius: radius.md,
            paddingHorizontal: space.lg,
            paddingVertical: 14,
            fontSize: 17,
            fontFamily: font.medium,
            color: c.text,
          },
          props.style,
        ]}
      />
      {error ? (
        <Row gap={4}>
          <Ionicons name="alert-circle" size={14} color={c.danger} />
          <T variant="caption" color={c.danger}>{error}</T>
        </Row>
      ) : hint ? (
        <T variant="caption" muted>{hint}</T>
      ) : null}
    </View>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: V }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceSunken, borderRadius: radius.pill, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[
              { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
              on ? { backgroundColor: c.surface, ...shadow(c, 1) } : null,
            ]}
          >
            <Text style={{ fontSize: 13, fontFamily: on ? font.bold : font.medium, color: on ? c.text : c.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

export function useToneColors(tone: IconTone): { bg: string; fg: string } {
  const dark = useIsDark();
  const map: Record<IconTone, [string, string, string, string]> = {
    // light bg, light fg, dark bg, dark fg
    green: ['#DDF6E8', '#0B7D46', '#0F2E1E', '#4ADE80'],
    blue: ['#E0ECFF', '#2557C7', '#13213F', '#7EA8FF'],
    orange: ['#FFEBD9', '#C2560C', '#36200E', '#FFA25E'],
    purple: ['#EFE5FF', '#6D35C9', '#251840', '#B892FF'],
    pink: ['#FFE3EF', '#C2185B', '#3A1424', '#FF85B3'],
    teal: ['#D9F5F3', '#0F766E', '#0E2B29', '#4FD1C5'],
    gray: ['#ECEFEC', '#56635C', '#1E2622', '#A3B0A8'],
  };
  const [lb, lf, db, df] = map[tone];
  return dark ? { bg: db, fg: df } : { bg: lb, fg: lf };
}

export function IconBubble({ icon, tone = 'green', size = 40 }: { icon: IconName; tone?: IconTone; size?: number }) {
  const { bg, fg } = useToneColors(tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </View>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad'; icon?: IconName }) {
  const c = useColors();
  const map = {
    neutral: [c.surfaceAlt, c.textMuted],
    good: [c.accentSoft, c.accentStrong],
    warn: [c.warnSoft, c.warn],
    bad: [c.dangerSoft, c.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 12, fontFamily: font.semibold }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color, track, height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, backgroundColor: track ?? c.surfaceSunken, borderRadius: height / 2, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? c.accent, borderRadius: height / 2 }} />
    </View>
  );
}

/** Circular progress. Shows a checkmark when complete. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 5,
  color,
  done,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  done?: boolean;
  children?: ReactNode;
}) {
  const c = useColors();
  const pct = done ? 1 : Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fg = color ?? c.accent;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceSunken} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={fg}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {done ? <Ionicons name="checkmark" size={size * 0.45} color={fg} /> : children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.md }}>
      <IconBubble icon={icon} tone="green" size={56} />
      <T variant="heading" center>{title}</T>
      {body ? <T muted center>{body}</T> : null}
      {action}
    </Panel>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const c = useColors();
  return (
    <Row style={{ backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' }}>
      <Ionicons name="alert-circle" size={18} color={c.danger} />
      <T variant="caption" color={c.danger} style={{ flex: 1 }}>{message}</T>
    </Row>
  );
}

export function Note({ icon = 'information-circle-outline', children }: { icon?: IconName; children: ReactNode }) {
  const c = useColors();
  return (
    <Row style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={c.textMuted} />
      <T variant="caption" muted style={{ flex: 1 }}>{children}</T>
    </Row>
  );
}

/** Pulsing placeholder block while data loads. */
export function Skeleton({ height, width = '100%', radiusSize = radius.md }: { height: number; width?: ViewStyle['width']; radiusSize?: number }) {
  const c = useColors();
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={{ height, width, borderRadius: radiusSize, backgroundColor: c.surfaceSunken, opacity: pulse }} />;
}

export function Loading() {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space.lg, gap: space.lg }}>
      <Skeleton height={220} radiusSize={radius.xl} />
      <Row gap={space.md}>
        <View style={{ flex: 1 }}><Skeleton height={110} radiusSize={radius.lg} /></View>
        <View style={{ flex: 1 }}><Skeleton height={110} radiusSize={radius.lg} /></View>
      </Row>
      <Skeleton height={160} radiusSize={radius.lg} />
    </SafeAreaView>
  );
}
