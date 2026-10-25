import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { PerkForYouRow } from '@/components/ForYou';
import { Button, Empty, Panel, Screen, T } from '@/components/ui';
import { interestLabel } from '@/domain/deals';
import type { ForYouItem } from '@/domain/forYou';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { clearPerkFeedback, usePerksForYou } from '@/lib/forYou';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/** Perks you have access to that your inbox won't tell you about, ranked for you, each with why. */
export default function ForYou() {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const items = usePerksForYou();
  const [refreshing, setRefreshing] = useState(false);
  const yours = items.filter((i) => i.group === 'yours');
  const claim = items.filter((i) => i.group === 'claim');
  const picked = data.profile?.interests ?? [];
  const answered = data.perkFeedback.length;

  useEffect(() => {
    track('for_you_viewed', { items: items.length, yours: yours.length });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  const bringBack = async () => {
    try {
      await clearPerkFeedback();
      await refresh();
      toast('Hidden perks are back', { tone: 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    }
  };

  const list = (rows: ForYouItem[]) => (
    <Panel style={{ paddingVertical: space.xs }}>
      {rows.map((item, i) => (
        <View key={item.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
          <PerkForYouRow item={item} />
        </View>
      ))}
    </Panel>
  );

  return (
    <Screen edges={[]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T muted>
        Perks you already have, or can get free, that your inbox won’t tell you about. Ranked by the cards you hold, where you shop and what you’re into.
      </T>

      {!items.length ? (
        <Empty
          icon="gift"
          title="Nothing to suggest yet"
          body="Add your cards and memberships, and pick what you’re into. PerkScan matches perks to them."
          action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />}
        />
      ) : null}

      {yours.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Comes with what you have</T>
          {list(yours)}
        </View>
      ) : null}

      {claim.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Free for you to get</T>
          {list(claim)}
        </View>
      ) : null}

      <Panel style={{ gap: space.sm }}>
        <T variant="subheading">Make these better</T>
        <T variant="caption" muted>
          {picked.length ? `You’re into ${picked.map((i) => interestLabel(i).toLowerCase()).join(', ')}.` : 'Tell PerkScan what you’re into to see perks that fit.'}{' '}
          Cards and memberships you add unlock their perks too.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button title={picked.length ? 'Change interests' : 'Pick interests'} size="sm" kind="secondary" icon="heart" onPress={() => router.push('/interests')} />
          <Button title="Memberships" size="sm" kind="secondary" icon="pricetag" onPress={() => router.push('/memberships')} />
          {answered ? <Button title={`Show ${answered} hidden`} size="sm" kind="ghost" onPress={bringBack} /> : null}
        </View>
      </Panel>
    </Screen>
  );
}
