import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Button, Empty, IconBubble, Panel, Row, Screen, T } from '@/components/ui';
import { addToBag, formatBag, formatMoney, shortCardName, type MoneyBag } from '@/domain/format';
import { remainingValue } from '@/domain/score';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

/** Your cards, and everything they come with. */
export default function Cards() {
  const c = useColors();
  const { data } = useData();
  const { recoveredByOpp } = useLookups();

  const rows = useMemo(() => {
    const now = new Date();
    return data.userCards.map((uc) => {
      const card = data.cards.find((x) => x.id === uc.card_id);
      const open = data.opportunities.filter((o) => o.user_card_id === uc.id && o.type === 'card_credit' && o.status === 'open' && o.expires_at && new Date(o.expires_at) > now);
      const benefits = data.benefits.filter((b) => b.card_id === uc.card_id);
      return {
        uc,
        card,
        available: open.reduce((bag, o) => addToBag(bag, o.currency, remainingValue(o, recoveredByOpp)), {} as MoneyBag),
        benefits: benefits.length,
      };
    });
  }, [data, recoveredByOpp]);

  return (
    <Screen title="Cards" right={<Button title="Add" icon="add" size="sm" kind="secondary" onPress={() => router.push('/add-card')} />}>
      {rows.length === 0 ? (
        <Empty icon="card" title="No cards yet" body="Add the cards you carry to see their credits and perks." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      ) : (
        <Panel onPress={() => router.push('/perks')}>
          <Row gap={space.md}>
            <IconBubble icon="airplane" tone="blue" size={36} />
            <View style={{ flex: 1 }}>
              <T variant="subheading">All your perks</T>
              <T variant="caption" muted>Lounges, insurance, rewards</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </Row>
        </Panel>
      )}

      {rows.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {rows.map(({ uc, card, available, benefits }, i) =>
            card ? (
              <Pressable
                key={uc.id}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })}
                style={({ pressed }) => ({ paddingVertical: space.md, opacity: pressed ? 0.6 : 1, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border })}
                accessibilityRole="button"
                accessibilityLabel={`${uc.nickname || card.product_name}, ending ${uc.last_four}`}
              >
                <Row gap={space.md}>
                  <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" />
                  <View style={{ flex: 1 }}>
                    <T variant="subheading" numberOfLines={1}>{uc.nickname || shortCardName(card.product_name)}</T>
                    <T variant="caption" muted numberOfLines={1}>
                      ·· {uc.last_four} · {card.annual_fee === null ? 'fee unconfirmed' : card.annual_fee === 0 ? 'no fee' : `${formatMoney(card.annual_fee, { currency: card.currency })} a year`}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {Object.values(available).some((v) => v > 0) ? (
                      <>
                        <T variant="subheading">{formatBag(available, card.currency)}</T>
                        <T variant="caption" muted>to use</T>
                      </>
                    ) : (
                      <T variant="caption" muted>{benefits} {benefits === 1 ? 'benefit' : 'benefits'}</T>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
                </Row>
              </Pressable>
            ) : null,
          )}
        </Panel>
      ) : null}
    </Screen>
  );
}
