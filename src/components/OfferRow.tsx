import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { claimTarget, followUpQuestion } from '@/domain/claimTarget';
import { confidenceOf } from '@/domain/confidence';
import { offerEstimate } from '@/domain/estimate';
import { isInAppDeal } from '@/domain/inApp';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import type { CardBenefit, Opportunity } from '@/domain/types';
import { offerIcon, OFFER_TYPE_LABELS } from '@/domain/visuals';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';
import { ClaimButton } from './Claims';
import { ConfidenceTag } from './ConfidenceTag';
import { CreditRow } from './CreditRow';
import { Badge, IconBubble, Row, T } from './ui';

/** A promo, gift card, trial, return window or settlement found in email. */
/** `note` is shown with "Used", e.g. "Spotted on your Oct 20 Uber Eats receipt". */
export function OfferRow({ opp, now, note }: { opp: Opportunity; now: Date; note?: string }) {
  const c = useColors();
  const { benefitById } = useLookups();
  const { data } = useData();
  const statusOf = (id: string) => benefitById.get(id)?.status;
  // A percent-off code at a store you buy from: what it's roughly worth to you.
  const estimate = offerEstimate(opp, data.receipts, now);
  const { icon, tone } = offerIcon(opp.type);
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const done = opp.status === 'claimed';
  const missed = opp.status === 'expired' || (opp.status === 'open' && !!expires && expires <= now);
  const soon = !done && !missed && !!expires && expires.getTime() - now.getTime() <= 7 * 86_400_000;

  let status = OFFER_TYPE_LABELS[opp.type] ?? 'Offer';
  let statusColor = c.textMuted;
  if (done) status = note ? `Used · ${note}` : 'Used';
  else if (opp.status === 'dismissed') status = 'Dismissed';
  else if (missed && expires) {
    status = `Expired ${lastDayLabel(opp.expires_at!)}`;
    statusColor = c.danger;
  } else if (opp.claim_started_at) {
    // Asked for money back: waiting on the store, bank or settlement. Otherwise: opened to use.
    const asked = followUpQuestion(opp) === 'Did it arrive?';
    // A refund the store already issued ("refund:" key from the reader) is on its way, not requested.
    const issued = opp.type === 'refund' && !!opp.dedupe_key?.startsWith('refund:');
    status = issued
      ? `Refund on its way · issued ${relativeDays(new Date(opp.claim_started_at), now)}`
      : `${asked ? 'Requested' : 'Opened'} ${relativeDays(new Date(opp.claim_started_at), now)}${asked ? ' · waiting' : ''}`;
    statusColor = c.accentStrong;
  } else if (isInAppDeal(opp)) {
    // Shown for 7 days from the email: when it was seen is a week before PerkScan stops showing it.
    const seen = expires ? new Date(expires.getTime() - 7 * 86_400_000) : new Date(opp.created_at);
    status = `In the ${opp.merchant ?? 'store'} app · seen ${relativeDays(seen, now)}`;
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
          ) : estimate ? (
            <T variant="subheading" color={c.textMuted} style={{ fontVariant: ['tabular-nums'] }}>
              ≈ {formatMoney(estimate.value, { currency: estimate.currency })}
            </T>
          ) : opp.discount_amount ? (
            // A discount on a minimum spend PerkScan can't relate to your spending: shown, never counted.
            <T variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(opp.discount_amount, { currency: opp.currency })} off{opp.min_spend ? ` ${formatMoney(opp.min_spend, { currency: opp.currency })}+` : ''}
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
  const row = opp.type === 'card_credit' ? <CreditRow opp={opp} benefit={benefit} recovered={recovered} subtitle={subtitle} now={now} /> : <OfferRow opp={opp} now={now} note={subtitle} />;
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
