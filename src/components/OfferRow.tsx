import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { claimTarget, followUpQuestion } from '@/domain/claimTarget';
import { confidenceOf } from '@/domain/confidence';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import type { CardBenefit, Opportunity } from '@/domain/types';
import { offerIcon, OFFER_TYPE_LABELS } from '@/domain/visuals';
import { useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';
import { ClaimButton } from './Claims';
import { ConfidenceTag } from './ConfidenceTag';
import { CreditRow } from './CreditRow';
import { Badge, IconBubble, Row, T } from './ui';

/** A promo, gift card, trial, return window or settlement found in email. */
export function OfferRow({ opp, now }: { opp: Opportunity; now: Date }) {
  const c = useColors();
  const { benefitById, why } = useLookups();
  const statusOf = (id: string) => benefitById.get(id)?.status;
  const { icon, tone } = offerIcon(opp.type);
  // "Target · From your email": the store, and where PerkScan got it.
  const source = [opp.merchant, why(opp)?.short].filter(Boolean).join(' · ');
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
    // Asked for money back: waiting on the store, bank or settlement. Otherwise: opened to use.
    const asked = followUpQuestion(opp) === 'Did it arrive?';
    status = `${asked ? 'Requested' : 'Opened'} ${relativeDays(new Date(opp.claim_started_at), now)}${asked ? ' · waiting' : ''}`;
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
          {source ? <T variant="caption" muted numberOfLines={1}>{source}</T> : null}
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
  claim = true,
}: {
  opp: Opportunity;
  now: Date;
  benefit?: CardBenefit;
  recovered: number;
  subtitle?: string;
  /** Show the Claim button under the row. */
  claim?: boolean;
}) {
  const row = opp.type === 'card_credit' ? <CreditRow opp={opp} benefit={benefit} recovered={recovered} subtitle={subtitle} now={now} /> : <OfferRow opp={opp} now={now} />;
  const missed = !!opp.expires_at && new Date(opp.expires_at) <= now;
  const target = !missed && claim ? claimTarget({ opp, benefit }) : null;
  if (!target) return row;
  // The Claim button sits beside the row, not inside it: a button can't contain another button.
  return (
    <View>
      {row}
      <Row gap={space.sm} style={{ marginLeft: 56, marginTop: -4, paddingBottom: space.md }}>
        <ClaimButton opp={opp} target={target} size="sm" />
        <T variant="caption" faint numberOfLines={2} style={{ flex: 1 }}>{target.hint}</T>
      </Row>
    </View>
  );
}
