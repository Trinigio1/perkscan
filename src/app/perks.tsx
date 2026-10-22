import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Badge, Button, Empty, IconBubble, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { groupPerks, loungeCards, type PerkGroup } from '@/domain/perks';
import type { CardBenefit } from '@/domain/types';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const GROUP_ICON: Record<PerkGroup, { icon: 'airplane' | 'globe' | 'star' | 'gift' | 'shield-checkmark' | 'card'; tone: 'blue' | 'teal' | 'purple' | 'green' | 'orange' | 'gray' }> = {
  airport: { icon: 'airplane', tone: 'blue' },
  travel: { icon: 'globe', tone: 'teal' },
  status: { icon: 'star', tone: 'purple' },
  rewards: { icon: 'gift', tone: 'green' },
  shopping: { icon: 'shield-checkmark', tone: 'orange' },
  card: { icon: 'card', tone: 'gray' },
};

const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Every perk across your cards: lounges, travel insurance, status, rewards and protections. */
export default function Perks() {
  const c = useColors();
  const { data } = useData();
  const { userCardLabel } = useLookups();
  const groups = useMemo(() => groupPerks(data.userCards, data.benefits, userCardLabel), [data, userCardLabel]);

  // Your next flight, if a booking was found: a nudge to use the lounge.
  const lounges = loungeCards(groups);
  const today = new Date().toISOString().slice(0, 10);
  const nextFlight = data.receipts
    .filter((r) => r.purchase_type === 'flight' && r.travel_date && r.travel_date >= today)
    .sort((a, b) => a.travel_date!.localeCompare(b.travel_date!))[0];

  if (!data.userCards.length) {
    return (
      <Screen edges={[]}>
        <Empty icon="card" title="No cards yet" body="Add your cards to see their lounges, travel insurance, rewards and protections." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {nextFlight && lounges.length ? (
        <Panel style={{ backgroundColor: c.accentSoft, gap: space.xs }}>
          <Row gap={space.sm}>
            <Ionicons name="airplane" size={18} color={c.accentStrong} />
            <T variant="subheading" color={c.accentStrong} style={{ flex: 1 }}>You fly on {day(nextFlight.travel_date!)}</T>
          </Row>
          <T variant="caption">
            {nextFlight.merchant} · lounge access with your {lounges.join(' and ')}
          </T>
        </Panel>
      ) : null}

      {groups.length === 0 ? (
        <T muted>PerkScan doesn’t list perks for your cards yet.</T>
      ) : (
        groups.map((g) => (
          <View key={g.group} style={{ gap: space.sm }}>
            <Row gap={space.sm}>
              <IconBubble icon={GROUP_ICON[g.group].icon} tone={GROUP_ICON[g.group].tone} size={32} />
              <T variant="heading" style={{ flex: 1 }}>{g.title}</T>
            </Row>
            <Panel style={{ paddingVertical: space.xs }}>
              {g.lines.map((l, i) => (
                <View key={l.benefit.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                  <PerkLineView b={l.benefit} cards={l.cards} />
                </View>
              ))}
            </Panel>
          </View>
        ))
      )}

      <T variant="caption" faint center>From each bank’s own pages. Terms change — tap ↗ to check.</T>
    </Screen>
  );
}

function PerkLineView({ b, cards }: { b: CardBenefit; cards: string[] }) {
  const c = useColors();
  const limit = b.max_coverage !== null ? `Up to ${formatMoney(b.max_coverage, { currency: b.currency ?? 'USD' })}` : null;
  return (
    <View style={{ paddingVertical: space.md, gap: 4 }}>
      <Row>
        <T variant="subheading" style={{ flex: 1 }}>{b.name}</T>
        {b.source_url ? (
          <Pressable accessibilityLabel="Open the bank’s terms" onPress={() => Linking.openURL(b.source_url!)} hitSlop={10}>
            <Ionicons name="open-outline" size={16} color={c.textFaint} />
          </Pressable>
        ) : null}
      </Row>
      <T variant="caption" muted numberOfLines={1}>{cards.join(' · ')}</T>
      {b.terms_summary ? <T variant="caption" numberOfLines={3}>{b.terms_summary}</T> : null}
      {limit || b.enrollment_required || b.status !== 'active' ? (
        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 2 }}>
          {limit ? <Badge label={limit} tone="good" /> : null}
          {b.enrollment_required ? <Badge label="Enroll first" icon="alert-circle" tone="warn" /> : null}
          {b.status === 'active' ? null : <T variant="caption" faint>Unconfirmed</T>}
        </Row>
      ) : null}
    </View>
  );
}
