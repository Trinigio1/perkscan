import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { confidenceOf } from '@/domain/confidence';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import type { CardBenefit, Opportunity } from '@/domain/types';
import { offerIcon, OFFER_TYPE_LABELS } from '@/domain/visuals';
import { useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';
import { ConfidenceTag } from './ConfidenceTag';
import { CreditRow } from './CreditRow';
import { Badge, IconBubble, Row, T } from './ui';

/** A promo, gift card, trial, return window or settlement found in email. */
export function OfferRow({ opp, now }: { opp: Opportunity; now: Date }) {
  const c = useColors();
  const { benefitById } = useLookups();
  const statusOf = (id: string) => benefitById.get(id)?.status;
  const { icon, tone } = offerIcon(opp.type);
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const done = opp.status === 'claimed';
  const missed = opp.status === 'expired' || (opp.status === 'open' && !!expires && expires <= now);
  const soon = !done && !missed && !!expires && expires.getTime() - now.getTime() <= 7 * 86_400_000;

  let status = OFFER_TYPE_LABELS[opp.type] ?? 'Offer';
  let statusColor = c.textMuted;
  if (done) status = 'Used';
  else if (opp.status === 'dismissed') status = 'Dismissed';
  else if (missed && expires) {
    status = `Expired ${lastDayLabel(opp.expires_at!)}`;
    statusColor = c.danger;
  } else if (opp.claim_started_at) {
    // Asked for it: waiting on the store, bank or settlement.
    status = `Requested ${relativeDays(new Date(opp.claim_started_at), now)} · waiting`;
    statusColor = c.accentStrong;
  } else if (expires) {
    status = `${opp.type === 'free_trial' ? 'Ends' : 'Expires'} ${relativeDays(expires, now)}`;
    if (soon) statusColor = c.warn;
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/offer/[id]', params: { id: opp.id } })}
      style={({ pressed }) => ({ paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}
      accessibilityRole="button"
      accessibilityLabel={`${opp.title}${opp.merchant ? ` from ${opp.merchant}` : ''}, ${status}`}
    >
      <Row gap={space.md}>
        <IconBubble icon={icon} tone={tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading" numberOfLines={2}>{opp.title}</T>
          {opp.merchant ? <T variant="caption" muted numberOfLines={1}>{opp.merchant}</T> : null}
          <T variant="caption" color={statusColor} numberOfLines={1}>{status}</T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, maxWidth: 110 }}>
          {opp.value_estimate !== null ? (
            <T variant="subheading" color={missed ? c.danger : done ? c.textFaint : c.text} style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(opp.value_estimate, { currency: opp.currency })}
            </T>
          ) : null}
          {opp.code && !done ? <Badge label={opp.code} /> : null}
          {opp.status === 'open' && !missed ? <ConfidenceTag value={confidenceOf(opp, statusOf)} /> : null}
        </View>
      </Row>
    </Pressable>
  );
}

/** Picks the right row for any opportunity. */
export function OpportunityRow({
  opp,
  now,
  benefit,
  recovered,
  subtitle,
}: {
  opp: Opportunity;
  now: Date;
  benefit?: CardBenefit;
  recovered: number;
  subtitle?: string;
}) {
  if (opp.type === 'card_credit') return <CreditRow opp={opp} benefit={benefit} recovered={recovered} subtitle={subtitle} now={now} />;
  return <OfferRow opp={opp} now={now} />;
}
