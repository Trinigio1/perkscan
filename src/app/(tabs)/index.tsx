import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { CreditRow } from '@/components/CreditRow';
import { Hero } from '@/components/Hero';
import { Button, Empty, ErrorNote, IconBubble, Money, Note, Panel, ProgressBar, Row, Screen, SectionHeader, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { computeScore, remainingValue } from '@/domain/score';
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

// Categories that have a data source in this build. Others light up in later phases.
const LIVE = new Set<OpportunityCategory>(['card_credits']);

export default function Home() {
  const c = useColors();
  const { session } = useAuth();
  const { data, error, refresh } = useData();
  const { benefitById, cardById, recoveredByOpp, userCardLabel } = useLookups();
  const [refreshing, setRefreshing] = useState(false);

  const { now, score, upNext, perCard } = useMemo(() => {
    const at = new Date();
    const s = computeScore(data.opportunities, data.recovered, at);
    const open = data.opportunities
      .filter((o) => o.status === 'open' && o.expires_at && new Date(o.expires_at) > at)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
    // Prefer credits that still have value; unverified ones go last.
    const next = [...open].sort((a, b) => Number(a.value_estimate === null) - Number(b.value_estimate === null)).slice(0, 4);
    const cards = data.userCards.map((uc) => ({
      uc,
      available: open.filter((o) => o.user_card_id === uc.id).reduce((sum, o) => sum + remainingValue(o, recoveredByOpp), 0),
    }));
    return { now: at, score: s, upNext: s.atRiskItems.length ? s.atRiskItems.slice(0, 4) : next, perCard: cards };
  }, [data, recoveredByOpp]);

  const name = data.profile?.display_name?.split(' ')[0];
  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const live = score.byCategory.filter((x) => LIVE.has(x.category));
  const soon = score.byCategory.filter((x) => !LIVE.has(x.category));

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

      <Hero>
        <T variant="label" color={c.heroMuted}>You left</T>
        <Money value={score.leftOnTable} size={60} color={c.heroText} animate />
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
          <Money value={score.atRiskThisWeek} size={28} style={{ marginTop: space.xs }} />
          <T variant="caption" muted>at risk this week</T>
        </Panel>
        <Panel style={{ flex: 1 }} onPress={() => router.push('/credits')}>
          <IconBubble icon="trending-up" tone="green" size={34} />
          <Money value={score.recoveredThisYear} size={28} color={c.accentStrong} style={{ marginTop: space.xs }} />
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
          <SectionHeader title={score.atRiskItems.length ? 'Use it before it resets' : 'Up next'} action="See all" onAction={() => router.push('/credits')} />
          <Panel style={{ paddingVertical: space.xs }}>
            {upNext.length === 0 ? (
              <T muted style={{ paddingVertical: space.md }}>You’re all caught up for this period.</T>
            ) : (
              upNext.map((o) => (
                <CreditRow
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
                    {available > 0 ? `${formatMoney(available)} available now` : 'Nothing left this period'}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      )}

      {score.unverifiedCount > 0 ? (
        <Note icon="shield-checkmark-outline">
          {score.unverifiedCount} credit{score.unverifiedCount > 1 ? 's don’t' : ' doesn’t'} have a verified amount yet, so
          {score.unverifiedCount > 1 ? ' they count' : ' it counts'} as $0. We’d rather undercount than guess.
        </Note>
      ) : null}

      <SectionHeader title="Where the money is" />
      <Panel>
        {live.map((cat) => (
          <Row key={cat.category} gap={space.md} style={{ paddingVertical: space.xs }}>
            <IconBubble icon={CATEGORY_ICON[cat.category].icon} tone={CATEGORY_ICON[cat.category].tone} size={36} />
            <T variant="subheading" style={{ flex: 1 }}>{CATEGORY_LABELS[cat.category]}</T>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="label" color={cat.leftOnTable > 0 ? c.danger : c.text}>{formatMoney(cat.leftOnTable)} missed</T>
              <T variant="caption" muted>{formatMoney(cat.available + cat.atRisk)} available</T>
            </View>
          </Row>
        ))}
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
