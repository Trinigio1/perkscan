import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import type { CardBenefit, Opportunity } from '@/domain/types';
import { space, useColors } from '@/theme';
import { Badge, Progress, Row, T } from './ui';

export function CreditRow({
  opp,
  benefit,
  recovered,
  subtitle,
  now,
}: {
  opp: Opportunity;
  benefit?: CardBenefit;
  recovered: number;
  subtitle?: string;
  now: Date;
}) {
  const c = useColors();
  const value = opp.value_estimate;
  const used = opp.status === 'claimed';
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const daysLeft = expires ? (expires.getTime() - now.getTime()) / 86_400_000 : Infinity;
  const remaining = value === null ? null : Math.max(0, value - recovered);

  let badge;
  if (used) badge = <Badge label="Used" tone="good" icon="checkmark" />;
  else if (opp.status === 'expired') badge = <Badge label="Missed" tone="bad" />;
  else if (value === null) badge = <Badge label="Amount not verified" />;
  else badge = <Badge label={`${formatMoney(remaining!)} left`} tone={daysLeft <= 7 ? 'warn' : 'neutral'} />;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/credit/[id]', params: { id: opp.id } })}
      style={({ pressed }) => ({ paddingVertical: space.md, gap: space.sm, opacity: pressed ? 0.7 : 1 })}
      accessibilityRole="button"
    >
      <Row>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="heading" numberOfLines={1}>{opp.title}</T>
          {subtitle ? <T variant="caption" muted numberOfLines={1}>{subtitle}</T> : null}
        </View>
        {value !== null ? <T variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{formatMoney(value)}</T> : null}
        <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
      </Row>
      {value !== null && !used ? <Progress value={value ? recovered / value : 0} tone={daysLeft <= 7 ? 'warn' : 'good'} /> : null}
      <Row style={{ flexWrap: 'wrap' }}>
        {badge}
        {benefit?.enrollment_required && !used ? <Badge label="Enrollment required" icon="alert-circle-outline" /> : null}
        {expires && opp.status === 'open' ? (
          <T variant="caption" color={daysLeft <= 7 ? c.warn : c.textMuted}>
            Use by {lastDayLabel(opp.expires_at!)} · resets {relativeDays(expires, now)}
          </T>
        ) : null}
      </Row>
    </Pressable>
  );
}
