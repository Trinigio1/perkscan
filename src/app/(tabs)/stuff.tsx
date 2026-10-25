import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { ListRow } from '@/components/ListRow';
import { Panel, Screen, T } from '@/components/ui';
import { YourCards } from '@/components/YourCards';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { kindOf, viewOf } from '@/domain/money';
import { remainingValue } from '@/domain/score';
import { useData, useLookups } from '@/lib/data';
import { useStoreOffers } from '@/lib/deals';
import { space } from '@/theme';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T variant="overline" muted style={{ paddingHorizontal: space.xs }}>{title}</T>
      <Panel style={{ paddingVertical: space.xs }}>{children}</Panel>
    </View>
  );
}

/** Everything you already have: your cards, their benefits, gift cards and credit, and where PerkScan looks. */
export default function YourStuff() {
  const { data } = useData();
  const { recoveredByOpp } = useLookups();
  const offers = useStoreOffers();
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();

  const { benefits, balances, balanceCount } = useMemo(() => {
    const now = new Date();
    const myCards = new Set(data.userCards.map((u) => u.card_id));
    const held = data.opportunities.filter((o) => viewOf(o, now) === 'open' && ['gift_cards', 'points'].includes(kindOf(o)));
    return {
      // Same count as Home: benefits confirmed on the issuer's site.
      benefits: data.benefits.filter((b) => b.type !== 'credit' && b.status === 'active' && myCards.has(b.card_id)).length,
      balances: held.reduce((bag, o) => addToBag(bag, o.currency, remainingValue(o, recoveredByOpp)), {} as MoneyBag),
      balanceCount: held.length,
    };
  }, [data, recoveredByOpp]);
  const sources = data.senderDomains.length > 0 || data.receipts.length > 0;

  return (
    <Screen title="Your stuff" subtitle="What you already have, and what it gets you">
      <View style={{ gap: space.sm }}>
        <T variant="overline" muted style={{ paddingHorizontal: space.xs }}>Cards</T>
        <YourCards />
      </View>

      <Group title="What it gets you">
        <ListRow icon="airplane" tone="blue" title="Card benefits" subtitle="Lounges, insurance, protections, status" value={benefits ? String(benefits) : undefined} onPress={() => router.push('/perks')} />
        <ListRow
          icon="gift"
          tone="pink"
          title="Gift cards, store credit & points"
          value={balanceCount ? (Object.values(balances).some((v) => v > 0) ? formatBag(balances, home) : String(balanceCount)) : 'None yet'}
          onPress={() => router.push('/money')}
        />
        <ListRow icon="storefront" tone="orange" title="Offers at your stores" subtitle="From the stores’ own pages" value={offers.length ? String(offers.length) : undefined} onPress={() => router.push('/offers')} />
        <ListRow icon="card" tone="green" title="Which card to use" subtitle="Before you pay at a store" onPress={() => router.push('/checkout')} />
      </Group>

      <Group title="Because of who you are">
        {data.profile?.is_student ? (
          <ListRow icon="school" tone="purple" title="Student" value={data.school?.short_name ?? 'Pick your school'} onPress={() => router.push('/student')} />
        ) : null}
        <ListRow icon="search" tone="teal" title="Unclaimed money & settlements" subtitle="Official programs that may owe you" onPress={() => router.push('/hidden-money')} />
        <ListRow icon="calendar" tone="blue" title="Coming up for your cards and state" onPress={() => router.push('/coming-up')} />
      </Group>

      <Group title="Where PerkScan looks">
        <ListRow icon="mail" tone="blue" title="Email and texts" value={sources ? 'Connected' : 'Not yet'} onPress={() => router.push(sources ? '/sources' : '/connect-gmail')} />
        <ListRow icon="add" tone="green" title="Add something yourself" subtitle="A gift card, points, a code or a refund" onPress={() => router.push('/add')} />
      </Group>
    </Screen>
  );
}
