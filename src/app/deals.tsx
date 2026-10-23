import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { DealRow } from '@/components/DealRow';
import { Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { interestLabel } from '@/domain/deals';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { useDeals } from '@/lib/deals';
import { space, useColors } from '@/theme';

/** "3 hours ago", "yesterday" — when PerkScan last checked the stores. */
function ago(iso: string, now = Date.now()): string {
  const h = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Store deals where you live, matched to what you're into. */
export default function Deals() {
  const c = useColors();
  const { data } = useData();
  const { forYou, popular, picked, suggested } = useDeals();
  const country = data.profile?.country ?? null;
  const interests = picked.length ? picked : suggested;

  useEffect(() => {
    track('deals_viewed', { matched: forYou.length });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = [
    countryByCode(country)?.name,
    data.scout.sources ? `${data.scout.sources} store and bank pages checked daily` : null,
    data.scout.lastChecked ? `updated ${ago(data.scout.lastChecked)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Screen edges={[]}>
      {status ? <T variant="caption" muted>{status}</T> : null}

      <Pressable onPress={() => router.push('/interests')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Panel style={{ gap: space.xs }}>
          <Row>
            <T variant="subheading" style={{ flex: 1 }}>{picked.length ? 'Your interests' : interests.length ? 'Looks like you’re into' : 'What are you into?'}</T>
            <T variant="label" color={c.accent}>{picked.length ? 'Edit' : 'Choose'}</T>
          </Row>
          <T variant="caption" muted numberOfLines={2}>
            {interests.length ? interests.map(interestLabel).join(' · ') : 'Pick a few so the best deals come first.'}
          </T>
        </Panel>
      </Pressable>

      {!country ? (
        <Empty icon="location" title="Where do you live?" body="Deals depend on where you shop." action={<Button title="Set country" onPress={() => router.push('/country')} />} />
      ) : !forYou.length && !popular.length ? (
        <Empty icon="pricetags" title="No deals yet" body="PerkScan checks stores near you every day. New deals show up here as soon as they’re posted." />
      ) : null}

      {forYou.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">For you</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {forYou.map((x, i) => (
              <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <DealRow item={x} />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {popular.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">More near you</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {popular.slice(0, forYou.length ? 10 : 20).map((x, i) => (
              <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <DealRow item={x} />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      <T variant="caption" faint center>
        Deals your own inbox doesn’t show: read from stores’ own pages, or promotions many PerkScan users near you got. Check the terms before you buy.
      </T>
    </Screen>
  );
}
