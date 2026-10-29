import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useSpottedCards } from '@/components/SpottedCards';
import { Hero } from '@/components/Hero';
import { Button, Panel, Row, Screen, T } from '@/components/ui';
import { categoryFromPurchase } from '@/domain/checkout';
import { missedEarnings } from '@/domain/earn';
import { formatMoney } from '@/domain/format';
import { owedToYou } from '@/domain/money';
import { scanLines } from '@/domain/scan';
import { remainingValue } from '@/domain/score';
import { track } from '@/lib/analytics';
import { useData, useLookups } from '@/lib/data';
import { useMembershipHints, useMySubscriptions, usePayingTwice } from '@/lib/memberships';
import { space, useColors } from '@/theme';

const DAY = 86_400_000;

/** The first scan: everything PerkScan found once a bank (or email) is connected, in one list. */
export default function Scan() {
  const c = useColors();
  const { data } = useData();
  const { recoveredByOpp, benefitById } = useLookups();
  const twice = usePayingTwice();
  const hints = useMembershipHints();
  const subs = useMySubscriptions();
  const spotted = useSpottedCards();

  const { lines, total } = useMemo(() => {
    const now = new Date();
    const creditsOpen = data.opportunities.filter(
      (o) => o.type === 'card_credit' && o.status === 'open' && o.value_estimate !== null && (!o.expires_at || new Date(o.expires_at) > now) && o.currency === 'USD',
    );
    return scanLines({
      owed: owedToYou(data.opportunities, now, recoveredByOpp, (id) => benefitById.get(id)?.status),
      creditsOpen: { total: Math.round(creditsOpen.reduce((n, o) => n + remainingValue(o, recoveredByOpp), 0) * 100) / 100, count: creditsOpen.filter((o) => remainingValue(o, recoveredByOpp) > 0).length },
      payingTwice: twice,
      missed: missedEarnings(
        data.receipts,
        { userCards: data.userCards, cards: data.cards, rates: data.earnRates, rewards: data.cardRewards },
        categoryFromPurchase,
        new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10),
      ),
      memberships: hints.filter((h) => h.source === 'charge'),
      spottedCards: spotted.length,
      subscriptions: { count: subs.length, yearly: subs.reduce((n, s) => n + (s.currency === 'USD' ? s.yearly : 0), 0) },
      currency: 'USD',
    });
  }, [data, recoveredByOpp, benefitById, twice, hints, subs, spotted.length]);

  useEffect(() => track('scan_viewed', { lines: lines.length }), [lines.length]);

  return (
    <Screen edges={[]}>
      <Hero>
        <T variant="label" color={c.heroMuted}>{total > 0 ? 'Ready for you now' : 'Your first scan'}</T>
        <T variant="display" color={c.heroText}>{total > 0 ? formatMoney(total, { currency: 'USD' }) : lines.length ? `${lines.length} things found` : 'Still looking'}</T>
        <T color={c.heroText}>
          {total > 0 ? 'Money you can still get: owed to you, credits open now, and charges you’re paying twice.' : lines.length ? 'Here’s what PerkScan found so far.' : 'Connect your bank or email and this fills in by itself.'}
        </T>
      </Hero>

      {lines.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {lines.map((l, i) => (
            <Pressable
              key={l.key}
              onPress={() => router.push(l.route as Href)}
              accessibilityRole="button"
              style={({ pressed }) => [{ paddingVertical: space.md, opacity: pressed ? 0.6 : 1 }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}
            >
              <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading">{l.title}</T>
                  <T variant="caption" muted>{l.detail}</T>
                  {l.key === 'missed' ? <T variant="caption" faint>Already spent, so not in the total above. It’s what to fix going forward.</T> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
              </Row>
            </Pressable>
          ))}
        </Panel>
      ) : null}

      <Button title="Go to Home" icon="home" onPress={() => router.replace('/')} />
      <Pressable onPress={() => router.push('/connect-gmail')} hitSlop={8} style={{ alignSelf: 'center' }}>
        <T variant="label" color={c.accent}>Add your email too: receipts, codes and refunds</T>
      </Pressable>
    </Screen>
  );
}
