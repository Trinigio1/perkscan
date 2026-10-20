import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { CreditRow } from '@/components/CreditRow';
import { Badge, Button, Empty, ErrorNote, Money, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { computeScore } from '@/domain/score';
import { CATEGORY_LABELS } from '@/domain/types';
import { useData, useLookups } from '@/lib/data';
import { radius, space, useColors } from '@/theme';

// Categories that have a data source in this build. Others light up in later phases.
const LIVE_CATEGORIES = new Set(['card_credits']);

export default function Home() {
  const c = useColors();
  const { data, error, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const [refreshing, setRefreshing] = useState(false);
  const { now, score } = useMemo(() => {
    const at = new Date();
    return { now: at, score: computeScore(data.opportunities, data.recovered, at) };
  }, [data]);
  const year = now.getFullYear();

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      {error ? <ErrorNote message={`Couldn't refresh: ${error}`} /> : null}

      <View style={{ backgroundColor: c.hero, borderRadius: radius.lg, padding: space.xl, gap: space.xs }}>
        <T variant="label" color={c.heroMuted}>You left</T>
        <Money value={score.leftOnTable} size={64} color={c.heroText} />
        <T variant="heading" color={c.heroText}>on the table in {year}</T>
        <T variant="caption" color={c.heroMuted} style={{ marginTop: space.sm }}>
          Credits that reset before you used them since you added your cards.
        </T>
      </View>

      <Row style={{ alignItems: 'stretch' }}>
        <Panel style={{ flex: 1 }}>
          <Row><Ionicons name="time-outline" size={16} color={c.warn} /><T variant="label" color={c.warn}>At risk this week</T></Row>
          <Money value={score.atRiskThisWeek} size={30} />
          <T variant="caption" muted>{score.atRiskItems.length} expiring in 7 days</T>
        </Panel>
        <Panel style={{ flex: 1 }}>
          <Row><Ionicons name="trending-up" size={16} color={c.accent} /><T variant="label" color={c.accent}>Recovered</T></Row>
          <Money value={score.recoveredThisYear} size={30} color={c.accent} />
          <T variant="caption" muted>this year</T>
        </Panel>
      </Row>

      {score.unverifiedCount > 0 ? (
        <Panel style={{ backgroundColor: c.surfaceAlt }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Ionicons name="shield-checkmark-outline" size={18} color={c.textMuted} />
            <T variant="caption" muted style={{ flex: 1 }}>
              {score.unverifiedCount} credit{score.unverifiedCount > 1 ? 's don’t' : ' doesn’t'} have a verified amount yet, so
              {score.unverifiedCount > 1 ? ' they count' : ' it counts'} as $0. We’d rather undercount than guess.
            </T>
          </Row>
        </Panel>
      ) : null}

      {data.userCards.length === 0 ? (
        <Empty
          icon="card-outline"
          title="Add a card to start"
          body="PerkScan tracks every credit on your cards and tells you before it disappears."
          action={<Button title="Add cards" onPress={() => router.push('/add-card')} />}
        />
      ) : (
        <Panel>
          <Row>
            <T variant="heading" style={{ flex: 1 }}>Use it before it resets</T>
            {score.atRiskItems.length ? <Badge label={formatMoney(score.atRiskThisWeek)} tone="warn" /> : null}
          </Row>
          {score.atRiskItems.length === 0 ? (
            <T muted>Nothing expires in the next 7 days. {score.available > 0 ? `${formatMoney(score.available)} is still available this period.` : ''}</T>
          ) : (
            score.atRiskItems.map((o) => (
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
          <Button title="See all credits" kind="ghost" onPress={() => router.push('/credits')} />
        </Panel>
      )}

      <Panel>
        <T variant="heading">Where the money is</T>
        {score.byCategory.map((cat) => {
          const live = LIVE_CATEGORIES.has(cat.category);
          return (
            <Row key={cat.category} style={{ paddingVertical: 6 }}>
              <T style={{ flex: 1 }} muted={!live}>{CATEGORY_LABELS[cat.category]}</T>
              {live ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <T variant="label" color={cat.leftOnTable > 0 ? c.danger : c.text}>{formatMoney(cat.leftOnTable)} missed</T>
                  <T variant="caption" muted>{formatMoney(cat.available + cat.atRisk)} available</T>
                </View>
              ) : (
                <Badge label="Coming soon" />
              )}
            </Row>
          );
        })}
      </Panel>
    </Screen>
  );
}
