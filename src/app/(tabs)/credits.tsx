import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { CreditRow } from '@/components/CreditRow';
import { Button, Empty, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { formatMoney, PERIOD_LABELS } from '@/domain/format';
import { remainingValue } from '@/domain/score';
import type { Opportunity } from '@/domain/types';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

type Filter = 'current' | 'missed' | 'used';

export default function Credits() {
  const c = useColors();
  const { data, refresh } = useData();
  const { cardById, benefitById, recoveredByOpp } = useLookups();
  const [filter, setFilter] = useState<Filter>('current');
  const [refreshing, setRefreshing] = useState(false);
  const { now, groups } = useMemo(() => {
    const now = new Date();
    const credits = data.opportunities.filter((o) => o.type === 'card_credit');
    const pick = (o: Opportunity) => {
      const live = o.expires_at !== null && new Date(o.expires_at) > now;
      if (filter === 'current') return live && (o.status === 'open' || o.status === 'claimed');
      if (filter === 'missed') return o.status === 'expired' || (o.status === 'open' && !live);
      return o.status === 'claimed';
    };
    const grouped = data.userCards.map((uc) => {
      const items = credits
        .filter((o) => o.user_card_id === uc.id && pick(o))
        .sort((a, b) => (filter === 'current'
          ? new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime()
          : new Date(b.expires_at!).getTime() - new Date(a.expires_at!).getTime()));
      const total = items.reduce((s, o) => s + remainingValue(o, recoveredByOpp), 0);
      return { uc, card: cardById.get(uc.card_id), items, total };
    });
    return { now, groups: grouped };
  }, [data, filter, cardById, recoveredByOpp]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T variant="title">Credits</T>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { label: 'This period', value: 'current' },
          { label: 'Missed', value: 'missed' },
          { label: 'Used', value: 'used' },
        ]}
      />
      {data.userCards.length === 0 ? (
        <Empty icon="pricetags-outline" title="No cards yet" action={<Button title="Add cards" onPress={() => router.push('/add-card')} />} />
      ) : null}
      {groups.map(({ uc, card, items, total }) => (
        <Panel key={uc.id}>
          <Row>
            <View style={{ flex: 1 }}>
              <T variant="heading" numberOfLines={1}>{uc.nickname || card?.product_name}</T>
              <T variant="caption" muted>•••• {uc.last_four}</T>
            </View>
            {filter !== 'used' && total > 0 ? (
              <T variant="label" color={filter === 'missed' ? c.danger : c.text}>
                {formatMoney(total)} {filter === 'missed' ? 'missed' : 'left'}
              </T>
            ) : null}
          </Row>
          {items.length === 0 ? (
            <T variant="caption" muted style={{ paddingVertical: space.sm }}>
              {filter === 'current'
                ? 'This card has no periodic credits to track.'
                : filter === 'missed'
                  ? 'Nothing missed this year. Nice.'
                  : 'Nothing marked used yet.'}
            </T>
          ) : (
            items.map((o) => {
              const b = o.benefit_id ? benefitById.get(o.benefit_id) : undefined;
              return (
                <CreditRow
                  key={o.id}
                  opp={o}
                  benefit={b}
                  recovered={recoveredByOpp.get(o.id) ?? 0}
                  subtitle={b ? PERIOD_LABELS[b.period] : undefined}
                  now={now}
                />
              );
            })
          )}
        </Panel>
      ))}
    </Screen>
  );
}
