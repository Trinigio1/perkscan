import { useMemo } from 'react';
import { View } from 'react-native';
import { MoveCard, useMoves } from '@/components/Moves';
import { useMonthValue } from '@/components/MonthValue';
import { Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { formatBag, formatMoney } from '@/domain/format';
import { useData } from '@/lib/data';
import { endSaving } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/**
 * Money moves: things to do this week that keep money in your pocket (insurance your card already gives
 * you, a waiver to decline, a fee to ask about, a recall refund), and what you've kept so far.
 */
export default function Moves() {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const moves = useMoves();
  const month = useMonthValue();
  const kept = useMemo(() => data.savings.filter((s) => !s.ended_on), [data.savings]);

  const stop = async (key: string) => {
    try {
      await endSaving(key);
      await refresh();
      toast('Got it — it stops counting from today', { tone: 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    }
  };

  return (
    <Screen edges={[]}>
      {Object.values(month.saved).some((v) => v > 0) ? (
        <Panel style={{ gap: 2 }}>
          <T variant="label" color={c.accentStrong}>Kept with money moves this month</T>
          <T variant="title">{formatBag(month.saved, month.home)}</T>
          <T variant="caption" muted>Only what you confirmed. It counts in “PerkScan found”.</T>
        </Panel>
      ) : null}

      {moves.length ? (
        moves.map((m) => <MoveCard key={m.key} move={m} />)
      ) : (
        <Empty icon="checkmark-done" title="No money moves right now" body="PerkScan checks your bills, purchases, trips and cards as they come in, and adds moves here when there’s money to keep." />
      )}

      {kept.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>What you’ve kept</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {kept.map((s, i) => (
              <View key={s.id} style={[{ paddingVertical: space.md, gap: 4 }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}>
                <Row gap={space.sm}>
                  <T style={{ flex: 1 }} numberOfLines={2}>{s.title}</T>
                  <T variant="label">{formatMoney(s.amount, { currency: s.currency })}{s.per === 'month' ? '/mo' : s.per === 'year' ? '/yr' : ''}</T>
                </Row>
                {s.per !== 'once' ? (
                  <Row gap={space.sm} style={{ alignItems: 'center' }}>
                    <T variant="caption" muted style={{ flex: 1 }}>Saving every {s.per} since {new Date(`${s.started_on}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</T>
                    <Button title="Stopped?" size="sm" kind="ghost" onPress={() => stop(s.key)} />
                  </Row>
                ) : null}
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      <T variant="caption" faint center>PerkScan informs and guides; it doesn’t cancel, file or call anyone for you. Check each card’s terms before you rely on its cover.</T>
    </Screen>
  );
}
