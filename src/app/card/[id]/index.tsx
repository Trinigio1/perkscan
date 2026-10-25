import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { ConfidenceTag } from '@/components/ConfidenceTag';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Button, ErrorNote, IconBubble, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { draftToRow, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { checkedLabel, formatMoney, PERIOD_LABELS } from '@/domain/format';
import type { BenefitType, Card, CardBenefit, Opportunity, Receipt } from '@/domain/types';
import { benefitIcon, offerIcon } from '@/domain/visuals';
import { useData } from '@/lib/data';
import { rematchReceipts } from '@/lib/inbox';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

type Tab = BenefitType | 'purchases';
const TABS: { value: Tab; label: string }[] = [
  { value: 'credit', label: 'Credits' },
  { value: 'protection', label: 'Protections' },
  { value: 'perk', label: 'Perks' },
  { value: 'purchases', label: 'Purchases' },
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
          {amount ? <Badge label={amount} tone="good" /> : null}
          {b.type === 'credit' && b.period !== 'per_claim' && b.period_anchor === 'cardmember_year' ? <Badge label="Resets on anniversary" /> : null}
          {b.enrollment_required ? <Badge label="Enroll first" icon="alert-circle" tone="warn" /> : null}
          <ConfidenceTag value={b.status === 'active' ? 'confirmed' : 'check'} />
        </Row>
        {b.terms_summary ? <T variant="caption" muted numberOfLines={2}>{b.terms_summary}</T> : null}
        {b.status === 'active' && checkedLabel(b.last_verified) ? <T variant="caption" faint>{checkedLabel(b.last_verified)} on the official site</T> : null}
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
    if (!o.source_receipt_id || o.status === 'dismissed' || !['protection', 'return_window', 'price_drop'].includes(o.type)) continue;
    linked.set(o.source_receipt_id, [...(linked.get(o.source_receipt_id) ?? []), o]);
  }
  return (
    <View style={{ gap: space.sm }}>
      <Panel style={{ paddingVertical: space.xs }}>
        {receipts.length === 0 ? (
          <T variant="caption" muted style={{ paddingVertical: space.md }}>
            No purchases yet. They appear when a receipt or bank alert shows this card’s last 4 digits.
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
                        <Badge label={o.type === 'protection' ? protectionLabel(o.benefit_id) : o.type === 'price_drop' ? 'Price drop window' : 'Return window'} icon="shield-checkmark" tone="good" />
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
  // Protections without a card benefit come from the receipt itself: a stated warranty.
  if (!benefitId) return 'Warranty';
  const kind = benefitId.split('__')[1] ?? '';
  return kind ? kind.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) : 'Protection';
}

export default function CardScreen() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refresh } = useData();
  const uc = data.userCards.find((x) => x.id === id);
  const card = uc ? data.cards.find((x) => x.id === uc.card_id) : undefined;
  const [tab, setTab] = useState<Tab>('credit');
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
  const membership = card.kind === 'membership';
  const what = membership ? 'membership' : 'card';
  // Only tabs with something in them; purchases always.
  const tabs = TABS.filter((t) => t.value === 'purchases' || benefits.some((b) => b.type === t.value));
  const shownTab = tabs.some((t) => t.value === tab) ? tab : tabs[0]!.value;

  const startEdit = () => {
    setDraft({ card_id: uc.card_id, last_four: uc.last_four ?? '', open_date: uc.open_date ?? '', nickname: uc.nickname ?? '' });
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
    toast(membership ? 'Membership removed' : 'Card removed', { tone: 'info' });
    router.back();
  };

  const remove = () => {
    // Alert buttons aren't supported on web; fall back to the browser's confirm dialog there.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Remove this ${what}? Its credit history in PerkScan will be deleted too.`)) doRemove();
      return;
    }
    Alert.alert(`Remove this ${what}?`, 'Its credit history in PerkScan will be deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doRemove },
    ]);
  };

  return (
    <Screen edges={[]}>
      <CardArt cardId={card.id} issuer={card.issuer} name={uc.nickname || card.product_name.replace(/®/g, '')} lastFour={uc.last_four ?? undefined} />
      <Row gap={space.sm}>
        <View style={{ flex: 1 }}>
          <T variant="caption" muted>{membership ? 'Yearly price' : 'Annual fee'}</T>
          <T variant="subheading">{card.annual_fee === null ? (membership ? 'Depends on your plan' : 'Unconfirmed') : card.annual_fee === 0 ? 'None' : formatMoney(card.annual_fee, { currency: card.currency })}</T>
        </View>
        <Button title="Worth it?" icon="calculator" size="sm" kind="secondary" onPress={() => router.push({ pathname: '/card/[id]/worth-it', params: { id: uc.id } })} />
        {membership ? (
          <Button title="Remove" icon="trash-outline" size="sm" kind="secondary" onPress={remove} />
        ) : (
          <Button title={editing ? 'Cancel' : 'Edit'} icon={editing ? 'close' : 'create-outline'} size="sm" kind="secondary" onPress={() => (editing ? setEditing(false) : startEdit())} />
        )}
      </Row>

      {editing && draft ? (
        <>
          <CardDetailsForm card={card} benefits={data.benefits} draft={draft} onChange={setDraft} errors={validateDraft(draft)} />
          <T variant="caption" muted>Changing the open date rebuilds unused credit periods for this card.</T>
          <Button title="Save changes" icon="checkmark" onPress={save} loading={busy} />
        </>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}

      <Segmented<Tab> value={shownTab} onChange={setTab} options={tabs.map((t) => ({ label: t.label, value: t.value }))} />

      {shownTab === 'purchases' ? (
        <Purchases receipts={data.receipts.filter((r) => r.matched_user_card_id === uc.id)} opportunities={data.opportunities} />
      ) : (
        <Panel style={{ paddingVertical: space.xs }}>
          {benefits.filter((b) => b.type === shownTab).map((b) => <BenefitLine key={b.id} b={b} card={card} />)}
        </Panel>
      )}

      <Disclaimer />
      <Button title="Remove card" kind="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}
