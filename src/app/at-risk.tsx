import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { OpportunityRow } from '@/components/OfferRow';
import { Empty, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import { groupAtRisk, type SourceKind } from '@/domain/atRisk';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { scoreByCurrency } from '@/domain/score';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const SOURCE_ICON: Record<SourceKind, { icon: 'card' | 'storefront' | 'help-circle'; tone: 'green' | 'orange' | 'gray' }> = {
  card: { icon: 'card', tone: 'green' },
  store: { icon: 'storefront', tone: 'orange' },
  other: { icon: 'help-circle', tone: 'gray' },
};

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);

/** "At risk this week", broken down by where the money is: each card, store or sender. */
export default function AtRisk() {
  const c = useColors();
  const { data } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();

  const { now, sources, total, unknown } = useMemo(() => {
    const at = new Date();
    const items = scoreByCurrency(data.opportunities, data.recovered, at, home).flatMap((x) => x.score.atRiskItems);
    const groups = groupAtRisk(items, recoveredByOpp, userCardLabel);
    return {
      now: at,
      sources: groups,
      total: groups.reduce((bag, g) => Object.entries(g.total).reduce((b, [cur, v]) => addToBag(b, cur, v), bag), {} as MoneyBag),
      unknown: items.filter((o) => o.value_estimate === null).length,
    };
  }, [data, home, recoveredByOpp, userCardLabel]);

  if (!sources.length) {
    return (
      <Screen edges={[]}>
        <Empty icon="checkmark-circle" title="Nothing expires this week" body="When a credit, code or gift card has 7 days or less left, it shows up here with where it comes from." />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: space.xs }}>
        <T variant="caption" muted>Expires in the next 7 days</T>
        <T variant="title" color={c.warn}>{nonZero(total) ? formatBag(total, home) : 'Value not known'}</T>
        <T variant="caption" muted>
          From {sources.length} {sources.length === 1 ? 'place' : 'places'} · {sources.reduce((n, s) => n + s.items.length, 0)} things to use
        </T>
      </Panel>

      {sources.map((s) => {
        const { icon, tone } = SOURCE_ICON[s.kind];
        const cardId = s.kind === 'card' ? s.items[0]!.user_card_id : null;
        const header = (
          <Row gap={space.md}>
            <IconBubble icon={icon} tone={tone} size={36} />
            <View style={{ flex: 1 }}>
              <T variant="subheading" numberOfLines={1}>{s.label}</T>
              <T variant="caption" muted>
                {s.kind === 'card' ? 'Card benefits' : s.kind === 'store' ? 'Codes, gift cards and credit' : 'Found in your email or texts'}
              </T>
            </View>
            {nonZero(s.total) ? <T variant="subheading" color={c.warn}>{formatBag(s.total, home)}</T> : null}
            {cardId ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
          </Row>
        );
        return (
          <View key={s.key} style={{ gap: space.sm }}>
            {cardId ? (
              <Pressable onPress={() => router.push({ pathname: '/card/[id]', params: { id: cardId } })} accessibilityRole="button" accessibilityLabel={`Open ${s.label}`}>
                {header}
              </Pressable>
            ) : (
              header
            )}
            <Panel style={{ paddingVertical: space.xs }}>
              {s.items.map((o, i) => (
                <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                  <OpportunityRow
                    opp={o}
                    benefit={o.benefit_id ? benefitById.get(o.benefit_id) : undefined}
                    recovered={recoveredByOpp.get(o.id) ?? 0}
                    subtitle={s.kind === 'card' ? undefined : userCardLabel(o.user_card_id)}
                    now={now}
                  />
                </View>
              ))}
            </Panel>
          </View>
        );
      })}

      {unknown ? (
        <Note icon="information-circle-outline">
          {unknown} of these {unknown === 1 ? 'has' : 'have'} no verified amount, so {unknown === 1 ? 'it isn’t' : 'they aren’t'} in the total. Still worth using before {unknown === 1 ? 'it expires' : 'they expire'}.
        </Note>
      ) : null}
    </Screen>
  );
}
