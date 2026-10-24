import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { EventRow, SuggestionRow } from '@/components/ComingUp';
import { DealRow } from '@/components/DealRow';
import { Button, Empty, IconBubble, Panel, Row, Screen, SectionHeader, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { interestLabel } from '@/domain/deals';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { myEvents, useData } from '@/lib/data';
import { useDeals } from '@/lib/deals';
import { useDismissed, useSuggestions } from '@/lib/suggestions';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/** "3 hours ago", "yesterday" — when PerkScan last checked the stores. */
function ago(iso: string, now = Date.now()): string {
  const h = Math.floor((now - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const SHARE_PROMPT = 'share_prompt';

/** Deals your inbox won't show you, and what's coming up near you. */
export default function Deals() {
  const c = useColors();
  const toast = useToast();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const { forYou, popular, picked, suggested } = useDeals();
  const { list: forYouTips, hide } = useSuggestions();
  const [dismissed, dismiss, dismissedLoaded] = useDismissed();
  const [refreshing, setRefreshing] = useState(false);
  const country = data.profile?.country ?? null;
  const interests = picked.length ? picked : suggested;
  const events = useMemo(() => myEvents(data), [data]);

  useEffect(() => {
    track('deals_viewed', { matched: forYou.length });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Ask to share once there are deals on screen, so the value is obvious.
  const askToShare = dismissedLoaded && !!session && !data.profile?.share_deals && !dismissed.has(SHARE_PROMPT) && forYou.length + popular.length > 0;
  const turnOnSharing = async () => {
    if (!session) return;
    try {
      await updateProfile(session.user.id, { share_deals: true });
      await refresh();
      toast('Thanks — you’ll see more deals as people nearby join', { tone: 'success' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    }
  };

  const status = [
    countryByCode(country)?.name,
    data.scout.sources ? `${data.scout.sources} pages checked daily` : null,
    data.scout.lastChecked ? `updated ${ago(data.scout.lastChecked)}` : null,
  ].filter(Boolean).join(' · ');

  const dealList = (items: typeof forYou) => (
    <Panel style={{ paddingVertical: space.xs }}>
      {items.map((x, i) => (
        <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
          <DealRow item={x} />
        </View>
      ))}
    </Panel>
  );
  const comingUp = [...events.slice(0, 3).map((e) => ({ kind: 'event' as const, e })), ...forYouTips.slice(0, 2).map((s) => ({ kind: 'tip' as const, s }))];

  return (
    <Screen title="Deals" subtitle={status || undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <Pressable onPress={() => router.push('/interests')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Ionicons name="sparkles" size={14} color={c.accentStrong} />
          <T variant="caption" muted style={{ flex: 1 }} numberOfLines={1}>
            {interests.length ? `${picked.length ? 'You’re into' : 'Looks like you’re into'} ${interests.map(interestLabel).join(', ')}` : 'Pick what you’re into so the best deals come first'}
          </T>
          <T variant="label" color={c.accent}>{picked.length ? 'Edit' : 'Choose'}</T>
        </Row>
      </Pressable>

      {!country ? (
        <Empty icon="location" title="Where do you live?" body="Deals depend on where you shop." action={<Button title="Set country" onPress={() => router.push('/country')} />} />
      ) : !forYou.length && !popular.length ? (
        <Empty icon="pricetags" title="No deals yet" body="PerkScan checks stores near you every day. New deals show up here as soon as they’re posted." />
      ) : null}

      {forYou.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">For you</T>
          {dealList(forYou)}
        </View>
      ) : null}

      {askToShare ? (
        <Panel style={{ gap: space.sm, backgroundColor: c.accentSoft }}>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <IconBubble icon="people" tone="green" size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="subheading">Get deals your inbox never shows</T>
              <T variant="caption">Swap public promotions with people near you. Only the store, offer and dates are shared — never your emails or who you are.</T>
            </View>
          </Row>
          <Row gap={space.sm}>
            <Button title="Turn on" size="sm" onPress={turnOnSharing} />
            <Button title="Not now" size="sm" kind="ghost" onPress={() => dismiss(SHARE_PROMPT)} />
          </Row>
        </Panel>
      ) : null}

      {comingUp.length ? (
        <View style={{ gap: space.sm }}>
          <SectionHeader title="Coming up near you" action="See all" onAction={() => router.push('/coming-up')} />
          <Panel style={{ paddingVertical: space.xs }}>
            {comingUp.map((item, i) => (
              <View key={item.kind === 'event' ? item.e.id : item.s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                {item.kind === 'event' ? <EventRow e={item.e} /> : <SuggestionRow s={item.s} onHide={() => hide(item.s.id)} />}
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {popular.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">More near you</T>
          {dealList(popular.slice(0, forYou.length ? 10 : 20))}
        </View>
      ) : null}

      <T variant="caption" faint center>
        From stores’ own pages, or promotions many PerkScan users near you got. Check the terms before you buy.
      </T>
    </Screen>
  );
}
