import { router } from 'expo-router';
import { useMemo } from 'react';
import { Linking, View } from 'react-native';
import { Badge, Button, Empty, IconBubble, Panel, Row, Screen, T } from '@/components/ui';
import { addToBag, formatBag, formatMoney, type MoneyBag } from '@/domain/format';
import { useMySubscriptions, usePayingTwice } from '@/lib/memberships';
import { space, useColors } from '@/theme';

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** What your receipts show you pay for regularly, what it costs a year, and where you could pay less. */
export default function Subscriptions() {
  const c = useColors();
  const subs = useMySubscriptions();
  const twice = usePayingTwice();
  const { yearly, saves } = useMemo(() => {
    const y: MoneyBag = {};
    const s: MoneyBag = {};
    for (const x of subs) {
      addToBag(y, x.currency, x.yearly);
      if (x.student) addToBag(s, x.currency, x.student.savesYearly);
    }
    return { yearly: y, saves: s };
  }, [subs]);

  if (!subs.length) {
    return (
      <Screen edges={[]}>
        <Empty
          icon="repeat"
          title="No subscriptions found yet"
          body="PerkScan spots them from receipts: the same amount from the same company about every month or year. They show up here as your receipts come in."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: space.xs }}>
        <T variant="caption" muted>From your receipts</T>
        <T variant="heading">About {formatBag(yearly)} a year</T>
        <T variant="caption" muted>
          {subs.length} subscription{subs.length === 1 ? '' : 's'}
          {Object.keys(saves).length ? ` · you could save ${formatBag(saves)} a year with student prices` : ''}
        </T>
      </Panel>

      <Panel style={{ paddingVertical: space.xs }}>
        {subs.map((s, i) => {
          const covered = twice.find((t) => s.service && t.charge.service.key === s.service.key);
          return (
            <View key={s.key} style={[{ paddingVertical: space.md, gap: 6 }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <IconBubble icon="repeat" tone="purple" size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading">{s.name}</T>
                  <T variant="caption" muted>
                    {formatMoney(s.amount, { currency: s.currency })} a {s.period === 'monthly' ? 'month' : 'year'} · last charged {day(s.lastCharged)}
                  </T>
                </View>
                <T variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{formatMoney(s.yearly, { currency: s.currency })}/yr</T>
              </Row>
              {s.student ? (
                <View style={{ marginLeft: 36 + space.md, gap: 6 }}>
                  <Badge tone="good" icon="school" label={`Student price ${formatMoney(s.student.studentMonthly, { currency: s.student.currency })}/mo · save ${formatMoney(s.student.savesYearly, { currency: s.student.currency })}/yr`} />
                  <View style={{ alignItems: 'flex-start' }}>
                    <Button title="See the student plan" size="sm" kind="secondary" icon="open-outline" onPress={() => Linking.openURL(s.student!.sourceUrl)} />
                  </View>
                </View>
              ) : null}
              {covered ? (
                <View style={{ marginLeft: 36 + space.md }}>
                  <Badge tone="warn" icon="copy" label={`Also included with your ${covered.covers[0]!.by}`} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>

      <T variant="caption" faint center>
        Spotted from receipts: the same amount from the same company about every month or year. Student prices are from each company’s own page. PerkScan doesn’t cancel or change plans for you.
      </T>
      <Button title="Student perks" kind="ghost" icon="school" onPress={() => router.push('/student')} />
    </Screen>
  );
}
