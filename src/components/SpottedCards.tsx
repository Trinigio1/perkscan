import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { spottedCards, spottedLabel, type SpottedCard } from '@/domain/spottedCards';
import { track } from '@/lib/analytics';
import { dismissCardSighting } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { CardArt } from './CardArt';
import { Button, IconBubble, Panel, Row, T } from './ui';

/** The cards the user's email shows they hold but that aren't in PerkScan yet. */
export function useSpottedCards(): SpottedCard[] {
  const { data } = useData();
  return useMemo(() => spottedCards(data.cardSightings, data.userCards, data.cards), [data.cardSightings, data.userCards, data.cards]);
}

/** Opens Add cards with the spotted card (or its issuer's cards) and its last 4 digits filled in. */
function addSpotted(s: SpottedCard) {
  track('spotted_card', { action: s.card ? 'add' : 'pick', matched: !!s.card });
  router.push({
    pathname: '/add-card',
    params: { ...(s.card ? { card: s.card.id } : { issuer: s.issuer }), ...(s.lastFour ? { last4: s.lastFour } : {}) },
  });
}

/** "Is this your card?" for one spotted card: Add it, or Not mine. */
export function SpottedCardPanel({ spotted, more = 0 }: { spotted: SpottedCard; more?: number }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState(false);

  const notMine = async () => {
    setBusy(true);
    try {
      // One call hides every sighting with these digits; named-only sightings each need their own.
      for (const id of spotted.lastFour ? spotted.sightingIds.slice(0, 1) : spotted.sightingIds) await dismissCardSighting(id);
      track('spotted_card', { action: 'not_mine', matched: !!spotted.card });
      await refresh();
      toast('Got it. PerkScan won’t suggest it again.', { tone: 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(false);
    }
  };

  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        {spotted.card ? (
          <CardArt cardId={spotted.card.id} issuer={spotted.card.issuer} name={spotted.card.product_name} size="sm" />
        ) : (
          <IconBubble icon="card" tone="blue" size={36} />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" color={c.accentStrong}>Found in your email</T>
          <T variant="subheading">Is {spottedLabel(spotted)} yours?</T>
          <T variant="caption" muted>
            {spotted.card ? 'Add it to see its credits, protections and perks.' : `Pick which ${spotted.issuer} card it is to see its credits, protections and perks.`}
          </T>
        </View>
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <Button title={spotted.card ? 'Add it' : 'Pick the card'} size="sm" icon="add" onPress={() => addSpotted(spotted)} />
        <Button title="Not mine" size="sm" kind="ghost" onPress={notMine} loading={busy} />
        {more > 0 ? (
          <Pressable onPress={() => router.push('/cards')} hitSlop={8} style={{ marginLeft: 'auto' }}>
            <Row gap={2}>
              <T variant="label" color={c.accent}>{more} more</T>
              <Ionicons name="chevron-forward" size={14} color={c.accent} />
            </Row>
          </Pressable>
        ) : null}
      </Row>
    </Panel>
  );
}

/** Every spotted card, for the cards screen. */
export function SpottedCardList() {
  const spotted = useSpottedCards();
  if (!spotted.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <T variant="overline" muted>In your email</T>
      {spotted.map((s) => (
        <SpottedCardPanel key={s.key} spotted={s} />
      ))}
    </View>
  );
}
