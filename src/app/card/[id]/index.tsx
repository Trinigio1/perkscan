import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Button, ErrorNote, IconBubble, Panel, Row, Screen, T } from '@/components/ui';
import { draftToRow, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { formatMoney, PERIOD_LABELS } from '@/domain/format';
import type { BenefitType, Card, CardBenefit, Opportunity, Receipt } from '@/domain/types';
import { benefitIcon, offerIcon } from '@/domain/visuals';
import { useData } from '@/lib/data';
import { rematchReceipts } from '@/lib/inbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

const SECTIONS: { type: BenefitType; title: string; blurb: string }[] = [
  { type: 'credit', title: 'Credits', blurb: 'Statement credits that reset on a schedule.' },
  { type: 'protection', title: 'Protections', blurb: 'Insurance-style coverage when you pay with this card.' },
  { type: 'perk', title: 'Perks', blurb: 'Status, access and other extras.' },
];

function BenefitLine({ b, card }: { b: CardBenefit; card: Card }) {
  const c = useColors();
  const { icon, tone } = benefitIcon(b.name, b.type);
  const currency = b.currency ?? card.currency;
  const amount =
    b.type === 'protection'
      ? b.max_coverage !== null ? `Up to ${formatMoney(b.max_coverage, { currency })}` : null
      : b.amount !== null ? `${formatMoney(b.amount, { currency })}${b.period === 'per_claim' ? '' : ` · ${PERIOD_LABELS[b.period].toLowerCase()}`}` : null;
  return (
    <Row gap={space.md} style={{ paddingVertical: space.sm, alignItems: 'flex-start' }}>
      <IconBubble icon={icon} tone={tone} size={36} />
      <View style={{ flex: 1, gap: 4 }}>
        <Row>
          <T variant="subheading" style={{ flex: 1 }}>{b.name}</T>
          {b.source_url ? (
            <Pressable accessibilityLabel="Open issuer terms" onPress={() => Linking.openURL(b.source_url!)} hitSlop={10}>
              <Ionicons name="open-outline" size={16} color={c.textFaint} />
            </Pressable>
          ) : null}
        </Row>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {amount ? <Badge label={amount} tone="good" /> : <Badge label="Not verified" />}
          {b.type === 'credit' && b.period !== 'per_claim' && b.period_anchor === 'cardmember_year' ? <Badge label="Resets on anniversary" /> : null}
          {b.enrollment_required ? <Badge label="Enroll first" icon="alert-circle" tone="warn" /> : null}
        </Row>
        {b.terms_summary ? <T variant="caption" muted>{b.terms_summary}</T> : null}
      </View>
    </Row>
  );
}

const TYPE_LABELS: Record<string, string> = {
  electronics: 'Electronics', appliance: 'Appliance', phone: 'Phone', clothing: 'Clothing', other_goods: 'Shopping',
  phone_bill: 'Phone bill', flight: 'Flight', car_rental: 'Car rental', hotel: 'Hotel', travel_other: 'Travel',
  food_delivery: 'Food delivery', rideshare: 'Rideshare', restaurant: 'Restaurant', groceries: 'Groceries',
  subscription: 'Subscription', service: 'Service', other: 'Purchase',
};

/** Receipts paid with this card, each with the protections or credit it triggered. */
function Purchases({ receipts, opportunities }: { receipts: Receipt[]; opportunities: Opportunity[] }) {
  const linked = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    if (!o.source_receipt_id || o.status === 'dismissed' || (o.type !== 'protection' && o.type !== 'return_window')) continue;
    linked.set(o.source_receipt_id, [...(linked.get(o.source_receipt_id) ?? []), o]);
  }
  return (
    <View style={{ gap: space.sm }}>
      <View>
        <T variant="heading">Recent purchases on this card</T>
        <T variant="caption" muted>From receipts and bank alerts that show this card’s last 4 digits.</T>
      </View>
      <Panel style={{ paddingVertical: space.xs }}>
        {receipts.length === 0 ? (
          <T variant="caption" muted style={{ paddingVertical: space.md }}>
            Nothing matched yet. Purchases are matched when a receipt or bank alert shows the card’s last 4 digits.
          </T>
        ) : (
          receipts.slice(0, 20).map((r) => {
            const prots = linked.get(r.id) ?? [];
            const { icon, tone } = offerIcon(prots.some((o) => o.type === 'protection') ? 'protection' : 'return_window');
            return (
              <View key={r.id} style={{ paddingVertical: space.sm, gap: 6 }}>
                <Row gap={space.md}>
                  <IconBubble icon={icon} tone={tone} size={36} />
                  <View style={{ flex: 1 }}>
                    <T variant="subheading" numberOfLines={1}>{r.merchant}</T>
                    <T variant="caption" muted>
                      {[r.purchase_date, r.purchase_type ? TYPE_LABELS[r.purchase_type] : null, r.kind === 'card_alert' ? (r.pending ? 'Bank alert · pending' : 'Bank alert') : null].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                  {r.total !== null ? (
                    <T variant="label" style={{ fontVariant: ['tabular-nums'] }}>{formatMoney(r.total, { currency: r.currency })}</T>
                  ) : null}
                </Row>
                {prots.length ? (
                  <Row gap={6} style={{ flexWrap: 'wrap', paddingLeft: 36 + space.md }}>
                    {prots.map((o) => (
                      <Pressable key={o.id} onPress={() => router.push({ pathname: '/offer/[id]', params: { id: o.id } })} accessibilityRole="button">
                        <Badge label={o.type === 'protection' ? protectionLabel(o.benefit_id) : 'Return window'} icon="shield-checkmark" tone="good" />
                      </Pressable>
                    ))}
                  </Row>
                ) : (
                  <T variant="caption" faint style={{ paddingLeft: 36 + space.md }}>No protections apply</T>
                )}
              </View>
            );
          })
        )}
      </Panel>
    </View>
  );
}

function protectionLabel(benefitId: string | null): string {
  const kind = benefitId?.split('__')[1] ?? '';
  return kind ? kind.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) : 'Protection';
}

export default function CardScreen() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refresh } = useData();
  const uc = data.userCards.find((x) => x.id === id);
  const card = uc ? data.cards.find((x) => x.id === uc.card_id) : undefined;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!uc || !card) {
    return (
      <Screen edges={[]}>
        <T muted>This card was removed.</T>
      </Screen>
    );
  }
  const benefits = data.benefits.filter((b) => b.card_id === card.id);

  const startEdit = () => {
    setDraft({ card_id: uc.card_id, last_four: uc.last_four, open_date: uc.open_date ?? '', nickname: uc.nickname ?? '' });
    setEditing(true);
  };

  const save = async () => {
    if (!draft || Object.keys(validateDraft(draft)).length) return;
    setBusy(true);
    setError(null);
    const { card_id: _ignored, ...patch } = draftToRow(draft);
    const { error: e } = await supabase.from('user_cards').update(patch).eq('id', uc.id);
    setBusy(false);
    if (e) return setError(e.code === '23505' ? 'You already have this card with those last 4 digits.' : e.message);
    setEditing(false);
    toast('Card updated');
    // New last 4 digits can match receipts that didn't match before.
    await rematchReceipts();
    refresh();
  };

  const doRemove = async () => {
    const { error: e } = await supabase.from('user_cards').delete().eq('id', uc.id);
    if (e) return setError(e.message);
    await refresh();
    toast('Card removed', { tone: 'info' });
    router.back();
  };

  const remove = () => {
    // Alert buttons aren't supported on web; fall back to the browser's confirm dialog there.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Remove this card? Its credit history in PerkScan will be deleted too.')) doRemove();
      return;
    }
    Alert.alert('Remove this card?', 'Its credit history in PerkScan will be deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doRemove },
    ]);
  };

  return (
    <Screen edges={[]}>
      <CardArt cardId={card.id} issuer={card.issuer} name={uc.nickname || card.product_name.replace(/®/g, '')} lastFour={uc.last_four} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <T variant="caption" muted>Annual fee</T>
          <T variant="heading">{card.annual_fee === null ? 'Not verified' : formatMoney(card.annual_fee, { currency: card.currency })}</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T variant="caption" muted>Opened</T>
          <T variant="heading">{uc.open_date ?? '—'}</T>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Button
          title="Worth the fee?"
          icon="calculator"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/card/[id]/worth-it', params: { id: uc.id } })}
        />
        <Button title={editing ? 'Cancel' : 'Edit'} icon={editing ? 'close' : 'create-outline'} kind="secondary" onPress={() => (editing ? setEditing(false) : startEdit())} />
      </Row>

      {editing && draft ? (
        <>
          <CardDetailsForm card={card} benefits={data.benefits} draft={draft} onChange={setDraft} errors={validateDraft(draft)} />
          <T variant="caption" muted>Changing the open date rebuilds unused credit periods for this card.</T>
          <Button title="Save changes" icon="checkmark" onPress={save} loading={busy} />
        </>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}

      {SECTIONS.map(({ type, title, blurb }) => {
        const list = benefits.filter((b) => b.type === type);
        if (!list.length) return null;
        return (
          <View key={type} style={{ gap: space.sm }}>
            <View>
              <T variant="heading">{title}</T>
              <T variant="caption" muted>{blurb}</T>
            </View>
            <Panel style={{ paddingVertical: space.xs }}>
              {list.map((b) => <BenefitLine key={b.id} b={b} card={card} />)}
            </Panel>
          </View>
        );
      })}

      <Purchases receipts={data.receipts.filter((r) => r.matched_user_card_id === uc.id)} opportunities={data.opportunities} />

      <Disclaimer />
      <Button title="Remove card" kind="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}
