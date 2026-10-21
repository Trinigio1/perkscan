import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { OpportunityRow } from '@/components/OfferRow';
import { Hero } from '@/components/Hero';
import { Button, Empty, ErrorNote, IconBubble, Money, Note, Panel, ProgressBar, Row, Screen, SectionHeader, T } from '@/components/ui';
import { addToBag, formatBag, formatMoney, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { remainingValue, scoreByCurrency } from '@/domain/score';
import { CATEGORY_LABELS, type OpportunityCategory } from '@/domain/types';
import { greeting, type IconTone } from '@/domain/visuals';
import type { IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const CATEGORY_ICON: Record<OpportunityCategory, { icon: IconName; tone: IconTone }> = {
  card_credits: { icon: 'pricetags', tone: 'green' },
  card_protections: { icon: 'shield-checkmark', tone: 'blue' },
  store_credit_gift_cards: { icon: 'gift', tone: 'pink' },
  promos: { icon: 'ticket', tone: 'orange' },
  points_miles: { icon: 'airplane', tone: 'purple' },
  settlements: { icon: 'document-text', tone: 'teal' },
  student: { icon: 'school', tone: 'purple' },
  returns_trials: { icon: 'return-down-back', tone: 'gray' },
};

// Categories with no data source yet; everything else is live.
const NOT_YET = new Set<OpportunityCategory>(['student']);
const ROUTE: Partial<Record<OpportunityCategory, '/credits' | '/offers'>> = { card_credits: '/credits' };

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);
/** "+ US$35" for amounts in currencies other than the one shown big. */
const others = (bag: MoneyBag, shown: string) => {
  const rest = Object.fromEntries(Object.entries(bag).filter(([cur, v]) => cur !== shown && v > 0));
  return nonZero(rest) ? `+ ${formatBag(rest)}` : null;
};

export default function Home() {
  const c = useColors();
  const { session } = useAuth();
  const { data, error, refresh } = useData();
  const { benefitById, cardById, recoveredByOpp, userCardLabel } = useLookups();
  const [refreshing, setRefreshing] = useState(false);

  const { now, home, score, totals, categories, atRiskItems, unverifiedCount, upNext, perCard } = useMemo(() => {
    const at = new Date();
    const homeCur = data.profile?.home_currency?.trim() || getHomeCurrency();
    // Amounts are never converted: one score per currency, the home currency shown big.
    const scores = scoreByCurrency(data.opportunities, data.recovered, at, homeCur);
    const s = scores[0]!.score;
    const bag = (pick: (x: typeof s) => number) => scores.reduce((b, x) => addToBag(b, x.currency, pick(x.score)), {} as MoneyBag);
    const cats = s.byCategory.map((cat) => {
      const all = scores.map((x) => ({ cur: x.currency, c: x.score.byCategory.find((y) => y.category === cat.category)! }));
      return {
        category: cat.category,
        count: all.reduce((n, x) => n + x.c.count, 0),
        missed: all.reduce((b, x) => addToBag(b, x.cur, x.c.leftOnTable), {} as MoneyBag),
        available: all.reduce((b, x) => addToBag(b, x.cur, x.c.available + x.c.atRisk), {} as MoneyBag),
      };
    });
    const risky = scores.flatMap((x) => x.score.atRiskItems).sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
    const open = data.opportunities
      .filter((o) => o.status === 'open' && o.expires_at && new Date(o.expires_at) > at)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
    // Prefer credits that still have value; unverified ones go last.
    const next = [...open].sort((a, b) => Number(a.value_estimate === null) - Number(b.value_estimate === null)).slice(0, 4);
    const cards = data.userCards.map((uc) => ({
      uc,
      available: open.filter((o) => o.user_card_id === uc.id).reduce((b, o) => addToBag(b, o.currency, remainingValue(o, recoveredByOpp)), {} as MoneyBag),
    }));
    return {
      now: at,
      home: homeCur,
      score: s,
      totals: { left: bag((x) => x.leftOnTable), atRisk: bag((x) => x.atRiskThisWeek), recovered: bag((x) => x.recoveredThisYear) },
      categories: cats,
      atRiskItems: risky,
      unverifiedCount: scores.reduce((n, x) => n + x.score.unverifiedCount, 0),
      upNext: risky.length ? risky.slice(0, 4) : next,
      perCard: cards,
    };
  }, [data, recoveredByOpp]);

  const name = data.profile?.display_name?.split(' ')[0];
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Show credits always, and other categories once something has been found for them.
  const live = categories.filter((x) => x.category === 'card_credits' || (!NOT_YET.has(x.category) && x.count > 0));
  const soon = categories.filter((x) => NOT_YET.has(x.category));
  const emailFound = categories.some((x) => x.category !== 'card_credits' && x.count > 0);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <Row>
        <View style={{ flex: 1 }}>
          <T variant="caption" muted>{greeting(now)}{name ? `, ${name}` : ''}</T>
          <T variant="title">Your money</T>
        </View>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Settings">
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="subheading" color={c.accentStrong}>{(name ?? session?.user.email ?? '?').slice(0, 1).toUpperCase()}</T>
          </View>
        </Pressable>
      </Row>

      {error ? <ErrorNote message={`Couldn’t refresh: ${error}`} /> : null}

      {data.profile && !data.profile.country ? (
        <Panel onPress={() => router.push('/country')}>
          <Row gap={space.md}>
            <IconBubble icon="globe-outline" tone="blue" size={36} />
            <View style={{ flex: 1 }}>
              <T variant="subheading">Where do you live?</T>
              <T variant="caption" muted>Set your country so amounts show in your currency.</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </Row>
        </Panel>
      ) : null}

      <Hero>
        <T variant="label" color={c.heroMuted}>You left</T>
        <Money value={score.leftOnTable} size={60} color={c.heroText} currency={home} animate />
        {others(totals.left, home) ? <T variant="heading" color={c.heroText}>{others(totals.left, home)}</T> : null}
        <T variant="subheading" color={c.heroText}>on the table in {now.getFullYear()}</T>
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          {score.captureRate !== null ? (
            <>
              <Row>
                <T variant="caption" color={c.heroMuted} style={{ flex: 1 }}>Credits you used</T>
                <T variant="label" color={c.heroText}>{Math.round(score.captureRate * 100)}%</T>
              </Row>
              <ProgressBar value={score.captureRate} color={c.heroFill} track={c.heroTrack} />
            </>
          ) : (
            <T variant="caption" color={c.heroMuted}>Counted from the day you added each card. Mark credits as used to see your score.</T>
          )}
        </View>
      </Hero>

      <Row gap={space.md} style={{ alignItems: 'stretch' }}>
        <Panel style={{ flex: 1 }} onPress={() => router.push('/credits')}>
          <IconBubble icon="time" tone="orange" size={34} />
          <Money value={score.atRiskThisWeek} size={28} style={{ marginTop: space.xs }} currency={home} />
          {others(totals.atRisk, home) ? <T variant="caption">{others(totals.atRisk, home)}</T> : null}
          <T variant="caption" muted>at risk this week</T>
        </Panel>
        <Panel style={{ flex: 1 }} onPress={() => router.push('/credits')}>
          <IconBubble icon="trending-up" tone="green" size={34} />
          <Money value={score.recoveredThisYear} size={28} color={c.accentStrong} style={{ marginTop: space.xs }} currency={home} />
          {others(totals.recovered, home) ? <T variant="caption" color={c.accentStrong}>{others(totals.recovered, home)}</T> : null}
          <T variant="caption" muted>recovered this year</T>
        </Panel>
      </Row>

      {data.userCards.length === 0 ? (
        <Empty
          icon="card"
          title="Add your first card"
          body="PerkScan tracks every credit on it and nudges you before the money disappears."
          action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />}
        />
      ) : (
        <>
          <SectionHeader
            title={!atRiskItems.length ? 'Up next' : upNext.every((o) => o.type === 'card_credit') ? 'Use it before it resets' : 'Expiring soon'}
            action="See all"
            onAction={() => router.push(upNext.some((o) => o.type !== 'card_credit') ? '/offers' : '/credits')}
          />
          <Panel style={{ paddingVertical: space.xs }}>
            {upNext.length === 0 ? (
              <T muted style={{ paddingVertical: space.md }}>You’re all caught up for this period.</T>
            ) : (
              upNext.map((o) => (
                <OpportunityRow
                  key={o.id}
                  opp={o}
                  benefit={o.benefit_id ? benefitById.get(o.benefit_id) : undefined}
                  recovered={recoveredByOpp.get(o.id) ?? 0}
                  subtitle={userCardLabel(o.user_card_id)}
                  now={now}
                />
              ))
            )}
          </Panel>

          <SectionHeader title="Your cards" action="Wallet" onAction={() => router.push('/wallet')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingHorizontal: space.lg }}>
            {perCard.map(({ uc, available }) => {
              const card = cardById.get(uc.card_id);
              if (!card) return null;
              return (
                <Pressable key={uc.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })} style={{ width: 220, gap: space.sm }}>
                  <CardArt cardId={card.id} issuer={card.issuer} name={uc.nickname || card.product_name.replace(/®/g, '')} lastFour={uc.last_four} size="md" />
                  <T variant="caption" muted style={{ paddingHorizontal: 2 }}>
                    {nonZero(available) ? `${formatBag(available, card.currency)} available now` : 'Nothing left this period'}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {unverifiedCount > 0 ? (
        <Note icon="shield-checkmark-outline">
          {unverifiedCount} credit{unverifiedCount > 1 ? 's don’t' : ' doesn’t'} have a verified amount yet, so
          {unverifiedCount > 1 ? ' they count' : ' it counts'} as {formatMoney(0, { currency: home })}. We’d rather undercount than guess.
        </Note>
      ) : null}

      <SectionHeader title="Where the money is" />
      <Panel>
        {live.map((cat) => (
          <Pressable key={cat.category} onPress={() => router.push(ROUTE[cat.category] ?? '/offers')}>
            <Row gap={space.md} style={{ paddingVertical: space.xs }}>
              <IconBubble icon={CATEGORY_ICON[cat.category].icon} tone={CATEGORY_ICON[cat.category].tone} size={36} />
              <T variant="subheading" style={{ flex: 1 }}>{CATEGORY_LABELS[cat.category]}</T>
              {cat.category === 'card_protections' ? (
                // Coverage isn't cash, so it never adds to the totals.
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="label">{cat.count} active</T>
                  <T variant="caption" muted>coverage, not cash</T>
                </View>
              ) : (
                <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                  <T variant="label" color={nonZero(cat.missed) ? c.danger : c.text}>{formatBag(cat.missed, home)} missed</T>
                  <T variant="caption" muted>
                    {nonZero(cat.available) ? `${formatBag(cat.available, home)} available` : `${cat.count} active`}
                  </T>
                </View>
              )}
            </Row>
          </Pressable>
        ))}
        {!emailFound ? (
          <Pressable onPress={() => router.push('/connect-gmail')}>
            <Row gap={space.md} style={{ paddingVertical: space.xs }}>
              <IconBubble icon="mail" tone="blue" size={36} />
              <View style={{ flex: 1 }}>
                <T variant="subheading">Promos, gift cards & trials</T>
                <T variant="caption" muted>Connect Gmail to find them</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
            </Row>
          </Pressable>
        ) : null}
        <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.sm }} />
        <Row style={{ alignItems: 'flex-start' }}>
          <Ionicons name="sparkles" size={14} color={c.textFaint} style={{ marginTop: 2 }} />
          <T variant="caption" muted style={{ flex: 1 }}>
            Coming soon: {soon.map((cat) => CATEGORY_LABELS[cat.category]).join(' · ')}
          </T>
        </Row>
      </Panel>
    </Screen>
  );
}
