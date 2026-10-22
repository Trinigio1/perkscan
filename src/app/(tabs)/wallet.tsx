import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Button, Empty, IconBubble, Row, Screen, T } from '@/components/ui';
import { addToBag, formatBag, formatMoney, type MoneyBag } from '@/domain/format';
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
        available: open.reduce((bag, o) => addToBag(bag, o.currency, remainingValue(o, recoveredByOpp)), {} as MoneyBag),
        credits: data.benefits.filter((b) => b.card_id === uc.card_id && b.type === 'credit').length,
        protections: data.benefits.filter((b) => b.card_id === uc.card_id && b.type === 'protection').length,
        perks: data.benefits.filter((b) => b.card_id === uc.card_id && b.type === 'perk').length,
      };
    });
  }, [data, recoveredByOpp]);

  return (
    <Screen title="Wallet" right={<Button title="Add" icon="add" size="sm" kind="secondary" onPress={() => router.push('/add-card')} />}>
      {rows.length ? <Button title="All your card perks" icon="airplane-outline" kind="secondary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/perks')} /> : null}
      {rows.length === 0 ? (
        <Empty icon="wallet" title="Your wallet is empty" body="Add the cards you carry to start tracking their credits." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      ) : null}
      {rows.map(({ uc, card, available, credits, protections, perks }) =>
        card ? (
          <View key={uc.id} style={{ gap: space.md }}>
            <Pressable onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <CardArt cardId={card.id} issuer={card.issuer} name={uc.nickname || card.product_name.replace(/®/g, '')} lastFour={uc.last_four} />
            </Pressable>
            <Row gap={space.lg} style={{ paddingHorizontal: space.xs }}>
              <View style={{ flex: 1 }}>
                <T variant="subheading">{Object.values(available).some((v) => v > 0) ? formatBag(available, card.currency) : formatMoney(0, { currency: card.currency })} <T variant="caption" muted>available now</T></T>
                <T variant="caption" muted>
                  {credits} credits · {protections} protections · {perks} perks · {card.annual_fee === null ? 'fee not verified' : `${formatMoney(card.annual_fee, { currency: card.currency })} fee`}
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
