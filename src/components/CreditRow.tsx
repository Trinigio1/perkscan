import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { confidenceOf } from '@/domain/confidence';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import type { CardBenefit, Opportunity } from '@/domain/types';
import { benefitIcon } from '@/domain/visuals';
import { space, useColors } from '@/theme';
import { ConfidenceTag } from './ConfidenceTag';
import { IconBubble, ProgressBar, Row, T } from './ui';

/** One credit for one period: icon, name, card, reset timing and what's left. */
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
  const missed = opp.status === 'expired' || (opp.status === 'open' && opp.expires_at !== null && new Date(opp.expires_at) <= now);
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const daysLeft = expires ? (expires.getTime() - now.getTime()) / 86_400_000 : Infinity;
  const soon = !used && !missed && daysLeft <= 7;
  const remaining = value === null ? null : Math.max(0, value - recovered);
  const { icon, tone } = benefitIcon(opp.title, 'credit');

  let status: string;
  let statusColor = c.textMuted;
  if (used) {
    status = 'Used';
    statusColor = c.accentStrong;
  } else if (missed) {
    status = `Expired ${lastDayLabel(opp.expires_at!)}`;
    statusColor = c.danger;
  } else if (expires) {
    status = `Resets ${relativeDays(expires, now)}`;
    if (soon) statusColor = c.warn;
  } else status = '';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/credit/[id]', params: { id: opp.id } })}
      style={({ pressed }) => ({ paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={`${opp.title}, ${value === null ? 'amount not verified' : formatMoney(value, { currency: opp.currency })}, ${status}`}
    >
      <Row gap={space.md}>
        <View>
          <IconBubble icon={icon} tone={tone} />
          {used ? (
            <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, borderWidth: 2, borderColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="checkmark" size={11} color={c.accentText} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}>
            <T variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>{opp.title}</T>
            {benefit?.enrollment_required && !used ? <Ionicons name="alert-circle" size={14} color={c.warn} /> : null}
          </Row>
          {subtitle ? <T variant="caption" muted numberOfLines={1}>{subtitle}</T> : null}
          <T variant="caption" color={statusColor} numberOfLines={1}>{status}</T>
          {value !== null && !used && !missed && recovered > 0 ? (
            <View style={{ marginTop: 4 }}>
              <ProgressBar value={recovered / value} height={4} color={soon ? c.warn : c.accent} />
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 56, gap: 4 }}>
          {value === null ? (
            // Amount not confirmed from the issuer yet: say nothing rather than guess.
            <T variant="subheading" faint>—</T>
          ) : (
            <>
              <T
                variant="subheading"
                color={missed ? c.danger : used ? c.textFaint : c.text}
                style={[{ fontVariant: ['tabular-nums'] }, used ? { textDecorationLine: 'line-through' } : null]}
              >
                {formatMoney(used || missed ? value : remaining!, { currency: opp.currency })}
              </T>
              {!used && !missed && recovered > 0 ? <T variant="caption" faint>left</T> : null}
            </>
          )}
          {!used && !missed ? <ConfidenceTag value={confidenceOf(opp)} /> : null}
        </View>
      </Row>
    </Pressable>
  );
}
