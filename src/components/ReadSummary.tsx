import { View } from 'react-native';
import { formatMoney, lastDayLabel } from '@/domain/format';
import { OFFER_TYPE_LABELS } from '@/domain/visuals';
import type { ReadOffer, ReadPurchase } from '@/lib/feedback';
import { space, useColors } from '@/theme';
import { Row, T } from './ui';

/** "Promo · $10 off · code SAVE10 · use by Oct 30" */
export function offerLine(o: ReadOffer): string {
  return [
    OFFER_TYPE_LABELS[o.type] ?? 'Offer',
    o.title,
    o.value_estimate !== null && !o.title.includes(String(Math.round(o.value_estimate))) ? formatMoney(o.value_estimate, { currency: o.currency }) : null,
    o.code ? `code ${o.code}` : null,
    o.expires_at ? `until ${lastDayLabel(o.expires_at)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "Bank alert · Uber Eats · TT$144.51 · card ••4321 · 2026-10-20 · pending" */
export function purchaseLine(p: ReadPurchase): string {
  return [
    p.kind === 'card_alert' ? 'Bank alert' : 'Receipt',
    p.merchant,
    p.total !== null ? formatMoney(p.total, { currency: p.currency }) : 'no amount',
    p.last_four ? `card ••${p.last_four}` : 'no card digits',
    p.purchase_date,
    p.pending ? 'pending' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Everything PerkScan took from one message, one line per item. */
export function ReadSummary({ offers, purchases }: { offers: ReadOffer[]; purchases: ReadPurchase[] }) {
  const c = useColors();
  if (!offers.length && !purchases.length) {
    return <T variant="caption" muted>Found nothing to act on</T>;
  }
  return (
    <View style={{ gap: 4 }}>
      {purchases.map((p) => (
        <Row key={p.id} gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <T variant="caption" color={c.accentStrong}>•</T>
          <T variant="caption" style={{ flex: 1 }}>{purchaseLine(p)}</T>
        </Row>
      ))}
      {offers.map((o) => (
        <Row key={o.id} gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <T variant="caption" color={c.accentStrong}>•</T>
          <T variant="caption" style={{ flex: 1 }}>{offerLine(o)}</T>
        </Row>
      ))}
    </View>
  );
}
