import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ArrivalCheck } from '@/components/Claims';
import { DealRow } from '@/components/DealRow';
import { Found, NextStep, Tour } from '@/components/FirstRun';
import { Hero } from '@/components/Hero';
import { OpportunityRow } from '@/components/OfferRow';
import { Chip, ErrorNote, Money, Panel, Row, Screen, SectionHeader, T, type IconName } from '@/components/ui';
import { claimsToCheck } from '@/domain/claims';
import { foundSummary, nextStep, toCheckCount } from '@/domain/firstRun';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { nextToUse, setupSteps } from '@/domain/money';
import { scoreByCurrency } from '@/domain/score';
import { greeting } from '@/domain/visuals';
import { useData, useLookups } from '@/lib/data';
import { useDeals } from '@/lib/deals';
import { useDismissed } from '@/lib/suggestions';
import { font, space, useColors } from '@/theme';

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);
/** "+ US$35" for amounts in currencies other than the one shown big. */
const others = (bag: MoneyBag, shown: string) => {
  const rest = Object.fromEntries(Object.entries(bag).filter(([cur, v]) => cur !== shown && v > 0));
  return nonZero(rest) ? `+ ${formatBag(rest)}` : null;
};

const EXPLORE: { icon: IconName; label: string; href: Href }[] = [
  { icon: 'search', label: 'Hidden money', href: '/hidden-money' },
  { icon: 'airplane', label: 'Card perks', href: '/perks' },
  { icon: 'card', label: 'Your cards', href: '/cards' },
  { icon: 'storefront', label: 'Before you pay', href: '/checkout' },
  { icon: 'add', label: 'Add', href: '/add' },
];

/** Home: your total, the one next thing to do, what to use soon, and deals for you. */
export default function Home() {
  const c = useColors();
  const { data, error, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, dismiss, dismissedLoaded] = useDismissed();
  const deals = useDeals();
  // Matched deals first; a couple of popular ones if nothing matches yet.
  const topDeals = (deals.forYou.length ? deals.forYou : deals.popular).slice(0, 3);
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);

  const { now, home, totals, soon, toCheck, found, arrivals } = useMemo(() => {
    const at = new Date();
    const homeCur = data.profile?.home_currency?.trim() || getHomeCurrency();
    // Amounts are never converted: one score per currency, the home currency shown big.
    const scores = scoreByCurrency(data.opportunities, data.recovered, at, homeCur);
    const bag = (pick: (s: (typeof scores)[number]['score']) => number) => scores.reduce((b, x) => addToBag(b, x.currency, pick(x.score)), {} as MoneyBag);
    return {
      now: at,
      home: homeCur,
      totals: {
        ready: bag((s) => s.available + s.atRiskThisWeek),
        week: bag((s) => s.atRiskThisWeek),
        used: bag((s) => s.recoveredThisYear),
        missed: bag((s) => s.leftOnTable),
      },
      soon: nextToUse(data.opportunities, at, 4, statusOf),
      toCheck: toCheckCount(data.opportunities, at, statusOf),
      found: foundSummary(data.opportunities),
      arrivals: claimsToCheck(data.opportunities, at),
    };
  }, [data, statusOf]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const name = data.profile?.display_name?.split(' ')[0];
  const step = nextStep(setupSteps(data));
  // Show the biggest pile big when nothing is in the home currency.
  const big = (totals.ready[home] ?? 0) > 0 || !nonZero(totals.ready) ? home : Object.entries(totals.ready).sort((a, b) => b[1] - a[1])[0]![0];
  // Nothing confirmed yet but perks to check: say that, instead of a discouraging $0.
  const checkFirst = !nonZero(totals.ready) && toCheck > 0;
  const quiet = !nonZero(totals.week) && !nonZero(totals.used) && !nonZero(totals.missed);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T variant="title">{greeting(now)}{name ? `, ${name}` : ''}</T>
      {error ? <ErrorNote message={error} /> : null}

      <Hero>
        {/* The headline opens Money; the three small numbers below are their own buttons (never nested). */}
        <Pressable onPress={() => router.push('/money')} accessibilityRole="button" style={({ pressed }) => ({ gap: space.xs, opacity: pressed ? 0.8 : 1 })}>
          {checkFirst ? (
            <>
              <T variant="label" color={c.heroMuted}>Perks to check</T>
              <Text style={{ fontSize: 56, fontFamily: font.heavy, letterSpacing: -2, color: c.heroText }}>{toCheck}</Text>
              <T variant="caption" color={c.heroText}>Your cards may include these. Confirm the amounts to add them to your total.</T>
            </>
          ) : (
            <>
              <T variant="label" color={c.heroMuted}>Ready to use</T>
              <Money value={totals.ready[big] ?? 0} size={56} color={c.heroText} currency={big} animate />
              {others(totals.ready, big) ? <T variant="subheading" color={c.heroText}>{others(totals.ready, big)}</T> : null}
              {toCheck > 0 ? <T variant="caption" color={c.heroMuted}>+ {toCheck} more to check</T> : null}
            </>
          )}
        </Pressable>
        {/* The three small numbers only once there's something in them. */}
        {quiet ? null : (
          <Row gap={0} style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: c.heroTrack, paddingTop: space.md }}>
            <Stat label="This week" value={totals.week} home={big} onPress={() => router.push('/at-risk')} />
            <Stat label="Used" value={totals.used} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'used' } })} />
            <Stat label="Missed" value={totals.missed} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'missed' } })} />
          </Row>
        )}
      </Hero>

      {arrivals[0] ? <ArrivalCheck opp={arrivals[0]} /> : null}
      {dismissedLoaded && !dismissed.has('tour') ? <Tour onDone={() => dismiss('tour')} /> : null}
      {step ? <NextStep step={step} /> : null}
      {dismissedLoaded && found.total > 0 && !dismissed.has('found') ? <Found summary={found} onDone={() => dismiss('found')} /> : null}

      <SectionHeader title="Use soon" action="See all" onAction={() => router.push('/money')} />
      {soon.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {soon.map((o, i) => (
            <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
              <OpportunityRow
                opp={o}
                benefit={o.benefit_id ? benefitById.get(o.benefit_id) : undefined}
                recovered={recoveredByOpp.get(o.id) ?? 0}
                subtitle={userCardLabel(o.user_card_id) || undefined}
                now={now}
              />
            </View>
          ))}
        </Panel>
      ) : (
        <T muted>{step ? 'Credits and offers will show up here.' : 'Nothing expiring soon.'}</T>
      )}

      {data.profile?.country ? (
        <>
          <SectionHeader title={deals.forYou.length || !topDeals.length ? 'Deals for you' : 'Deals near you'} action="See all" onAction={() => router.push('/deals')} />
          {topDeals.length ? (
            <Panel style={{ paddingVertical: space.xs }}>
              {topDeals.map((x, i) => (
                <View key={x.deal.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                  <DealRow item={x} />
                </View>
              ))}
            </Panel>
          ) : (
            <T muted>PerkScan checks stores near you every day. New deals show up here.</T>
          )}
        </>
      ) : null}

      <View style={{ gap: space.sm }}>
        <T variant="overline" muted>Explore</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
          {EXPLORE.map((e) => (
            <Chip key={e.label} label={e.label} icon={e.icon} onPress={() => router.push(e.href)} />
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

/** One of the three small numbers under the headline. */
function Stat({ label, value, home, onPress }: { label: string; value: MoneyBag; home: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })}>
      <T variant="caption" color={c.heroMuted}>{label}</T>
      <T variant="subheading" color={c.heroText} numberOfLines={2}>{formatBag(value, home)}</T>
    </Pressable>
  );
}
