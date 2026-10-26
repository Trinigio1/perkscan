import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { EventRow, SuggestionRow } from '@/components/ComingUp';
import { DealRow } from '@/components/DealRow';
import { OpportunityRow } from '@/components/OfferRow';
import { Button, Chip, Empty, IconBubble, Panel, Row, Screen, SectionHeader, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { INTERESTS, groupByInterest, interestLabel, type RankedDeal } from '@/domain/deals';
import { emailOffersFor } from '@/domain/interests';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { myEvents, useData, useLookups } from '@/lib/data';
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
  const { benefitById, recoveredByOpp } = useLookups();
  // Deals for you under each interest you picked; one interest at a time when its chip is tapped.
  const [focus, setFocus] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);
  const { groups, rest } = useMemo(() => groupByInterest(forYou, picked), [forYou, picked]);
  const emailFor = useMemo(() => new Map(picked.map((i) => [i, emailOffersFor(i, data.opportunities, now)])), [picked, data.opportunities, now]);
  const focused = useMemo(() => {
    if (!focus) return null;
    const seen = new Set<string>();
    const deals = [...forYou, ...popular].filter((d) => d.tags.includes(focus as RankedDeal['tags'][number]) && !seen.has(d.deal.id) && seen.add(d.deal.id));
    return { deals, email: emailFor.get(focus) ?? emailOffersFor(focus, data.opportunities, now) };
  }, [focus, forYou, popular, emailFor, data.opportunities, now]);
  const countFor = (i: string) => (groups.find((g) => g.interest === i)?.deals.length ?? 0) + (emailFor.get(i)?.length ?? 0);

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

  const dealList = (items: typeof forYou, inInterest?: string) => (
    <Panel style={{ paddingVertical: space.xs }}>
      {items.map((x, i) => (
        <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
          <DealRow item={x} inInterest={inInterest} />
        </View>
      ))}
    </Panel>
  );
  const emailList = (offers: typeof data.opportunities) => (
    <Panel style={{ paddingVertical: space.xs }}>
      <Row gap={6} style={{ paddingTop: space.sm }}>
        <Ionicons name="mail-outline" size={13} color={c.textMuted} />
        <T variant="caption" muted>Already yours, from your email</T>
      </Row>
      {offers.map((o, i) => (
        <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
          <OpportunityRow opp={o} now={now} benefit={o.benefit_id ? benefitById.get(o.benefit_id) : undefined} recovered={recoveredByOpp.get(o.id) ?? 0} />
        </View>
      ))}
    </Panel>
  );
  const interestIcon = (i: string) => INTERESTS.find((x) => x.id === i)?.icon;
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

      {country && picked.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
          <Chip label="All" selected={!focus} onPress={() => setFocus(null)} />
          {picked.map((i) => (
            <Chip key={i} label={`${interestLabel(i)}${countFor(i) ? ` · ${countFor(i)}` : ''}`} icon={interestIcon(i)} selected={focus === i} onPress={() => setFocus(focus === i ? null : i)} />
          ))}
        </ScrollView>
      ) : null}

      {focused ? (
        <>
          {focused.email.length ? (
            <View style={{ gap: space.sm }}>
              {emailList(focused.email)}
            </View>
          ) : null}
          {focused.deals.length ? (
            <View style={{ gap: space.sm }}>
              <T variant="heading">Near you</T>
              {dealList(focused.deals, focus!)}
            </View>
          ) : null}
          {!focused.deals.length && !focused.email.length ? (
            <Empty icon={interestIcon(focus!) ?? 'pricetags'} title={`Nothing for ${interestLabel(focus!).toLowerCase()} right now`} body="PerkScan checks stores near you and your email every day. New ones show up here." />
          ) : null}
        </>
      ) : picked.length ? (
        <>
          {groups.map((g) => {
            const email = emailFor.get(g.interest) ?? [];
            if (!g.deals.length && !email.length) return null;
            const more = g.deals.length + email.length > 3;
            return (
              <View key={g.interest} style={{ gap: space.sm }}>
                <SectionHeader title={interestLabel(g.interest)} action={more ? 'See all' : undefined} onAction={more ? () => setFocus(g.interest) : undefined} />
                {email.length ? emailList(email.slice(0, 1)) : null}
                {g.deals.length ? dealList(g.deals.slice(0, email.length ? 2 : 3), g.interest) : null}
              </View>
            );
          })}
          {rest.length ? (
            <View style={{ gap: space.sm }}>
              <T variant="heading">Also for you</T>
              {dealList(rest)}
            </View>
          ) : null}
          {groups.some((g) => !g.deals.length && !(emailFor.get(g.interest) ?? []).length) ? (
            <T variant="caption" muted>
              Nothing yet for {groups.filter((g) => !g.deals.length && !(emailFor.get(g.interest) ?? []).length).map((g) => interestLabel(g.interest).toLowerCase()).join(', ')}. PerkScan checks every day.
            </T>
          ) : null}
        </>
      ) : forYou.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">For you</T>
          {dealList(forYou)}
        </View>
      ) : null}

      {!focused && askToShare ? (
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

      {!focused && comingUp.length ? (
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

      {!focused && popular.length ? (
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
