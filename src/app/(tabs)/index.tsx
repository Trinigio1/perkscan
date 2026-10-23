import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { EventRow, SuggestionRow } from '@/components/ComingUp';
import { Hero } from '@/components/Hero';
import { OpportunityRow } from '@/components/OfferRow';
import { ErrorNote, IconBubble, Money, Panel, Row, Screen, SectionHeader, T, type IconName } from '@/components/ui';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { nextToUse, setupSteps } from '@/domain/money';
import { scoreByCurrency } from '@/domain/score';
import { greeting, type IconTone } from '@/domain/visuals';
import { myEvents, useData, useLookups } from '@/lib/data';
import { useSuggestions } from '@/lib/suggestions';
import { space, useColors } from '@/theme';

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);
/** "+ US$35" for amounts in currencies other than the one shown big. */
const others = (bag: MoneyBag, shown: string) => {
  const rest = Object.fromEntries(Object.entries(bag).filter(([cur, v]) => cur !== shown && v > 0));
  return nonZero(rest) ? `+ ${formatBag(rest)}` : null;
};

export default function Home() {
  const c = useColors();
  const { data, error, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const [refreshing, setRefreshing] = useState(false);
  const { list: forYou, hide } = useSuggestions();

  const { now, home, totals, soon } = useMemo(() => {
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
      soon: nextToUse(data.opportunities, at, 4, (id) => benefitById.get(id)?.status),
    };
  }, [data, benefitById]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Coming up: dated events near you first, then things you probably qualify for.
  const events = useMemo(() => myEvents(data), [data]);
  const comingUp = [...events.map((e) => ({ kind: 'event' as const, e })), ...forYou.map((sug) => ({ kind: 'suggestion' as const, sug }))].slice(0, 4);

  const name = data.profile?.display_name?.split(' ')[0];
  const steps = setupSteps(data);
  const settingUp = steps.some((s) => !s.done);
  // Show the biggest pile big when nothing is in the home currency.
  const big = (totals.ready[home] ?? 0) > 0 || !nonZero(totals.ready) ? home : Object.entries(totals.ready).sort((a, b) => b[1] - a[1])[0]![0];
  const actions: { icon: IconName; tone: IconTone; label: string; href: Href }[] = [
    { icon: 'add', tone: 'green', label: 'Add', href: '/add' },
    { icon: 'search', tone: 'orange', label: 'Hidden money', href: '/hidden-money' },
    { icon: 'airplane', tone: 'blue', label: 'Card perks', href: '/perks' },
    { icon: 'storefront', tone: 'teal', label: 'Before you pay', href: '/checkout' },
  ];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <T variant="title">{greeting(now)}{name ? `, ${name}` : ''}</T>
      {error ? <ErrorNote message={error} /> : null}

      <Hero>
        <T variant="label" color={c.heroMuted}>Ready to use</T>
        <Money value={totals.ready[big] ?? 0} size={56} color={c.heroText} currency={big} animate />
        {others(totals.ready, big) ? <T variant="subheading" color={c.heroText}>{others(totals.ready, big)}</T> : null}
        <Row gap={0} style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: c.heroTrack, paddingTop: space.md }}>
          <Stat label="This week" value={totals.week} home={big} onPress={() => router.push('/at-risk')} />
          <Stat label="Used" value={totals.used} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'used' } })} />
          <Stat label="Missed" value={totals.missed} home={big} onPress={() => router.push({ pathname: '/money', params: { view: 'missed' } })} />
        </Row>
      </Hero>

      {settingUp ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Get set up</T>
          {steps.map((s) => (
            <Pressable key={s.id} disabled={s.done} onPress={() => router.push(s.route)} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Row gap={space.md} style={{ paddingVertical: space.xs }}>
                <Ionicons name={s.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={s.done ? c.accent : c.textFaint} />
                <T style={{ flex: 1 }} color={s.done ? c.textMuted : c.text}>{s.title}</T>
                {s.done ? null : <Ionicons name="chevron-forward" size={18} color={c.textFaint} />}
              </Row>
            </Pressable>
          ))}
        </Panel>
      ) : null}

      <Row gap={space.sm}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => router.push(a.href)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: space.xs, paddingVertical: space.md, paddingHorizontal: 4, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, opacity: pressed ? 0.7 : 1 })}
          >
            <IconBubble icon={a.icon} tone={a.tone} size={40} />
            <T variant="caption" center numberOfLines={2}>{a.label}</T>
          </Pressable>
        ))}
      </Row>

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
        <T muted>{settingUp ? 'Credits and offers will show up here.' : 'Nothing expiring soon.'}</T>
      )}

      {comingUp.length ? (
        <>
          <SectionHeader title="Coming up" action="See all" onAction={() => router.push('/coming-up')} />
          <Panel style={{ paddingVertical: space.xs }}>
            {comingUp.map((item, i) => (
              <View key={item.kind === 'event' ? item.e.id : item.sug.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                {item.kind === 'event' ? <EventRow e={item.e} /> : <SuggestionRow s={item.sug} onHide={() => hide(item.sug.id)} />}
              </View>
            ))}
          </Panel>
        </>
      ) : null}

      {data.opportunities.length ? (
        <Row gap={space.lg} style={{ justifyContent: 'center' }}>
          <Pressable onPress={() => router.push('/recap')} hitSlop={8}>
            <T variant="label" color={c.accent}>{now.toLocaleDateString('en-US', { month: 'long' })} recap</T>
          </Pressable>
          <Pressable onPress={() => router.push('/share')} hitSlop={8}>
            <T variant="label" color={c.accent}>Share my total</T>
          </Pressable>
        </Row>
      ) : null}
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
