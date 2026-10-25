import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { DealRow } from '@/components/DealRow';
import { Empty, Panel, Screen, T } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { useStoreOffers } from '@/lib/deals';
import { space, useColors } from '@/theme';

/** Offers on the official pages of stores you already shop at or hear from. Not a coupon feed. */
export default function Offers() {
  const c = useColors();
  const { refresh } = useData();
  const offers = useStoreOffers();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    track('offers_viewed', { count: offers.length });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T muted>Promotions on the official pages of stores you shop at or get email from, that aren’t already in your inbox.</T>
      {offers.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {offers.map((x, i) => (
            <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
              <DealRow item={x} />
            </View>
          ))}
        </Panel>
      ) : (
        <Empty icon="storefront" title="No offers at your stores right now" body="When a store you use posts a promotion on its own site, it shows up here." />
      )}
      <T variant="caption" faint center>From stores’ own pages. Check the terms before you buy.</T>
    </Screen>
  );
}
