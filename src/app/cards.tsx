import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Button, Empty, IconBubble, Panel, Row, Screen, T } from '@/components/ui';
import { addToBag, formatBag, formatMoney, relativeDays, shortCardName, type MoneyBag } from '@/domain/format';
import { PERK_GROUPS, perkGroup } from '@/domain/perks';
import { remainingValue } from '@/domain/score';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const GROUP_RANK = new Map(PERK_GROUPS.map((g, i) => [g.group, i]));

/** Your cards: what's left to use on each, the next credit to reset, and its best perk. */
export default function Cards() {
  const c = useColors();
  const { data } = useData();
  const { recoveredByOpp } = useLookups();

  const rows = useMemo(() => {
    const now = new Date();
    return data.userCards.map((uc) => {
      const card = data.cards.find((x) => x.id === uc.card_id);
      const open = data.opportunities
        .filter((o) => o.user_card_id === uc.id && o.type === 'card_credit' && o.status === 'open' && o.expires_at && new Date(o.expires_at) > now)
        .sort((a, b) => a.expires_at!.localeCompare(b.expires_at!));
      const benefits = data.benefits.filter((b) => b.card_id === uc.card_id);
      // The perk worth knowing about first: airport and travel before rewards and card services; checked ones first.
      const topPerk = benefits
        .filter((b) => b.type !== 'credit')
        .sort((a, b) => (GROUP_RANK.get(perkGroup(a)) ?? 9) - (GROUP_RANK.get(perkGroup(b)) ?? 9) || Number(b.status === 'active') - Number(a.status === 'active'))[0];
      const next = open[0];
      return {
        uc,
        card,
        available: open.reduce((bag, o) => addToBag(bag, o.currency, remainingValue(o, recoveredByOpp)), {} as MoneyBag),
        benefits: benefits.length,
        next: next ? `${next.title} · resets ${relativeDays(new Date(next.expires_at!), now)}` : null,
        topPerk: topPerk?.name ?? null,
      };
    });
  }, [data, recoveredByOpp]);

  if (!rows.length) {
    return (
      <Screen edges={[]}>
        <Empty icon="card" title="No cards yet" body="Add the cards you carry to see their credits and perks." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      {rows.map(({ uc, card, available, benefits, next, topPerk }) =>
        card ? (
          <Panel key={uc.id} onPress={() => router.push({ pathname: '/card/[id]', params: { id: uc.id } })} style={{ gap: space.md }}>
            <Row gap={space.md}>
              <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" />
              <View style={{ flex: 1 }}>
                <T variant="subheading" numberOfLines={2}>{uc.nickname || shortCardName(card.product_name)}</T>
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
            {next || topPerk ? (
              <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
                {next ? (
                  <Row gap={space.sm}>
                    <Ionicons name="time-outline" size={15} color={c.textMuted} />
                    <T variant="caption" muted style={{ flex: 1 }} numberOfLines={2}>Next: {next}</T>
                  </Row>
                ) : null}
                {topPerk ? (
                  <Row gap={space.sm}>
                    <Ionicons name="star-outline" size={15} color={c.textMuted} />
                    <T variant="caption" muted style={{ flex: 1 }} numberOfLines={2}>{topPerk}</T>
                  </Row>
                ) : null}
              </View>
            ) : null}
          </Panel>
        ) : null,
      )}

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

      <Button title="Add a card" icon="add" kind="secondary" onPress={() => router.push('/add-card')} />
    </Screen>
  );
}
