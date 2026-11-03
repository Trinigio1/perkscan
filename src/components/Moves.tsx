import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { formatMoney } from '@/domain/format';
import { moneyMoves, type Move, type MoveKind } from '@/domain/moves';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { confirmSaving, markOpportunity } from '@/lib/inbox';
import { useDismissed } from '@/lib/suggestions';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { Button, Field, IconBubble, Panel, Row, T, type IconName } from './ui';

const ICON: Record<MoveKind, { icon: IconName; tone: 'blue' | 'teal' | 'purple' | 'green' | 'orange' | 'gray' }> = {
  phone_insurance: { icon: 'phone-portrait', tone: 'blue' },
  rental_waiver: { icon: 'car', tone: 'teal' },
  protection_plan: { icon: 'shield-checkmark', tone: 'orange' },
  trip_insurance: { icon: 'airplane', tone: 'teal' },
  annual_fee: { icon: 'card', tone: 'purple' },
  recall: { icon: 'warning', tone: 'orange' },
  rebate: { icon: 'flash', tone: 'green' },
  points: { icon: 'gift', tone: 'green' },
};

/** Your money moves now, minus what you've done or said isn't for you. */
export function useMoves(): Move[] {
  const { data } = useData();
  const [dismissed, , loaded] = useDismissed();
  return useMemo(() => {
    if (!loaded) return [];
    const done = new Set([...data.savings.map((s) => s.key), ...[...dismissed].filter((k) => k.startsWith('move:')).map((k) => k.slice(5))]);
    return moneyMoves(
      { userCards: data.userCards, cards: data.cards, benefits: data.benefits, opportunities: data.opportunities, recovered: data.recovered, receipts: data.itemReceipts, recalls: data.recalls, done },
      new Date(),
    );
  }, [data, dismissed, loaded]);
}

/**
 * One money move: why, what to do, and a button that records it with the amount you saw. Money only
 * counts once you confirm it.
 */
export function MoveCard({ move, compact = false }: { move: Move; compact?: boolean }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [, dismiss] = useDismissed();
  const [asking, setAsking] = useState(false);
  const [amount, setAmount] = useState(move.amount !== null ? String(move.amount) : '');
  const [busy, setBusy] = useState(false);
  const value = Number(amount.replace(/[^0-9.]/g, ''));
  const ok = value > 0 && value <= 20000;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      if (move.opportunityId) await markOpportunity(move.opportunityId, 'used', value);
      else await confirmSaving({ key: move.key, kind: move.kind === 'points' ? 'other' : move.kind, title: move.title.slice(0, 160), amount: value, currency: move.currency, per: move.per });
      track('money_move', { kind: move.kind, action: 'done' });
      toast(`Nice — ${formatMoney(value, { currency: move.currency })}${move.per === 'month' ? ' a month' : move.per === 'year' ? ' a year' : ''} kept`, { tone: 'success' });
      await refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(false);
    }
  };

  const { icon, tone } = ICON[move.kind];
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={icon} tone={tone} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{move.title}</T>
          <T variant="caption" muted numberOfLines={compact ? 2 : 4}>{move.why}</T>
        </View>
      </Row>
      {compact ? null : (
        <View style={{ gap: 4 }}>
          {move.steps.map((s, i) => (
            <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <T variant="caption" color={c.accentStrong}>{i + 1}.</T>
              <T variant="caption" style={{ flex: 1 }}>{s}</T>
            </Row>
          ))}
        </View>
      )}
      {asking ? (
        <View style={{ gap: space.sm }}>
          <Field
            label={move.per === 'month' ? 'How much a month did it cost?' : 'How much did you keep?'}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Button title="Save" icon="checkmark" size="sm" disabled={!ok || busy} loading={busy} onPress={save} />
            <Button title="Cancel" size="sm" kind="ghost" onPress={() => setAsking(false)} />
          </Row>
        </View>
      ) : (
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button title={move.confirmLabel} icon="checkmark-circle" size="sm" onPress={() => setAsking(true)} />
          {move.url ? (
            <Button
              title={move.kind === 'recall' ? 'Recall page' : move.kind === 'rebate' ? 'Find rebates' : 'Card terms'}
              icon="open-outline"
              size="sm"
              kind="secondary"
              onPress={() => {
                track('money_move', { kind: move.kind, action: 'open' });
                Linking.openURL(move.url!);
              }}
            />
          ) : null}
          {compact ? (
            <Button title="Details" size="sm" kind="ghost" onPress={() => router.push('/moves')} />
          ) : (
            <Button
              title="Not for me"
              size="sm"
              kind="ghost"
              onPress={() => {
                track('money_move', { kind: move.kind, action: 'dismissed' });
                dismiss(`move:${move.key}`);
              }}
            />
          )}
        </Row>
      )}
    </Panel>
  );
}

/** Home's Explore shortcut and the count of moves waiting. */
export function MovesLink() {
  const c = useColors();
  const moves = useMoves();
  if (!moves.length) return null;
  return (
    <Pressable onPress={() => router.push('/moves')} accessibilityRole="button" hitSlop={6}>
      <T variant="label" color={c.accent}>{moves.length} money move{moves.length === 1 ? '' : 's'} ›</T>
    </Pressable>
  );
}
