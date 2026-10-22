import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Hero } from '@/components/Hero';
import { Button, Panel, Row, Screen, T } from '@/components/ui';
import { monthlyRecap } from '@/domain/digest';
import { formatBag, formatMoney, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { space, useColors } from '@/theme';

const nonZero = (b: MoneyBag) => Object.values(b).some((v) => v > 0);

/** "You recovered $X this month": what you used, what you missed, and last month for comparison. */
export default function Recap() {
  const c = useColors();
  const { data } = useData();
  const [offset, setOffset] = useState(0); // 0 = this month, -1 = last month, ...
  useEffect(() => track('recap_viewed'), []);
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  const { month, r } = useMemo(() => {
    const now = new Date();
    const m = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { month: m, r: monthlyRecap(data.opportunities, data.recovered, m, now) };
  }, [data, offset]);
  const label = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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

      {nonZero(r.recovered) ? <Button title="Share my total" icon="share-outline" kind="secondary" onPress={() => router.push('/share')} /> : null}
    </Screen>
  );
}
