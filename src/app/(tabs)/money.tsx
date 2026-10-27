import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { OpportunityRow } from '@/components/OfferRow';
import { Button, Chip, Empty, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { formatBag, formatMoney, getHomeCurrency } from '@/domain/format';
import { includedWhenYouNeedIt } from '@/domain/included';
import { KIND_LABELS, moneyList, type MoneyKind, type MoneyView } from '@/domain/money';
import { groupByStore } from '@/domain/relevance';
import type { Opportunity } from '@/domain/types';
import { useData, useLookups } from '@/lib/data';
import { useRelevance } from '@/lib/relevance';
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
  const [showCheck, setShowCheck] = useState(false);
  // Stores whose other codes are unfolded.
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const { relevanceOf } = useRelevance();
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);

  const { now, list } = useMemo(() => {
    const at = new Date();
    return { now: at, list: moneyList(data.opportunities, view, kind, at, recoveredByOpp, statusOf, relevanceOf) };
  }, [data.opportunities, view, kind, recoveredByOpp, statusOf, relevanceOf]);
  // A filter that no longer has anything in this view falls back to All.
  const shownKind = kind !== 'all' && !list.kinds.includes(kind) ? 'all' : kind;
  const shown = shownKind === kind ? list : moneyList(data.opportunities, view, 'all', now, recoveredByOpp, statusOf, relevanceOf);
  const row = (o: Opportunity) => (
    <OpportunityRow
      opp={o}
      benefit={o.benefit_id ? benefitById.get(o.benefit_id) : undefined}
      recovered={recoveredByOpp.get(o.id) ?? 0}
      subtitle={userCardLabel(o.user_card_id) || undefined}
      now={now}
    />
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const hasTotal = Object.values(shown.total).some((v) => v > 0);
  // Credits you get back when you pay for something, and what memberships include: real, never in the total.
  const included = useMemo(() => includedWhenYouNeedIt(data.userCards, data.cards, data.benefits), [data.userCards, data.cards, data.benefits]);

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
        shown.sections.map((s) => {
          const isCheck = s.title === 'Worth checking';
          // Unconfirmed items fold into one line, so confirmed money stands out. Open when they're all there is.
          const open = !isCheck || showCheck || shown.sections.length === 1;
          return (
            <View key={s.title || 'all'} style={{ gap: space.sm }}>
              {isCheck ? (
                <Pressable onPress={() => setShowCheck(!showCheck)} disabled={shown.sections.length === 1} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                  <Panel style={{ gap: 2 }}>
                    <Row gap={space.sm}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.warn }} />
                      <T variant="subheading" style={{ flex: 1 }}>{s.items.length} to check</T>
                      {shown.sections.length > 1 ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.textFaint} /> : null}
                    </Row>
                    <T variant="caption" muted>Amounts or terms aren’t confirmed yet, so they’re not in your totals. Tap one to see how to check it.</T>
                  </Panel>
                </Pressable>
              ) : s.title ? (
                <T variant="overline" color={s.title === 'This week' ? c.warn : c.textMuted}>{s.title}</T>
              ) : null}
              {open ? (
                <Panel style={{ paddingVertical: space.xs }}>
                  {/* One row per store: its best code, with the rest folded underneath. */}
                  {(view === 'open' ? groupByStore(s.items) : s.items.map((o) => ({ lead: o, more: [] as Opportunity[] }))).map(({ lead, more }, i) => {
                    const isOpen = unfolded.has(lead.id);
                    const store = lead.merchant ?? 'this store';
                    return (
                      <View key={lead.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                        {row(lead)}
                        {more.length ? (
                          <Pressable
                            onPress={() => setUnfolded((prev) => {
                              const next = new Set(prev);
                              if (next.has(lead.id)) next.delete(lead.id);
                              else next.add(lead.id);
                              return next;
                            })}
                            accessibilityRole="button"
                            hitSlop={4}
                            style={({ pressed }) => ({ paddingBottom: space.md, opacity: pressed ? 0.6 : 1 })}
                          >
                            <Row gap={4}>
                              <T variant="label" color={c.accent}>{isOpen ? 'Hide' : `${more.length} more code${more.length === 1 ? '' : 's'} from ${store}`}</T>
                              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={c.accent} />
                            </Row>
                          </Pressable>
                        ) : null}
                        {isOpen
                          ? more.map((o) => (
                              <View key={o.id} style={{ borderTopWidth: 1, borderTopColor: c.border, marginLeft: space.md }}>
                                {row(o)}
                              </View>
                            ))
                          : null}
                      </View>
                    );
                  })}
                </Panel>
              ) : null}
            </View>
          );
        })
      )}

      {view === 'open' && (shownKind === 'all' || shownKind === 'credits') && included.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>When you need it</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {included.map((x, i) => (
              <Pressable
                key={x.key}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: x.userCardId } })}
                accessibilityRole="button"
                style={({ pressed }) => [{ paddingVertical: space.md, gap: 2, opacity: pressed ? 0.6 : 1 }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}
              >
                <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="subheading">{x.title}</T>
                    <T variant="caption" muted numberOfLines={1}>{x.from}</T>
                    {x.terms ? <T variant="caption" numberOfLines={2}>{x.terms}</T> : null}
                  </View>
                  {x.amount !== null ? (
                    <T variant="label" color={c.textMuted}>up to {formatMoney(x.amount, { currency: x.currency ?? undefined })}</T>
                  ) : x.worth !== null ? (
                    <T variant="label" color={c.textMuted}>≈ {formatMoney(x.worth, { currency: x.currency ?? undefined })}{x.worthPeriod === 'year' ? '/yr' : ' each time'}</T>
                  ) : null}
                </Row>
                {x.worthBasis ? <T variant="caption" faint numberOfLines={2}>{x.worthBasis}</T> : null}
              </Pressable>
            ))}
          </Panel>
          <T variant="caption" faint>Paid back or included when you use it, so not in “ready to use”. Values are the provider’s own figures.</T>
        </View>
      ) : null}

      {view === 'used' ? (
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
