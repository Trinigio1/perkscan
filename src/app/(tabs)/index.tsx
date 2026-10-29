import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { ArrivalCheck, UsedCheck } from '@/components/Claims';
import { DealRow } from '@/components/DealRow';
import { Found, NextStep, Tour } from '@/components/FirstRun';
import { Hero } from '@/components/Hero';
import { MembershipNudge, PayingTwicePanel } from '@/components/PayingTwice';
import { SpottedCardPanel, useSpottedCards } from '@/components/SpottedCards';
import { OpportunityRow } from '@/components/OfferRow';
import { Chip, ErrorNote, Money, Panel, Row, Screen, SectionHeader, T, type IconName } from '@/components/ui';
import { claimsToCheck } from '@/domain/claims';
import { dealsWorth, discountSummary } from '@/domain/estimate';
import { foundMoney, nextStep, toCheckCount, worthCelebrating } from '@/domain/firstRun';
import { addToBag, formatBag, getHomeCurrency, sumBags, type MoneyBag } from '@/domain/format';
import { nextToUse, owedToYou, setupSteps } from '@/domain/money';
import { includedWhenYouNeedIt, includedWorth } from '@/domain/included';
import { scoreByCurrency } from '@/domain/score';
import { usedQuestions } from '@/domain/usedFromReceipts';
import { greeting } from '@/domain/visuals';
import { useData, useLookups } from '@/lib/data';
import { useDeals } from '@/lib/deals';
import { useMembershipHints, useMySubscriptions } from '@/lib/memberships';
import { useRelevance } from '@/lib/relevance';
import { openStudentOffers } from '@/domain/suggestions';
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
  { icon: 'mail-open', label: 'What PerkScan read', href: '/inbox' },
  { icon: 'repeat', label: 'Subscriptions', href: '/subscriptions' },
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
  // Cards the inbox shows you hold but you haven't added: each one unlocks more perks.
  const spotted = useSpottedCards();
  // Memberships: nudge until they've added one, or when receipts show one they pay for.
  const hints = useMembershipHints();
  const hasMembership = data.userCards.some((u) => data.cards.find((c) => c.id === u.card_id)?.kind === 'membership');
  const showMembershipNudge = !!data.profile?.onboarded_at && (hints.length > 0 || !hasMembership);
  const membershipNudgeKey = `memberships:${hints[0]?.membershipId ?? 'general'}`;
  // Matched deals first; a couple of popular ones if nothing matches yet.
  const topDeals = (deals.forYou.length ? deals.forYou : deals.popular).slice(0, 3);
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);
  const { relevanceOf } = useRelevance();

  const { now, home, totals, owed, soon, toCheck, found, arrivals, discounts, usedAsks } = useMemo(() => {
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
      // Refunds, price drops and settlements: part of "ready", shown on their own line first.
      owed: owedToYou(data.opportunities, at, recoveredByOpp, statusOf),
      soon: nextToUse(data.opportunities, at, 4, statusOf, relevanceOf),
      toCheck: toCheckCount(data.opportunities, at, statusOf),
      found: foundMoney(data.opportunities, data.recovered, at, statusOf),
      arrivals: claimsToCheck(data.opportunities, at),
      // A receipt showed a discount that might be one of your offers.
      usedAsks: usedQuestions(data.opportunities, data.receipts),
      // Not money in hand: codes at stores you buy from, worth what you usually spend there times the percent.
      discounts: discountSummary(data.opportunities.filter((o) => relevanceOf(o) === 0), data.receipts, at),
    };
  }, [data, recoveredByOpp, statusOf, relevanceOf]);
  // Student perks: free software, music and Prime prices that come with a school email.
  const studentPerks = data.profile?.is_student || data.school ? openStudentOffers({ studentOffers: data.studentOffers, studentClaims: data.studentClaims, school: data.school, country: data.profile?.country ?? null }).length : 0;
  // Subscriptions where a checked student price is cheaper than what the receipts show.
  const studentSavings = useMySubscriptions().filter((x) => x.student);
  const studentYearly = studentSavings.reduce((b, x) => addToBag(b, x.student!.currency, x.student!.savesYearly), {} as MoneyBag);
  // Deals matched to you: stated amounts off, or a percent of your usual spend at that store.
  const dealsFor = useMemo(() => dealsWorth(deals.forYou, data.receipts, now, home), [deals.forYou, data.receipts, now, home]);
  // "Save up to": money in hand, plus estimated discounts at your stores, deals for you and cheaper
  // student plans. Each part is its own line underneath, so it's clear what's sure and what's an estimate.
  // Card and membership perks: credits you get back when you pay (up to their amount), and perks with a yearly worth.
  const perks = useMemo(() => includedWorth(includedWhenYouNeedIt(data.userCards, data.cards, data.benefits)), [data.userCards, data.cards, data.benefits]);
  // Ready to use, without what's owed (that has its own line), so no amount shows twice.
  const readyToUse = Object.fromEntries(Object.entries(totals.ready).map(([cur, v]) => [cur, Math.max(0, v - (owed.total[cur] ?? 0))])) as MoneyBag;
  const saveUpTo = sumBags(totals.ready, discounts.estimated, dealsFor.worth, studentYearly, perks.total);

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
  const big = (saveUpTo[home] ?? 0) > 0 || !nonZero(saveUpTo) ? home : Object.entries(saveUpTo).sort((a, b) => b[1] - a[1])[0]![0];
  // Nothing to save yet but perks to check: say that, instead of a discouraging $0.
  const checkFirst = !nonZero(saveUpTo) && toCheck > 0;
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
              <T variant="label" color={c.heroMuted}>Save up to</T>
              <Money value={saveUpTo[big] ?? 0} size={56} color={c.heroText} currency={big} animate />
              {others(saveUpTo, big) ? <T variant="subheading" color={c.heroText}>{others(saveUpTo, big)}</T> : null}
            </>
          )}
        </Pressable>
        {/* What the headline is made of: what's sure first, then the estimates (≈). */}
        <ExtraLine
          show={owed.count > 0}
          text={nonZero(owed.total) ? `${formatBag(owed.total, big)} owed to you · ${owed.count} to ask for` : `${owed.count} refund${owed.count === 1 ? '' : 's'} owed to you`}
          onPress={() => router.push('/money')}
        />
        <ExtraLine show={nonZero(readyToUse)} text={`${formatBag(readyToUse, big)} ready to use now`} onPress={() => router.push('/money')} />
        <ExtraLine
          show={nonZero(discounts.estimated) || discounts.otherCount > 0}
          text={
            nonZero(discounts.estimated)
              ? `≈ ${formatBag(discounts.estimated, big)} off at stores you use · ${discounts.estimatedCount} code${discounts.estimatedCount === 1 ? '' : 's'}`
              : `${discounts.otherCount} code${discounts.otherCount === 1 ? '' : 's'} at stores you use${discounts.bestPercent ? ` · up to ${discounts.bestPercent}% off` : ''}`
          }
          onPress={() => router.push('/money')}
        />
        <ExtraLine
          show={dealsFor.total > 0}
          text={nonZero(dealsFor.worth) ? `≈ ${formatBag(dealsFor.worth, big)} in deals for you · ${dealsFor.total} deal${dealsFor.total === 1 ? '' : 's'}` : `${dealsFor.total} deal${dealsFor.total === 1 ? '' : 's'} for you`}
          onPress={() => router.push('/deals')}
        />
        <ExtraLine
          show={nonZero(perks.total)}
          text={`≈ ${formatBag(perks.total, big)} in card & membership perks · ${perks.count} perk${perks.count === 1 ? '' : 's'}`}
          onPress={() => router.push('/money')}
        />
        <ExtraLine show={nonZero(studentYearly)} text={`${formatBag(studentYearly, big)} a year with student prices`} onPress={() => router.push('/subscriptions')} />
        <ExtraLine show={studentPerks > 0} text={`+ ${studentPerks} student perk${studentPerks === 1 ? '' : 's'} for you`} onPress={() => router.push('/student')} />
        {!checkFirst && toCheck > 0 ? <T variant="caption" color={c.heroMuted} style={{ marginTop: space.xs }}>{toCheck} more to check before they count</T> : null}
        {/* The three small numbers only once there's something in them. */}
        {quiet ? null : (
          <Row gap={0} style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: c.heroTrack, paddingTop: space.md }}>
            <Stat label="This week" value={totals.week} home={big} onPress={() => router.push('/at-risk')} />
            <Stat label="Saved" value={totals.used} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'used' } })} />
            <Stat label="Missed" value={totals.missed} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'missed' } })} />
          </Row>
        )}
      </Hero>

      {usedAsks[0] ? <UsedCheck question={usedAsks[0]} /> : null}
      {arrivals[0] ? <ArrivalCheck opp={arrivals[0]} /> : null}
      {dismissedLoaded && !dismissed.has('tour') ? <Tour onDone={() => dismiss('tour')} /> : null}
      {step ? <NextStep step={step} /> : null}
      {spotted[0] ? <SpottedCardPanel spotted={spotted[0]} more={spotted.length - 1} /> : null}
      <PayingTwicePanel />
      {studentSavings.length ? (
        <Panel onPress={() => router.push('/subscriptions')} style={{ gap: 4 }}>
          <T variant="caption" color={c.accentStrong}>Your subscriptions</T>
          <T variant="subheading">
            Save {formatBag(studentSavings.reduce((b, x) => addToBag(b, x.student!.currency, x.student!.savesYearly), {} as MoneyBag))} a year with student prices
          </T>
          <T variant="caption" muted>{studentSavings.map((x) => x.name).join(', ')}: you pay the full price, and you qualify for the student plan.</T>
        </Panel>
      ) : null}
      {dismissedLoaded && showMembershipNudge && !dismissed.has(membershipNudgeKey) ? <MembershipNudge onHide={() => dismiss(membershipNudgeKey)} /> : null}
      {dismissedLoaded && celebrate && !dismissed.has('found') ? <Found found={found} home={home} onDone={() => dismiss('found')} /> : null}

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

/** A line under the headline for what isn't in it: estimated discounts, deals for you. */
function ExtraLine({ show, text, onPress }: { show: boolean; text: string; onPress: () => void }) {
  const c = useColors();
  if (!show) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4} style={({ pressed }) => ({ marginTop: space.xs, opacity: pressed ? 0.6 : 1 })}>
      <T variant="label" color={c.heroText}>{text} ›</T>
    </Pressable>
  );
}
