import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Hero } from '@/components/Hero';
import { OpportunityRow } from '@/components/OfferRow';
import { Button, Panel, Row, Screen, T } from '@/components/ui';
import { activationBucket, foundMoney } from '@/domain/firstRun';
import { formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { track } from '@/lib/analytics';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const nonZero = (b: MoneyBag) => Object.values(b).some((v) => v > 0);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** Rows shown per group before "See all in Money". */
const PER_GROUP = 3;

/**
 * "We found $X for you": everything PerkScan found across your cards and inbox, by kind,
 * each with its Claim button. Only amounts it can stand behind count toward the big number.
 */
export default function Found() {
  const c = useColors();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const { data } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  const now = useMemo(() => new Date(), []);
  const f = useMemo(() => foundMoney(data.opportunities, data.recovered, now, statusOf), [data, now, statusOf]);
  const hasMoney = nonZero(f.total);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track('found_viewed', {
      first: first === '1',
      has_money: hasMoney,
      items: f.itemCount,
      groups: f.groups.length,
      after: activationBucket(data.profile?.onboarded_at, now),
    });
  }, [first, hasMoney, f, data.profile?.onboarded_at, now]);

  const from = [f.cards ? plural(f.cards, 'card') : null, f.emails ? plural(f.emails, 'email') : null].filter(Boolean).join(' and ');

  return (
    <Screen edges={[]}>
      <Hero>
        <T variant="label" color={c.heroMuted}>PerkScan found</T>
        {hasMoney ? (
          <T variant="display" color={c.heroText}>{formatBag(f.total, home)}</T>
        ) : (
          <T variant="display" color={c.heroText}>{plural(f.itemCount, 'thing')}</T>
        )}
        <T color={c.heroText}>{hasMoney ? 'ready for you to use' : 'worth a look'}{from ? `, from your ${from}` : ''}</T>
        {f.toCheck > 0 ? (
          <T variant="caption" color={c.heroMuted}>
            + {plural(f.toCheck, 'more item')} to check. {f.toCheck === 1 ? 'It isn’t' : 'They aren’t'} in the total until the amount is confirmed.
          </T>
        ) : null}
      </Hero>

      {f.groups.length === 0 ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Nothing to use yet</T>
          <T muted>Add your cards and connect your email, and PerkScan will look for credits, codes and refunds you’re owed.</T>
          <Button title="Add your cards" icon="card" onPress={() => router.push('/add-card')} />
        </Panel>
      ) : null}

      {f.groups.map((g) => (
        <View key={g.kind} style={{ gap: space.xs }}>
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
            <T variant="heading">{g.label}</T>
            {nonZero(g.total) ? <T variant="label" color={c.accentStrong}>{formatBag(g.total, home)}</T> : <T variant="caption" muted>{plural(g.items.length, 'item')}</T>}
          </Row>
          <Panel style={{ paddingVertical: space.xs }}>
            {g.items.slice(0, PER_GROUP).map((o, i) => (
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
          {g.items.length > PER_GROUP ? (
            <Button title={`See all ${g.items.length}`} kind="ghost" size="sm" onPress={() => router.push('/money')} />
          ) : null}
        </View>
      ))}

      {f.protectedCount > 0 || nonZero(f.missed) ? (
        <Panel style={{ gap: space.sm }}>
          {f.protectedCount > 0 ? (
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="shield-checkmark" size={16} color={c.accentStrong} />
              <T variant="caption" style={{ flex: 1 }}>
                {plural(f.protectedCount, 'purchase')} covered by your card’s protections. PerkScan keeps track in case something breaks or the price drops.
              </T>
            </Row>
          ) : null}
          {nonZero(f.missed) ? (
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="time" size={16} color={c.warn} />
              <T variant="caption" style={{ flex: 1 }}>
                {formatBag(f.missed, home)} already expired unused this year. From now on PerkScan reminds you before that happens.
              </T>
            </Row>
          ) : null}
        </Panel>
      ) : null}

      <Button title={f.groups.length ? 'Done' : 'Close'} kind={f.groups.length ? 'primary' : 'secondary'} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <T variant="caption" faint center>Card credits come from each bank’s own terms. Codes and refunds are read from your email: check the original before relying on one.</T>
    </Screen>
  );
}
