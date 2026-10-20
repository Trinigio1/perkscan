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
import type { BenefitType, CardBenefit } from '@/domain/types';
import { benefitIcon } from '@/domain/visuals';
import { useData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

const SECTIONS: { type: BenefitType; title: string; blurb: string }[] = [
  { type: 'credit', title: 'Credits', blurb: 'Statement credits that reset on a schedule.' },
  { type: 'protection', title: 'Protections', blurb: 'Insurance-style coverage when you pay with this card.' },
  { type: 'perk', title: 'Perks', blurb: 'Status, access and other extras.' },
];

function BenefitLine({ b }: { b: CardBenefit }) {
  const c = useColors();
  const { icon, tone } = benefitIcon(b.name, b.type);
  const amount =
    b.type === 'protection'
      ? b.max_coverage !== null ? `Up to ${formatMoney(b.max_coverage)}` : null
      : b.amount !== null ? `${formatMoney(b.amount)}${b.period === 'per_claim' ? '' : ` · ${PERIOD_LABELS[b.period].toLowerCase()}`}` : null;
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
          <T variant="heading">{card.annual_fee === null ? 'Not verified' : formatMoney(card.annual_fee)}</T>
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
              {list.map((b) => <BenefitLine key={b.id} b={b} />)}
            </Panel>
          </View>
        );
      })}

      <Disclaimer />
      <Button title="Remove card" kind="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}
