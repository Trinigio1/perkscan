import { router } from 'expo-router';
import { View } from 'react-native';
import { PaidForPanel, SetupRow } from '@/components/PaidFor';
import { Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { formatBag } from '@/domain/format';
import { allSetup, paidForTotals } from '@/domain/paidFor';
import { usePaidFor } from '@/lib/paidFor';
import { space, useColors } from '@/theme';

/** What you pay for: perks to turn on first, then each fee against what it gave back this year. */
export default function PayingFor() {
  const c = useColors();
  const list = usePaidFor();
  const setup = allSetup(list);
  const withFee = list.filter((p) => p.fee > 0);
  const totals = paidForTotals(list);

  if (!list.length) {
    return (
      <Screen edges={[]}>
        <Empty
          icon="card"
          title="Nothing you pay for yet"
          body="Add your cards and memberships (like Prime or Uber One) to see what they give back for what they cost."
          action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {setup.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" color={c.warn}>Turn these on</T>
          <T variant="caption" muted>Included in what you pay, but they only work once you set them up.</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {setup.map((s, i) => (
              <View key={s.key} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <SetupRow item={s} />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}

      {withFee.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>This year</T>
          <Row style={{ alignItems: 'baseline' }} gap={6}>
            <T variant="title">{formatBag(totals.gotBack)}</T>
            <T muted>back of {formatBag(totals.fees)} in fees</T>
          </Row>
          {withFee.map((p) => (
            <PaidForPanel key={p.userCardId} p={p} />
          ))}
          <T variant="caption" faint>
            Back = credits you used plus member savings printed on your receipts. Points, protections and free delivery that isn’t on a receipt aren’t counted. Fees are the card’s annual fee or the membership’s price.
          </T>
        </View>
      ) : null}
    </Screen>
  );
}
