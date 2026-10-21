import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { CreditRow } from '@/components/CreditRow';
import { Button, Empty, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { addToBag, formatBag, PERIOD_LABELS, type MoneyBag } from '@/domain/format';
import { remainingValue } from '@/domain/score';
import type { Opportunity } from '@/domain/types';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

type Filter = 'current' | 'missed' | 'used';

const EMPTY_COPY: Record<Filter, string> = {
  current: 'No recurring credits on this card.',
  missed: 'Nothing missed this year. Nice.',
  used: 'Nothing marked used yet.',
};

const hasMoney = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);

export default function Credits() {
  const c = useColors();
  const { data, refresh } = useData();
  const { cardById, benefitById, recoveredByOpp } = useLookups();
  const [filter, setFilter] = useState<Filter>('current');
  const [refreshing, setRefreshing] = useState(false);

  const { now, groups, total } = useMemo(() => {
    const at = new Date();
    const credits = data.opportunities.filter((o) => o.type === 'card_credit');
    const pick = (o: Opportunity) => {
      const live = o.expires_at !== null && new Date(o.expires_at) > at;
      if (filter === 'current') return live && (o.status === 'open' || o.status === 'claimed');
      if (filter === 'missed') return o.status === 'expired' || (o.status === 'open' && !live);
      return o.status === 'claimed';
    };
    const time = (o: Opportunity) => new Date(o.expires_at!).getTime();
    const grouped = data.userCards.map((uc) => {
      const items = credits
        .filter((o) => o.user_card_id === uc.id && pick(o))
        .sort((a, b) => {
          // This period: unused first, soonest first; history: newest first.
          if (filter === 'current' && (a.status === 'claimed') !== (b.status === 'claimed')) return a.status === 'claimed' ? 1 : -1;
          if ((a.value_estimate === null) !== (b.value_estimate === null)) return a.value_estimate === null ? 1 : -1;
          return filter === 'current' ? time(a) - time(b) : time(b) - time(a);
        });
      const sum: MoneyBag = {};
      for (const o of items) addToBag(sum, o.currency, filter === 'used' ? recoveredByOpp.get(o.id) ?? 0 : remainingValue(o, recoveredByOpp));
      return { uc, card: cardById.get(uc.card_id), items, sum };
    });
    const total: MoneyBag = {};
    for (const g of grouped) for (const [cur, v] of Object.entries(g.sum)) addToBag(total, cur, v);
    return { now: at, groups: grouped, total };
  }, [data, filter, cardById, recoveredByOpp]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const totalLabel = filter === 'current' ? 'available this period' : filter === 'missed' ? 'missed this year' : 'used this year';

  return (
    <Screen title="Credits" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { label: 'This period', value: 'current' },
          { label: 'Missed', value: 'missed' },
          { label: 'Used', value: 'used' },
        ]}
      />
      {data.userCards.length ? (
        <Row style={{ alignItems: 'baseline' }} gap={6}>
          <T variant="title" color={filter === 'missed' && hasMoney(total) ? c.danger : filter === 'used' ? c.accentStrong : c.text}>
            {formatBag(total)}
          </T>
          <T muted>{totalLabel}</T>
        </Row>
      ) : (
        <Empty icon="pricetags" title="No cards yet" body="Add a card to see its credits here." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      )}
      {groups.map(({ uc, card, items, sum }) => (
        <View key={uc.id} style={{ gap: space.sm }}>
          <Row gap={space.md}>
            {card ? <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" /> : null}
            <View style={{ flex: 1 }}>
              <T variant="subheading" numberOfLines={1}>{uc.nickname || card?.product_name.replace(/®/g, '')}</T>
              <T variant="caption" muted>•••• {uc.last_four}</T>
            </View>
            {hasMoney(sum) ? <T variant="label" muted>{formatBag(sum)}</T> : null}
          </Row>
          <Panel style={{ paddingVertical: space.xs }}>
            {items.length === 0 ? (
              <T variant="caption" muted style={{ paddingVertical: space.md }}>{EMPTY_COPY[filter]}</T>
            ) : (
              items.map((o, i) => {
                const b = o.benefit_id ? benefitById.get(o.benefit_id) : undefined;
                return (
                  <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                    <CreditRow opp={o} benefit={b} recovered={recoveredByOpp.get(o.id) ?? 0} subtitle={b ? PERIOD_LABELS[b.period] : undefined} now={now} />
                  </View>
                );
              })
            )}
          </Panel>
        </View>
      ))}
    </Screen>
  );
}
