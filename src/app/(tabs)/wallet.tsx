import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Badge, Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { useData } from '@/lib/data';
import { space, useColors } from '@/theme';

export default function Wallet() {
  const c = useColors();
  const { data } = useData();

  return (
    <Screen>
      <Row>
        <T variant="title" style={{ flex: 1 }}>Wallet</T>
        <Button title="Add" icon="add" kind="secondary" onPress={() => router.push('/add-card')} />
      </Row>
      {data.userCards.length === 0 ? (
        <Empty icon="card-outline" title="Your wallet is empty" body="Add the cards you carry to start tracking their credits." />
      ) : null}
      {data.userCards.map((uc) => {
        const card = data.cards.find((x) => x.id === uc.card_id);
        const benefits = data.benefits.filter((b) => b.card_id === uc.card_id);
        const credits = benefits.filter((b) => b.type === 'credit').length;
        const protections = benefits.filter((b) => b.type === 'protection').length;
        return (
          <Panel key={uc.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })}>
            <Row>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="label" faint>{card?.issuer}</T>
                <T variant="heading">{uc.nickname || card?.product_name}</T>
                <T variant="caption" muted>•••• {uc.last_four}</T>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textFaint} />
            </Row>
            <Row style={{ flexWrap: 'wrap', marginTop: space.xs }}>
              <Badge label={card?.annual_fee == null ? 'Fee not verified' : `${formatMoney(card.annual_fee)} fee`} />
              <Badge label={`${credits} credits`} />
              <Badge label={`${protections} protections`} />
            </Row>
            <Button
              title="Is it worth the fee?"
              kind="ghost"
              icon="scale-outline"
              onPress={() => router.push({ pathname: '/card/[id]/worth-it', params: { id: uc.id } })}
            />
          </Panel>
        );
      })}
    </Screen>
  );
}
