import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { formatMoney } from '@/domain/format';
import type { PayingTwice } from '@/domain/subscriptions';
import { useMembershipHints, usePayingTwice } from '@/lib/memberships';
import { space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T } from './ui';

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Line({ p }: { p: PayingTwice }) {
  const c = useColors();
  const best = p.covers[0]!;
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start', paddingVertical: space.sm }}>
      <IconBubble icon="repeat" tone="orange" size={32} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="subheading">
          {p.charge.service.name} · {formatMoney(p.charge.amount, { currency: p.charge.currency })}
        </T>
        <T variant="caption" muted>Charged {shortDate(p.charge.date)}</T>
        <T variant="caption" color={c.accentStrong}>
          {best.kind === 'included'
            ? `Your ${best.by} already includes this (${best.benefitName.replace(/\s+included$/i, '')}).`
            : `Your ${best.by} gives back up to ${formatMoney(best.saving, { currency: p.charge.currency })} a month on it. Pay with that card${best.enroll ? ' and enroll first' : ''}.`}
        </T>
      </View>
    </Row>
  );
}

/**
 * "You may be paying twice": subscriptions from the user's own receipts that a membership or card
 * they have already includes or credits back. Real charges only; nothing estimated.
 */
export function PayingTwicePanel({ max = 3 }: { max?: number }) {
  const c = useColors();
  const list = usePayingTwice();
  if (!list.length) return null;
  return (
    <Panel style={{ gap: space.xs }}>
      <T variant="caption" color={c.warn}>You may be paying twice</T>
      {list.slice(0, max).map((p) => (
        <Line key={p.charge.service.key} p={p} />
      ))}
      {list.length > max ? <T variant="caption" muted>+ {list.length - max} more</T> : null}
    </Panel>
  );
}

/** "Do you have Walmart+? Add your memberships": with a hint when receipts show one, else a general nudge. */
export function MembershipNudge({ onHide }: { onHide: () => void }) {
  const c = useColors();
  const hints = useMembershipHints();
  const first = hints[0];
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="ribbon" tone="purple" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" color={c.accentStrong}>{first ? 'Found in your email' : 'Your memberships'}</T>
          <T variant="subheading">{first ? `You pay for ${first.name}. Add it to see what it includes.` : 'Prime, Costco, Walmart+ or a T-Mobile plan?'}</T>
          <T variant="caption" muted>Memberships come with perks and credits, and some include subscriptions you might be paying for twice.</T>
        </View>
        <Ionicons name="close" size={18} color={c.textFaint} onPress={onHide} accessibilityLabel="Hide" />
      </Row>
      <View style={{ alignItems: 'flex-start' }}>
        <Button title="Add memberships" size="sm" icon="add" onPress={() => router.push('/memberships')} />
      </View>
    </Panel>
  );
}
