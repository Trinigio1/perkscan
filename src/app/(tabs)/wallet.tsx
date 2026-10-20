import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Button, Empty, IconBubble, Row, Screen, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { remainingValue } from '@/domain/score';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

export default function Wallet() {
  const c = useColors();
  const { data } = useData();
  const { recoveredByOpp } = useLookups();

  const rows = useMemo(() => {
    const now = new Date();
    return data.userCards.map((uc) => {
      const card = data.cards.find((x) => x.id === uc.card_id);
      const open = data.opportunities.filter((o) => o.user_card_id === uc.id && o.status === 'open' && o.expires_at && new Date(o.expires_at) > now);
      return {
        uc,
        card,
        available: open.reduce((s, o) => s + remainingValue(o, recoveredByOpp), 0),
        credits: data.benefits.filter((b) => b.card_id === uc.card_id && b.type === 'credit').length,
        protections: data.benefits.filter((b) => b.card_id === uc.card_id && b.type === 'protection').length,
      };
    });
  }, [data, recoveredByOpp]);

  return (
    <Screen title="Wallet" right={<Button title="Add" icon="add" size="sm" kind="secondary" onPress={() => router.push('/add-card')} />}>
      {rows.length === 0 ? (
        <Empty icon="wallet" title="Your wallet is empty" body="Add the cards you carry to start tracking their credits." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      ) : null}
      {rows.map(({ uc, card, available, credits, protections }) =>
        card ? (
          <View key={uc.id} style={{ gap: space.md }}>
            <Pressable onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <CardArt cardId={card.id} issuer={card.issuer} name={uc.nickname || card.product_name.replace(/®/g, '')} lastFour={uc.last_four} />
            </Pressable>
            <Row gap={space.lg} style={{ paddingHorizontal: space.xs }}>
              <View style={{ flex: 1 }}>
                <T variant="subheading">{available > 0 ? formatMoney(available) : '$0'} <T variant="caption" muted>available now</T></T>
                <T variant="caption" muted>
                  {credits} credits · {protections} protections · {card.annual_fee === null ? 'fee not verified' : `${formatMoney(card.annual_fee)} fee`}
                </T>
              </View>
              <Pressable onPress={() => router.push({ pathname: '/card/[id]/worth-it', params: { id: uc.id } })} accessibilityLabel="Is it worth the fee?">
                <Row gap={6}>
                  <IconBubble icon="calculator" tone="blue" size={32} />
                  <T variant="label" color={c.accent}>Worth it?</T>
                </Row>
              </Pressable>
            </Row>
          </View>
        ) : null,
      )}
    </Screen>
  );
}
