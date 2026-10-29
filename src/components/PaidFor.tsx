import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Badge, Button, IconBubble, Panel, Row, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import type { PaidFor, SetupItem } from '@/domain/paidFor';
import { useData } from '@/lib/data';
import { answerSetup } from '@/lib/paidFor';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/** One perk to turn on: what it is, how (the catalog's words), and Done / Not for me. */
export function SetupRow({ item }: { item: SetupItem }) {
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState<'done' | 'skipped' | null>(null);
  const answer = async (status: 'done' | 'skipped') => {
    setBusy(status);
    try {
      await answerSetup(item.userCardId, item.benefitId, status);
      await refresh();
      toast(status === 'done' ? 'Nice, it’s on.' : 'Hidden. PerkScan won’t ask about it again.', { tone: 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(null);
    }
  };
  return (
    <View style={{ paddingVertical: space.md, gap: 4 }}>
      <T variant="subheading">{item.title}</T>
      <T variant="caption" muted numberOfLines={1}>{item.from}</T>
      {item.how ? <T variant="caption" numberOfLines={3}>{item.how}</T> : null}
      <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: space.xs }}>
        {item.url ? <Button title="How to turn it on" icon="open-outline" size="sm" onPress={() => Linking.openURL(item.url!)} /> : null}
        <Button title="Done" icon="checkmark" size="sm" kind="secondary" loading={busy === 'done'} disabled={!!busy} onPress={() => answer('done')} />
        <Button title="Not for me" size="sm" kind="ghost" loading={busy === 'skipped'} disabled={!!busy} onPress={() => answer('skipped')} />
      </Row>
    </View>
  );
}

/** A card or membership: its fee, what it gave back this year, and what's left to use. */
export function PaidForPanel({ p }: { p: PaidFor }) {
  const c = useColors();
  const money = (v: number) => formatMoney(v, { currency: p.currency });
  const share = p.fee > 0 ? Math.min(1, p.gotBack / p.fee) : 0;
  const covered = p.gotBack >= p.fee;
  return (
    <Panel onPress={() => router.push({ pathname: '/card/[id]', params: { id: p.userCardId } })} style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <IconBubble icon={p.kind === 'membership' ? 'ribbon' : 'card'} tone={p.kind === 'membership' ? 'purple' : 'blue'} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading" numberOfLines={1}>{p.name}</T>
          <T variant="caption" muted>
            {money(p.fee)} a year{p.feeFrom === 'receipts' ? ', from your receipts' : p.kind === 'membership' ? ' on the yearly plan' : ' annual fee'}
          </T>
        </View>
        {covered ? <Badge label="Paid for itself" tone="good" icon="checkmark-circle" /> : null}
      </Row>

      {/* How much of the fee came back this year. */}
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(share * 100)}%`, height: 8, backgroundColor: covered ? c.accent : c.accentStrong }} />
      </View>
      <T variant="caption">
        <T variant="caption" color={c.text} style={{ fontWeight: '700' }}>{money(p.gotBack)}</T> back this year of the {money(p.fee)}
      </T>

      <View style={{ gap: 2 }}>
        {p.creditsUsed > 0 ? <Line label="Credits used" value={money(p.creditsUsed)} /> : null}
        {p.memberSavings > 0 ? <Line label={`Savings on ${p.savingsReceipts} receipt${p.savingsReceipts === 1 ? '' : 's'}`} value={money(p.memberSavings)} /> : null}
        {p.creditsLeft > 0 ? <Line label="Credits still to use this year" value={money(p.creditsLeft)} strong /> : null}
      </View>
      {p.kind === 'membership' && p.gotBack === 0 ? (
        <T variant="caption" faint>Only savings printed on a receipt count. Free delivery often isn’t a line, so the real number may be higher.</T>
      ) : null}
      {p.setup.length ? (
        <Row gap={4}>
          <Ionicons name="alert-circle" size={14} color={c.warn} />
          <T variant="caption" color={c.warn}>{p.setup.length} perk{p.setup.length === 1 ? '' : 's'} to turn on</T>
        </Row>
      ) : null}
    </Panel>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const c = useColors();
  return (
    <Row>
      <T variant="caption" muted style={{ flex: 1 }}>{label}</T>
      <T variant="caption" color={strong ? c.accentStrong : c.text}>{value}</T>
    </Row>
  );
}

/** Home: perks you already pay for that aren't on yet. One line, opens the full list. */
export function TurnOnPanel({ items, onHide }: { items: SetupItem[]; onHide: () => void }) {
  const c = useColors();
  if (!items.length) return null;
  const names = items.slice(0, 2).map((x) => x.title).join(', ');
  return (
    <Panel onPress={() => router.push('/paying-for')} style={{ gap: 4 }}>
      <Row gap={space.sm}>
        <T variant="caption" color={c.accentStrong} style={{ flex: 1 }}>Already paid for</T>
        <Pressable onPress={onHide} hitSlop={10} accessibilityLabel="Hide">
          <Ionicons name="close" size={16} color={c.textFaint} />
        </Pressable>
      </Row>
      <T variant="subheading">Turn on {items.length} perk{items.length === 1 ? '' : 's'} you already have</T>
      <T variant="caption" muted numberOfLines={2}>{names}{items.length > 2 ? ` and ${items.length - 2} more` : ''}: they only work once you set them up.</T>
    </Panel>
  );
}
