import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { OfferRow } from '@/components/OfferRow';
import { Button, Empty, IconBubble, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { addToBag, formatBag, type MoneyBag } from '@/domain/format';
import type { Opportunity } from '@/domain/types';
import { useData } from '@/lib/data';
import { listMessages } from '@/lib/inbox';
import { space, useColors } from '@/theme';

type Filter = 'active' | 'history';

const SECTIONS: { title: string; types: Opportunity['type'][] }[] = [
  { title: 'Card protections', types: ['protection'] },
  { title: 'Promo codes', types: ['promo'] },
  { title: 'Gift cards & store credit', types: ['gift_card', 'store_credit'] },
  { title: 'Points', types: ['points'] },
  { title: 'Trials & returns', types: ['free_trial', 'return_window'] },
  { title: 'Settlements', types: ['settlement'] },
];

export default function Offers() {
  const c = useColors();
  const { data, refresh } = useData();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [inbox, setInbox] = useState<{ total: number; failed: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      listMessages(200)
        .then((m) => setInbox({ total: m.length, failed: m.filter((x) => x.parse_status === 'failed').length }))
        .catch(() => setInbox(null));
    }, []),
  );

  const { now, soon, sections, total } = useMemo(() => {
    const at = new Date();
    const offers = data.opportunities.filter((o) => o.type !== 'card_credit');
    const live = (o: Opportunity) => o.status === 'open' && (!o.expires_at || new Date(o.expires_at) > at);
    const list = filter === 'active' ? offers.filter(live) : offers.filter((o) => !live(o));
    const byExpiry = (a: Opportunity, b: Opportunity) =>
      (a.expires_at ? new Date(a.expires_at).getTime() : Infinity) - (b.expires_at ? new Date(b.expires_at).getTime() : Infinity);
    const week = filter === 'active' ? list.filter((o) => o.expires_at && new Date(o.expires_at).getTime() - at.getTime() <= 7 * 86_400_000).sort(byExpiry) : [];
    const rest = list.filter((o) => !week.includes(o));
    return {
      now: at,
      soon: week,
      sections: SECTIONS.map((s) => ({ ...s, items: rest.filter((o) => s.types.includes(o.type)).sort(byExpiry) })).filter((s) => s.items.length),
      total: list.reduce((bag, o) => addToBag(bag, o.currency, o.value_estimate ?? 0), {} as MoneyBag),
    };
  }, [data.opportunities, filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const connected = (inbox?.total ?? 0) > 0;

  return (
    <Screen title="Offers" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <Panel onPress={() => router.push(connected ? '/inbox' : '/connect-gmail')}>
        <Row gap={space.md}>
          <IconBubble icon="mail" tone="blue" />
          <View style={{ flex: 1 }}>
            <T variant="subheading">{connected ? 'Inbox' : 'Connect Gmail'}</T>
            <T variant="caption" muted>
              {connected
                ? `${inbox!.total} email${inbox!.total === 1 ? '' : 's'} read${inbox!.failed ? ` · ${inbox!.failed} need a retry` : ''}`
                : 'Find promo codes, gift cards and trials in your email'}
            </T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
        </Row>
      </Panel>

      <Segmented<Filter> value={filter} onChange={setFilter} options={[{ label: 'Active', value: 'active' }, { label: 'History', value: 'history' }]} />

      {filter === 'active' && Object.values(total).some((v) => v > 0) ? (
        <Row style={{ alignItems: 'baseline' }} gap={6}>
          <T variant="title">{formatBag(total)}</T>
          <T muted>in offers you can still use</T>
        </Row>
      ) : null}

      {soon.length === 0 && sections.length === 0 ? (
        <Empty
          icon={filter === 'active' ? 'gift' : 'time'}
          title={filter === 'active' ? 'No offers yet' : 'Nothing here yet'}
          body={filter === 'active' ? 'Label receipts and promo emails “PerkScan” in Gmail. Offers, and the card protections that apply to your purchases, show up here.' : 'Offers you use, dismiss, or that expire land here.'}
          action={filter === 'active' && !connected ? <Button title="Connect Gmail" icon="mail" onPress={() => router.push('/connect-gmail')} /> : undefined}
        />
      ) : null}

      {soon.length ? <Group title="Expiring this week" items={soon} now={now} warn /> : null}
      {sections.map((s) => (
        <Group key={s.title} title={s.title} items={s.items} now={now} />
      ))}
    </Screen>
  );
}

function Group({ title, items, now, warn }: { title: string; items: Opportunity[]; now: Date; warn?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Row>
        {warn ? <Ionicons name="time" size={16} color={c.warn} /> : null}
        <T variant="heading" color={warn ? c.warn : undefined}>{title}</T>
      </Row>
      <Panel style={{ paddingVertical: space.xs }}>
        {items.map((o, i) => (
          <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
            <OfferRow opp={o} now={now} />
          </View>
        ))}
      </Panel>
    </View>
  );
}
