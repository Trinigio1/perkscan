import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
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
import { formatMoney } from '@/domain/format';
import { radius, space, useColors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  refreshControl,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: space.lg, gap: space.lg }}>{children}</View>
      )}
    </SafeAreaView>
  );
}

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
const variants: Record<TextVariant, TextStyle> = {
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
};

export function T({
  variant = 'body',
  muted,
  faint,
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: TextVariant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const c = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[variants[variant], { color: color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text) }, style]}
    >
      {children}
    </Text>
  );
}

/** Big, bold dollar figure. */
export function Money({
  value,
  size = 56,
  color,
  style,
}: {
  value: number;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const c = useColors();
  return (
    <Text
      adjustsFontSizeToFit
      numberOfLines={1}
      style={[{ fontSize: size, fontWeight: '900', letterSpacing: -1.5, color: color ?? c.text, fontVariant: ['tabular-nums'] }, style]}
    >
      {formatMoney(value)}
    </Text>
  );
}

export function Panel({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: space.sm };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? c.danger : c.text;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.md,
        paddingVertical: 14,
        paddingHorizontal: space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        opacity: off ? 0.5 : pressed ? 0.8 : 1,
        borderWidth: kind === 'secondary' ? StyleSheet.hairlineWidth : 0,
        borderColor: c.border,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={c.textFaint}
        {...props}
        style={[
          {
            backgroundColor: c.surface,
            borderColor: error ? c.danger : c.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            paddingVertical: 12,
            fontSize: 17,
            color: c.text,
          },
          props.style,
        ]}
      />
      {error ? <T variant="caption" color={c.danger}>{error}</T> : hint ? <T variant="caption" muted>{hint}</T> : null}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad'; icon?: IconName }) {
  const c = useColors();
  const map = {
    neutral: [c.surfaceAlt, c.textMuted],
    good: [c.accentSoft, c.accent],
    warn: [c.warnSoft, c.warn],
    bad: [c.dangerSoft, c.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Progress({ value, tone = 'good' }: { value: number; tone?: 'good' | 'warn' }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: tone === 'good' ? c.accent : c.warn }} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm }, style]}>{children}</View>;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: space.xxl }}>
      <Ionicons name={icon} size={32} color={c.textFaint} />
      <T variant="heading" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T muted style={{ textAlign: 'center' }}>{body}</T> : null}
      {action}
    </Panel>
  );
}

export function ErrorNote({ message }: { message: string }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: space.md }}>
      <T variant="caption" color={c.danger}>{message}</T>
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator color={c.accent} />
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
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.sm, padding: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, paddingVertical: 6, borderRadius: radius.sm - 2, backgroundColor: on ? c.surface : 'transparent', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? c.text : c.textMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
