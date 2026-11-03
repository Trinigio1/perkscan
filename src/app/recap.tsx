import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Hero } from '@/components/Hero';
import { KnewCheck, useMonthValue } from '@/components/MonthValue';
import { Button, Panel, Row, Screen, T } from '@/components/ui';
import { monthlyRecap } from '@/domain/digest';
import { formatBag, formatMoney, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { membershipSavingsIn } from '@/domain/paidFor';
import { knewQuestions, PLAN } from '@/domain/monthValue';
import { savedBySource, spottedOnReceipts } from '@/domain/proof';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { space, useColors } from '@/theme';

const nonZero = (b: MoneyBag) => Object.values(b).some((v) => v > 0);

/** "You recovered $X this month": what you used, what you missed, and last month for comparison. */
export default function Recap() {
  const c = useColors();
  const { data } = useData();
  // The 1st-of-the-month notification opens last month's recap.
  const params = useLocalSearchParams<{ offset?: string }>();
  const [offset, setOffset] = useState(Math.min(0, Math.max(-24, Number(params.offset) || 0))); // 0 = this month, -1 = last month, ...
  useEffect(() => track('recap_viewed'), []);
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  const { month, r, sources, spotted, members } = useMemo(() => {
    const now = new Date();
    const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const memberships = data.userCards.map((u) => data.cards.find((c) => c.id === u.card_id)).filter((c) => c?.kind === 'membership').map((c) => c!.id);
    return {
      month: m,
      r: monthlyRecap(data.opportunities, data.recovered, m, now),
      sources: savedBySource(data.opportunities, data.recovered, m, end),
      spotted: spottedOnReceipts(data.recovered, m, end),
      // The membership's own savings on receipts: real, but not PerkScan's doing, so never in the total.
      members: membershipSavingsIn(data.discountReceipts, memberships, home, m, end),
    };
  }, [data, offset, home]);
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // Of what you used, what you didn't know about before PerkScan, by your own answers.
  const v = useMonthValue(offset);
  const toAnswer = useMemo(
    () => knewQuestions(data.recovered, data.opportunities, new Date(), 400).filter((q) => new Date(q.recovered.recovered_at) >= v.from && new Date(q.recovered.recovered_at) < v.to),
    [data.recovered, data.opportunities, v.from, v.to],
  );

  return (
    <Screen edges={[]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => setOffset(offset - 1)} hitSlop={10} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={22} color={c.text} />
        </Pressable>
        <T variant="heading">{label}</T>
        <Pressable onPress={() => offset < 0 && setOffset(offset + 1)} hitSlop={10} accessibilityLabel="Next month" disabled={offset >= 0}>
          <Ionicons name="chevron-forward" size={22} color={offset >= 0 ? c.textFaint : c.text} />
        </Pressable>
      </Row>

      <Hero>
        <T variant="label" color={c.heroMuted}>You recovered</T>
        <T variant="display" color={c.heroText}>{formatBag(r.recovered, home)}</T>
        <T color={c.heroText}>
          {offset === 0 ? 'this month' : `in ${month.toLocaleDateString('en-US', { month: 'long' })}`}
          {r.recoveredCount ? ` from ${r.recoveredCount} thing${r.recoveredCount === 1 ? '' : 's'}` : ''}
        </T>
        {nonZero(r.previousRecovered) ? (
          <T variant="caption" color={c.heroMuted}>The month before: {formatBag(r.previousRecovered, home)}</T>
        ) : null}
      </Hero>

      {nonZero(v.used) || nonZero(v.newValue) ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Found by PerkScan</T>
          <Row>
            <T style={{ flex: 1 }}>New money for you</T>
            <T variant="label">{formatBag(v.newValue, home)}</T>
          </Row>
          <Row>
            <T style={{ flex: 1 }}>You didn’t know about</T>
            <T variant="label" color={c.accentStrong}>{formatBag(v.found, home)}</T>
          </Row>
          <Row>
            <T style={{ flex: 1 }} muted>You already knew about</T>
            <T variant="label" color={c.textMuted}>{formatBag(v.knew, home)}</T>
          </Row>
          {v.plan === 'plus' && v.paidFor ? (
            <T color={c.accentStrong}>Your {PLAN.name} plan paid for itself {v.paidFor}× {offset === 0 ? 'this month' : 'that month'}.</T>
          ) : null}
          {toAnswer.length ? (
            <View style={{ gap: space.md, marginTop: space.xs }}>
              <T variant="caption" muted>Did you know about these before PerkScan? Only what you didn’t know counts as found.</T>
              {toAnswer.slice(0, 5).map((q) => <KnewCheck key={q.recovered.id} q={q} compact />)}
            </View>
          ) : null}
        </Panel>
      ) : null}

      {sources.length > 1 ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Where it came from</T>
          {sources.map((l) => (
            <Row key={l.kind}>
              <T style={{ flex: 1 }}>{l.label}</T>
              <T variant="caption" muted>{l.count}×</T>
              <T variant="label" style={{ minWidth: 72, textAlign: 'right' }}>{formatBag(l.total, home)}</T>
            </Row>
          ))}
          {spotted ? <T variant="caption" muted>{spotted} spotted on your receipts by PerkScan, no tapping needed.</T> : null}
        </Panel>
      ) : spotted ? (
        <T variant="caption" muted>{spotted} spotted on your receipts by PerkScan, no tapping needed.</T>
      ) : null}

      {r.used.length ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">What you used</T>
          {r.used.slice(0, 10).map((u, i) => (
            <Row key={`${u.title}-${i}`}>
              <Ionicons name="checkmark-circle" size={16} color={c.accent} />
              <T style={{ flex: 1 }} numberOfLines={1}>{u.title}</T>
              <T variant="label">{formatMoney(u.amount, { currency: u.currency })}</T>
            </Row>
          ))}
        </Panel>
      ) : (
        <T muted>Nothing marked as used {offset === 0 ? 'yet this month' : 'that month'}. Mark credits and offers as used when you use them.</T>
      )}

      <Panel style={{ gap: 4 }}>
        <T variant="subheading">Left on the table</T>
        {r.missedCount ? (
          <T color={c.danger}>{formatBag(r.missed, home)} from {r.missedCount} thing{r.missedCount === 1 ? '' : 's'} that expired unused</T>
        ) : (
          <T muted>Nothing with a dollar value expired unused. Nice.</T>
        )}
      </Panel>

      {members.total > 0 ? (
        <T variant="caption" muted>
          Also: your memberships saved {formatMoney(members.total, { currency: home })} on {members.receipts} receipt{members.receipts === 1 ? '' : 's'}. That’s the membership at work, so it’s not in your total.
        </T>
      ) : null}

      {nonZero(r.recovered) ? <Button title="Share my total" icon="share-outline" kind="secondary" onPress={() => router.push('/share')} /> : null}
    </Screen>
  );
}
