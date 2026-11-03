import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { formatBag, formatMoney, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { monthValue, PLAN, type KnewQuestion, type MonthValue } from '@/domain/monthValue';
import { track } from '@/lib/analytics';
import { useData, useLookups } from '@/lib/data';
import { answerKnewBefore } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T } from './ui';

const nonZero = (b: MoneyBag) => Object.values(b).some((v) => v > 0);

/** This month (or another, by offset) in numbers: new money for you, what you used, what PerkScan found. */
export function useMonthValue(offset = 0): MonthValue & { from: Date; to: Date; home: string; plan: 'free' | 'plus' } {
  const { data } = useData();
  const { benefitById } = useLookups();
  const statusOf = useCallback((id: string) => benefitById.get(id)?.status, [benefitById]);
  return useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const home = data.profile?.home_currency?.trim() || getHomeCurrency();
    return { ...monthValue(data.opportunities, data.recovered, from, to, statusOf), from, to, home, plan: data.profile?.plan ?? 'free' };
  }, [data.opportunities, data.recovered, data.profile, offset, statusOf]);
}

/** Home: "November so far" — new money PerkScan put in front of you, what you used, and what it found. */
export function MonthValueCard() {
  const c = useColors();
  const v = useMonthValue();
  if (!nonZero(v.newValue) && !nonZero(v.used)) return null;
  const month = v.from.toLocaleDateString('en-US', { month: 'long' });
  return (
    <Panel onPress={() => router.push('/recap')} style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <IconBubble icon="calendar" tone="green" size={32} />
        <T variant="label" color={c.accentStrong} style={{ flex: 1 }}>{month} so far</T>
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Row>
      <Row gap={0}>
        <Figure label="New for you" value={formatBag(v.newValue, v.home)} />
        <Figure label="You used" value={formatBag(v.used, v.home)} />
        <Figure label="PerkScan found" value={formatBag(v.found, v.home)} strong />
      </Row>
      {v.plan === 'plus' && v.paidFor ? (
        <T variant="caption" color={c.accentStrong}>Your {PLAN.name} plan has paid for itself {v.paidFor}× this month.</T>
      ) : v.unanswered ? (
        <T variant="caption" muted>{v.unanswered} thing{v.unanswered === 1 ? '' : 's'} you used to tell us about: did you know about {v.unanswered === 1 ? 'it' : 'them'} before PerkScan?</T>
      ) : (
        <T variant="caption" muted>“PerkScan found” is only money you told us you didn’t know about.</T>
      )}
    </Panel>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="caption" muted>{label}</T>
      <T variant="subheading" color={strong ? c.accentStrong : undefined} numberOfLines={2}>{value}</T>
    </View>
  );
}

/**
 * "Did you already know about this?" after money comes back. The answer is the honest measure of what
 * PerkScan is worth: only "PerkScan found it" ever counts as found.
 */
export function KnewCheck({ q, compact = false }: { q: KnewQuestion; compact?: boolean }) {
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState<'found' | 'knew' | null>(null);
  const what = q.opp?.title ?? 'money you added';
  const answer = async (knew: boolean) => {
    setBusy(knew ? 'knew' : 'found');
    try {
      await answerKnewBefore(q.recovered.id, knew);
      track('knew_before', { answer: knew ? 'knew' : 'found' });
      await refresh();
      if (!compact) toast(knew ? 'Thanks — noted' : 'Glad PerkScan found it', { tone: knew ? 'info' : 'success' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(null);
    }
  };
  const amount = formatMoney(q.recovered.amount, { currency: q.recovered.currency });
  const buttons = (
    <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
      <Button title="PerkScan found it" size="sm" icon="sparkles" loading={busy === 'found'} disabled={!!busy} onPress={() => answer(false)} />
      <Button title="I already knew" size="sm" kind="secondary" loading={busy === 'knew'} disabled={!!busy} onPress={() => answer(true)} />
    </Row>
  );
  if (compact) {
    return (
      <View style={{ gap: space.xs }}>
        <Row>
          <T style={{ flex: 1 }} numberOfLines={1}>{what}</T>
          <T variant="label">{amount}</T>
        </Row>
        {buttons}
      </View>
    );
  }
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="help-circle" tone="purple" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">You got {amount} back. Did you know about it before PerkScan?</T>
          <T variant="caption" muted numberOfLines={2}>{what}</T>
        </View>
      </Row>
      {buttons}
    </Panel>
  );
}
