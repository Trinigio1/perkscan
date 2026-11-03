import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { formatMoney } from '@/domain/format';
import { cardAppOffers, yourStores, type StoreFinds, type StoreItem, type StoreItemKind, type YourStores } from '@/domain/stores';
import { track } from '@/lib/analytics';
import { useData, useLookups } from '@/lib/data';
import { sendPerkFeedback } from '@/lib/forYou';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T, type IconName } from './ui';
import { WrongButton } from './Wrong';

const ICON: Record<StoreItemKind, { icon: IconName; tone: 'blue' | 'teal' | 'purple' | 'green' | 'orange' | 'gray' }> = {
  balance: { icon: 'wallet', tone: 'green' },
  card_credit: { icon: 'card', tone: 'purple' },
  code: { icon: 'pricetag', tone: 'green' },
  card_offer: { icon: 'card', tone: 'blue' },
  deal: { icon: 'megaphone', tone: 'orange' },
  student: { icon: 'school', tone: 'blue' },
  membership: { icon: 'ribbon', tone: 'purple' },
  price_adjust: { icon: 'trending-down', tone: 'teal' },
  program: { icon: 'gift', tone: 'green' },
  best_card: { icon: 'trophy', tone: 'gray' },
};

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const bag = (b: Record<string, number>) => Object.entries(b).map(([cur, n]) => formatMoney(n, { currency: cur })).join(' + ');

/** The stores you shop at most, and everything you have at each. */
export function useYourStores(): YourStores & { cardApps: ReturnType<typeof cardAppOffers> } {
  const { data } = useData();
  const { recoveredByOpp, userCardLabel } = useLookups();
  return useMemo(() => {
    const now = new Date();
    const res = yourStores(data.receipts, {
      cards: data.cards,
      benefits: data.benefits,
      userCards: data.userCards,
      opportunities: data.opportunities,
      receipts: data.receipts,
      recoveredByOpp,
      now,
      money: (n, cur) => formatMoney(n, { currency: cur }),
      programs: data.programs,
      feedback: new Map(data.perkFeedback.map((f) => [f.program_id, f.action])),
      studentOffers: data.profile?.is_student ? data.studentOffers : [],
      deals: data.deals,
      dealFeedback: data.dealFeedback,
      earnRates: data.earnRates,
      cardRewards: data.cardRewards,
      mutes: data.storeMutes.map((m) => m.store_key),
      wrong: data.wrong,
      country: data.profile?.country ?? null,
      cardLabel: (id) => userCardLabel(id),
      date: day,
    });
    const issuers = data.userCards
      .map((uc) => data.cards.find((c) => c.id === uc.card_id))
      .filter((c) => c && c.kind !== 'membership')
      .map((c) => c!.issuer);
    return { ...res, cardApps: cardAppOffers(data.programs, issuers) };
  }, [data, recoveredByOpp, userCardLabel]);
}

function ItemRow({ storeKey, storeName, item, first }: { storeKey: string; storeName: string; item: StoreItem; first: boolean }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const { icon, tone } = ICON[item.kind];
  const value = item.amount ? formatMoney(item.amount, { currency: item.currency ?? undefined }) : item.percent ? `${item.percent}% off` : null;
  const joined = async () => {
    try {
      await sendPerkFeedback(item.catalogRef!, 'have', 'claim');
      toast('Got it — hidden from your stores', { tone: 'success' });
      await refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    }
  };
  return (
    <View style={[{ paddingVertical: space.md, gap: 6 }, first ? null : { borderTopWidth: 1, borderTopColor: c.border }]}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={icon} tone={tone} size={30} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{item.title}</T>
          {item.detail ? <T variant="caption" muted numberOfLines={3}>{item.detail}</T> : null}
          <T variant="caption" faint>
            From: {item.source}
            {item.expires ? ` · ends ${day(item.expires)}` : ''}
          </T>
        </View>
        {value ? <T variant="label" color={item.ready ? c.accentStrong : undefined}>{value}</T> : null}
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap', paddingLeft: 30 + space.md }}>
        {item.opportunityId ? (
          <Button
            title="Open"
            size="sm"
            kind="secondary"
            onPress={() => {
              track('your_stores', { action: 'open', kind: item.kind });
              router.push(item.kind === 'card_credit' ? { pathname: '/credit/[id]', params: { id: item.opportunityId! } } : { pathname: '/offer/[id]', params: { id: item.opportunityId! } });
            }}
          />
        ) : null}
        {item.url ? (
          <Button
            title={item.kind === 'program' ? 'Join free' : item.kind === 'price_adjust' ? 'See the policy' : 'Open'}
            icon="open-outline"
            size="sm"
            kind="secondary"
            onPress={() => {
              track('your_stores', { action: 'open', kind: item.kind });
              Linking.openURL(item.url!);
            }}
          />
        ) : null}
        {item.kind === 'program' && item.catalogRef ? <Button title="I’m already a member" size="sm" kind="ghost" onPress={joined} /> : null}
        {item.kind === 'best_card' ? (
          <Button title="Before you pay" size="sm" kind="ghost" onPress={() => router.push({ pathname: '/checkout', params: { merchant: storeName } })} />
        ) : null}
        <WrongButton kind="store_item" itemKey={`${storeKey}:${item.key}`} catalogRef={item.catalogRef} label="Wrong?" />
      </Row>
    </View>
  );
}

/** One store: how often you go, what you hold there, and everything else you have there. */
export function StorePanel({ finds }: { finds: StoreFinds }) {
  const c = useColors();
  const [all, setAll] = useState(false);
  const { store, items, ready } = finds;
  const shown = all ? items : items.slice(0, 4);
  return (
    <Panel style={{ gap: space.xs }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="title">{store.name}</T>
          <T variant="caption" muted>
            {store.visits} purchase{store.visits === 1 ? '' : 's'} · {bag(store.spend)} in 6 months · last {day(store.last)}
          </T>
        </View>
        {Object.keys(ready).length ? (
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="label" color={c.accentStrong}>{bag(ready)}</T>
            <T variant="caption" muted>ready to use</T>
          </View>
        ) : null}
      </Row>
      {items.length ? (
        shown.map((it, i) => <ItemRow key={it.key} storeKey={store.key} storeName={store.name} item={it} first={i === 0} />)
      ) : (
        <T variant="caption" muted style={{ paddingVertical: space.sm }}>Nothing extra here yet. PerkScan keeps checking your emails, cards and this store’s own pages.</T>
      )}
      {items.length > 4 ? <Button title={all ? 'Show less' : `Show all ${items.length}`} size="sm" kind="ghost" onPress={() => setAll(!all)} /> : null}
    </Panel>
  );
}

/** Home: the stores you use most and what's waiting there, one tap from the full list. */
export function StoresPanel() {
  const c = useColors();
  const s = useYourStores();
  const names = s.stores.filter((x) => x.items.some((i) => i.kind !== 'best_card')).map((x) => x.store.name).slice(0, 3);
  return (
    <Panel onPress={() => router.push('/stores')} style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <IconBubble icon="storefront" tone="blue" size={32} />
        <T variant="label" color={c.accentStrong} style={{ flex: 1 }}>Your stores</T>
        <T variant="label" color={c.accent}>›</T>
      </Row>
      {s.stores.length ? (
        <>
          <T variant="subheading">
            {s.things ? `${s.things} thing${s.things === 1 ? '' : 's'} you have at ${names.join(', ')}` : `What you have at ${s.stores.slice(0, 3).map((x) => x.store.name).join(', ')}`}
          </T>
          {Object.keys(s.ready).length ? <T variant="caption" muted>{bag(s.ready)} ready to use there now</T> : null}
          {s.missed > 0 ? <T variant="caption" muted>The right card would have earned {formatMoney(s.missed, { currency: 'USD' })} more there in 6 months</T> : null}
        </>
      ) : (
        <T variant="caption" muted>Once PerkScan sees your purchases (email receipts, card alerts or your bank), it lists what you already have at the stores you use most.</T>
      )}
    </Panel>
  );
}
