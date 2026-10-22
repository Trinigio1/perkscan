import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Disclaimer } from '@/components/Disclaimer';
import { OfferRow } from '@/components/OfferRow';
import { Button, Chip, Empty, Note, Panel, Row, Screen, T } from '@/components/ui';
import { checkoutStack, guessCategory, knownMerchants, SPEND_LABELS, type CardPick, type Reason, type SpendCategory } from '@/domain/checkout';
import { formatMoney } from '@/domain/format';
import { track } from '@/lib/analytics';
import { useData, useLookups } from '@/lib/data';
import { font, radius, space, useColors } from '@/theme';

/** "Before you pay": which card to use at a store, plus any codes or credit for it. */
export default function Checkout() {
  const c = useColors();
  const { data } = useData();
  const { recoveredByOpp, userCardLabel } = useLookups();
  const params = useLocalSearchParams<{ merchant?: string }>();
  const [query, setQuery] = useState(params.merchant ?? '');
  const [merchant, setMerchant] = useState<string | null>(params.merchant ?? null);
  const [category, setCategory] = useState<SpendCategory | null>(null);

  const suggestions = useMemo(() => knownMerchants(data.receipts, data.opportunities, data.benefits), [data]);
  const q = query.trim().toLowerCase();
  const matches = (q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions).slice(0, 8);

  const pick = (name: string) => {
    const m = name.trim();
    if (!m) return;
    setQuery(m);
    setMerchant(m);
    setCategory(guessCategory(m, data.receipts));
    track('checkout_viewed', { has_cards: data.userCards.length > 0 });
  };

  const stack = useMemo(
    () =>
      merchant && category
        ? checkoutStack(merchant, category, {
            cards: data.cards,
            benefits: data.benefits,
            userCards: data.userCards,
            opportunities: data.opportunities,
            receipts: data.receipts,
            recoveredByOpp,
            now: new Date(),
            money: (n, cur) => formatMoney(n, { currency: cur }),
          })
        : null,
    [merchant, category, data, recoveredByOpp],
  );
  const now = new Date();

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.lg }}>
        <Ionicons name="storefront-outline" size={18} color={c.textFaint} />
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setMerchant(null);
          }}
          onSubmitEditing={() => pick(query)}
          placeholder="Where are you paying? e.g. Courts"
          placeholderTextColor={c.textFaint}
          returnKeyType="search"
          autoFocus={!merchant}
          accessibilityLabel="Store name"
          style={{ flex: 1, paddingVertical: 13, fontSize: 16, fontFamily: font.medium, color: c.text }}
        />
        {query && !merchant ? (
          <Pressable onPress={() => pick(query)} hitSlop={10} accessibilityLabel="Check this store">
            <Ionicons name="arrow-forward-circle" size={26} color={c.accent} />
          </Pressable>
        ) : null}
      </View>

      {!merchant ? (
        matches.length ? (
          <View style={{ gap: space.sm }}>
            <T variant="overline" muted>{q ? 'Matching stores' : 'Stores PerkScan knows'}</T>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {matches.map((m) => (
                <Chip key={m} label={m} onPress={() => pick(m)} />
              ))}
            </Row>
          </View>
        ) : (
          <T variant="caption" muted>Type a store and press enter.</T>
        )
      ) : null}

      {merchant && category ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>What are you buying?</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {(Object.keys(SPEND_LABELS) as SpendCategory[]).map((k) => (
              <Chip key={k} label={SPEND_LABELS[k]} selected={category === k} onPress={() => setCategory(k)} />
            ))}
          </Row>
        </View>
      ) : null}

      {stack ? (
        <>
          {data.userCards.length === 0 ? (
            <Empty icon="card" title="No cards yet" body="Add your cards to see which one to use." action={<Button title="Add cards" icon="add" onPress={() => router.push('/add-card')} />} />
          ) : (
            <Panel style={{ gap: space.md }}>
              <T variant="overline" muted>Pay with</T>
              {stack.best ? (
                <CardChoice pick={stack.best} label={userCardLabel(stack.best.userCardId)} highlight />
              ) : (
                <T muted>No card stands out here — nothing PerkScan knows about (credits or protections) applies at {merchant}.</T>
              )}
              {stack.cards.filter((p) => p !== stack.best && p.reasons.length).map((p) => (
                <View key={p.userCardId} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
                  <CardChoice pick={p} label={userCardLabel(p.userCardId)} />
                </View>
              ))}
            </Panel>
          )}

          <View style={{ gap: space.sm }}>
            <T variant="heading">Use with it</T>
            {stack.promos.length + stack.storeCredit.length === 0 ? (
              <T variant="caption" muted>No open codes, gift cards or store credit for {merchant} in PerkScan.</T>
            ) : (
              <Panel style={{ paddingVertical: space.xs }}>
                {[...stack.storeCredit, ...stack.promos].map((o, i) => (
                  <View key={o.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                    <OfferRow opp={o} now={now} />
                  </View>
                ))}
              </Panel>
            )}
          </View>

          <Note icon="information-circle-outline">
            Points and cash-back rates aren’t compared yet — PerkScan only uses the credits and protections it knows about
            for your cards. Unverified terms are marked.
          </Note>
          <Disclaimer />
        </>
      ) : null}
    </Screen>
  );
}

function CardChoice({ pick, label, highlight }: { pick: CardPick; label: string; highlight?: boolean }) {
  const c = useColors();
  const color = (r: Reason) => (r.tone === 'warn' ? c.warn : r.tone === 'good' ? c.accentStrong : c.textMuted);
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.md}>
        <CardArt cardId={pick.card.id} issuer={pick.card.issuer} name={pick.card.product_name} size="sm" />
        <View style={{ flex: 1 }}>
          <T variant={highlight ? 'heading' : 'subheading'} numberOfLines={1}>{label}</T>
          {highlight ? <T variant="caption" color={c.accentStrong}>Best choice here</T> : null}
        </View>
      </Row>
      {pick.reasons.map((r) => (
        <Row key={r.text} gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Ionicons
            name={r.kind === 'credit' ? 'pricetag' : r.kind === 'protection' ? 'shield-checkmark' : r.tone === 'warn' ? 'alert-circle' : 'cash-outline'}
            size={14}
            color={color(r)}
            style={{ marginTop: 2 }}
          />
          <T variant="caption" style={{ flex: 1 }} color={r.tone === 'warn' ? c.warn : undefined}>{r.text}</T>
        </Row>
      ))}
    </View>
  );
}
