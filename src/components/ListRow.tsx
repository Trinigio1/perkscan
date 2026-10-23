import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Switch, View } from 'react-native';
import type { IconTone } from '@/domain/visuals';
import { space, useColors } from '@/theme';
import { IconBubble, Row, T, type IconName } from './ui';

/** Settings-style row: icon, title, optional subtitle, and a switch, value or chevron. */
export function ListRow({
  icon,
  tone = 'gray',
  title,
  subtitle,
  value,
  onPress,
  toggle,
  onToggle,
  right,
  danger,
}: {
  icon: IconName;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const c = useColors();
  const body = (
    <Row gap={space.md} style={{ paddingVertical: space.sm }}>
      <IconBubble icon={icon} tone={tone} size={36} />
      <View style={{ flex: 1, gap: 1 }}>
        <T variant="subheading" color={danger ? c.danger : undefined}>{title}</T>
        {subtitle ? <T variant="caption" muted>{subtitle}</T> : null}
      </View>
      {right}
      {value ? <T variant="label" muted>{value}</T> : null}
      {onToggle ? (
        <Switch value={!!toggle} onValueChange={onToggle} trackColor={{ true: c.accent, false: c.border }} thumbColor="#FFFFFF" ios_backgroundColor={c.border} />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
      ) : null}
    </Row>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}
