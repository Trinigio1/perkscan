import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { OpportunityRow } from '@/components/OfferRow';
import { Button, Chip, Empty, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { formatBag, getHomeCurrency } from '@/domain/format';
import { KIND_LABELS, moneyList, type MoneyKind, type MoneyView } from '@/domain/money';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const EMPTY: Record<MoneyView, { title: string; body: string }> = {
  open: { title: 'Nothing to use yet', body: 'Credits from your cards and offers from your email and texts show up here.' },
  used: { title: 'Nothing used yet', body: 'Mark things as used and they’ll add up here.' },
  missed: { title: 'Nothing missed this year', body: 'Keep it that way.' },
};
const TOTAL_LABEL: Record<MoneyView, string> = { open: 'to use', used: 'used this year', missed: 'missed this year' };

/** Everything you can use, have used, or missed: card credits, codes, gift cards, trials and protections. */
export default function Money() {
  const c = useColors();
  const { data, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const params = useLocalSearchParams<{ view?: MoneyView }>();
  const [view, setView] = useState<MoneyView>(params.view === 'used' || params.view === 'missed' ? params.view : 'open');
  const [kind, setKind] = useState<MoneyKind | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);

  const { now, list } = useMemo(() => {
    const at = new Date();
    return { now: at, list: moneyList(data.opportunities, view, kind, at, recoveredByOpp, statusOf) };
  }, [data.opportunities, view, kind, recoveredByOpp, statusOf]);
  // A filter that no longer has anything in this view falls back to All.
  const shownKind = kind !== 'all' && !list.kinds.includes(kind) ? 'all' : kind;
  const shown = shownKind === kind ? list : moneyList(data.opportunities, view, 'all', now, recoveredByOpp, statusOf);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const hasTotal = Object.values(shown.total).some((v) => v > 0);

  return (
    <Screen title="Money" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
      <Segmented<MoneyView>
        value={view}
        onChange={(v) => {
          setView(v);
          setKind('all');
        }}
        options={[
          { label: 'To use', value: 'open' },
          { label: 'Used', value: 'used' },
          { label: 'Missed', value: 'missed' },
        ]}
      />

      {shown.count ? (
        <Row style={{ alignItems: 'baseline' }} gap={6}>
          <T variant="title" color={view === 'missed' && hasTotal ? c.danger : view === 'used' ? c.accentStrong : c.text}>
            {hasTotal ? formatBag(shown.total, home) : shown.count}
          </T>
          <T muted>{hasTotal ? TOTAL_LABEL[view] : `${shown.count === 1 ? 'item' : 'items'} ${TOTAL_LABEL[view]}`}</T>
        </Row>
      ) : null}

      {list.kinds.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
          <Chip label="All" selected={shownKind === 'all'} onPress={() => setKind('all')} />
          {list.kinds.map((k) => (
            <Chip key={k} label={KIND_LABELS[k]} selected={shownKind === k} onPress={() => setKind(k)} />
          ))}
        </ScrollView>
      ) : null}

      {shown.count === 0 ? (
        <Empty
          icon={view === 'open' ? 'wallet' : view === 'used' ? 'checkmark-circle' : 'happy'}
          title={EMPTY[view].title}
          body={EMPTY[view].body}
          action={view === 'open' && !data.userCards.length ? <Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} /> : undefined}
        />
      ) : (
        shown.sections.map((s) => (
          <View key={s.title || 'all'} style={{ gap: space.sm }}>
            {s.title ? <T variant="overline" color={s.title === 'This week' ? c.warn : c.textMuted}>{s.title}</T> : null}
            {s.title === 'Worth checking' ? <T variant="caption" faint>Not counted in your totals until confirmed.</T> : null}
            <Panel style={{ paddingVertical: space.xs }}>
              {s.items.map((o, i) => (
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
          </View>
        ))
      )}
    </Screen>
  );
}
