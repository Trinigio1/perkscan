import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { ArrivalCheck } from '@/components/Claims';
import { EventRow } from '@/components/ComingUp';
import { DealRow } from '@/components/DealRow';
import { Found, NextStep, Tour } from '@/components/FirstRun';
import { Hero } from '@/components/Hero';
import { OpportunityRow } from '@/components/OfferRow';
import { ErrorNote, Money, Panel, Row, Screen, SectionHeader, T } from '@/components/ui';
import { claimsToCheck } from '@/domain/claims';
import { foundMoney, nextStep, toCheckCount, worthCelebrating } from '@/domain/firstRun';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { setupSteps } from '@/domain/money';
import { actNow, type ActItem } from '@/domain/priority';
import { scoreByCurrency } from '@/domain/score';
import { greeting } from '@/domain/visuals';
import { track } from '@/lib/analytics';
import { myEvents, useData, useLookups } from '@/lib/data';
import { useStoreOffers } from '@/lib/deals';
import { useDismissed } from '@/lib/suggestions';
import { font, space, useColors } from '@/theme';

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);
/** "+ US$35" for amounts in currencies other than the one shown big. */
const others = (bag: MoneyBag, shown: string) => {
  const rest = Object.fromEntries(Object.entries(bag).filter(([cur, v]) => cur !== shown && v > 0));
  return nonZero(rest) ? `+ ${formatBag(rest)}` : null;
};
const key = (x: ActItem) => (x.kind === 'item' ? x.opp.id : x.kind === 'offer' ? `deal-${x.deal.id}` : `event-${x.event.id}`);

/**
 * Home: what's ready for you, what you've recovered, what's at risk — then the few things worth
 * doing now, ranked by one rule (urgency, value, ease, confidence) across everything PerkScan found.
 */
export default function Home() {
  const c = useColors();
  const { data, error, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const offers = useStoreOffers();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, dismiss, dismissedLoaded] = useDismissed();
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);

  const { now, home, totals, act, toCheck, found, arrivals, benefits } = useMemo(() => {
    const at = new Date();
    const homeCur = data.profile?.home_currency?.trim() || getHomeCurrency();
    // Amounts are never converted: one score per currency, the home currency shown big.
    const scores = scoreByCurrency(data.opportunities, data.recovered, at, homeCur);
    const bag = (pick: (s: (typeof scores)[number]['score']) => number) => scores.reduce((b, x) => addToBag(b, x.currency, pick(x.score)), {} as MoneyBag);
    // Benefits with no cash value (lounges, insurance, status): counted, never priced.
    const myCards = new Set(data.userCards.map((u) => u.card_id));
    return {
      now: at,
      home: homeCur,
      totals: {
        ready: bag((s) => s.available + s.atRiskThisWeek),
        atRisk: bag((s) => s.atRiskThisWeek),
        recovered: bag((s) => s.recoveredThisYear),
      },
      act: actNow({ opportunities: data.opportunities, recoveredByOpp, offers, events: myEvents(data), statusOf }, at),
      toCheck: toCheckCount(data.opportunities, at, statusOf),
      found: foundMoney(data.opportunities, data.recovered, at, statusOf),
      arrivals: claimsToCheck(data.opportunities, at),
      benefits: data.benefits.filter((b) => b.type !== 'credit' && b.status === 'active' && myCards.has(b.card_id)).length,
    };
  }, [data, recoveredByOpp, offers, statusOf]);

  // The "We found $X" moment: opens by itself once, the first time there's something to show after setup.
  const celebrate = worthCelebrating(found) && !!data.profile?.onboarded_at;
  useEffect(() => {
    if (!dismissedLoaded || !celebrate || dismissed.has('found_seen')) return;
    dismiss('found_seen');
    router.push({ pathname: '/found', params: { first: '1' } });
  }, [dismissedLoaded, celebrate, dismissed, dismiss]);

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

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T variant="title">{greeting(now)}{name ? `, ${name}` : ''}</T>
      {error ? <ErrorNote message={error} /> : null}

      <Hero>
        {/* The headline opens Activity; the numbers below are their own buttons (never nested). */}
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
        <Row gap={0} style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: c.heroTrack, paddingTop: space.md }}>
          <Stat label="Recovered" value={formatBag(totals.recovered, big)} onPress={() => router.push({ pathname: '/money', params: { view: 'used' } })} />
          <Stat label="At risk" value={formatBag(totals.atRisk, big)} warn={nonZero(totals.atRisk)} onPress={() => router.push('/at-risk')} />
          {benefits > 0 ? <Stat label="Benefits" value={`+${benefits}`} onPress={() => router.push('/perks')} /> : null}
        </Row>
      </Hero>

      {arrivals[0] ? <ArrivalCheck opp={arrivals[0]} /> : null}
      {dismissedLoaded && !dismissed.has('tour') ? <Tour onDone={() => dismiss('tour')} /> : null}
      {step ? <NextStep step={step} /> : null}
      {dismissedLoaded && celebrate && !dismissed.has('found') ? <Found found={found} home={home} onDone={() => dismiss('found')} /> : null}

      <SectionHeader title="Act now" action="See all" onAction={() => router.push('/money')} />
      {act.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {act.map((x, i) => (
            <View
              key={key(x)}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}
              onTouchStart={() => track('act_now_tapped', { kind: x.kind, position: i + 1 })}
            >
              {x.kind === 'item' ? (
                <OpportunityRow
                  opp={x.opp}
                  benefit={x.opp.benefit_id ? benefitById.get(x.opp.benefit_id) : undefined}
                  recovered={recoveredByOpp.get(x.opp.id) ?? 0}
                  subtitle={userCardLabel(x.opp.user_card_id) || undefined}
                  now={now}
                />
              ) : x.kind === 'offer' ? (
                <DealRow item={{ deal: x.deal, why: x.why, score: x.score }} />
              ) : (
                <EventRow e={x.event} />
              )}
            </View>
          ))}
        </Panel>
      ) : (
        <Panel>
          <T muted>{step ? 'Credits, codes and refunds you can use will show up here, most urgent first.' : 'Nothing needs you right now. PerkScan will tell you when something is about to expire.'}</T>
        </Panel>
      )}
    </Screen>
  );
}

/** One of the small numbers under the headline. */
function Stat({ label, value, warn, onPress }: { label: string; value: string; warn?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.6 : 1 })}>
      <T variant="caption" color={c.heroMuted}>{label}</T>
      <T variant="subheading" color={warn ? c.warn : c.heroText} numberOfLines={2}>{value}</T>
    </Pressable>
  );
}
