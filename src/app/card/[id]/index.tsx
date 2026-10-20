import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { draftToRow, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Button, ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney, PERIOD_LABELS } from '@/domain/format';
import type { BenefitType, CardBenefit } from '@/domain/types';
import { useData } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { space, useColors } from '@/theme';

const SECTIONS: { type: BenefitType; title: string }[] = [
  { type: 'credit', title: 'Credits' },
  { type: 'protection', title: 'Protections' },
  { type: 'perk', title: 'Perks' },
];

function BenefitLine({ b }: { b: CardBenefit }) {
  const c = useColors();
  const amount =
    b.type === 'protection'
      ? b.max_coverage !== null ? `Up to ${formatMoney(b.max_coverage)}` : null
      : b.amount !== null ? `${formatMoney(b.amount)} ${b.period === 'per_claim' ? '' : `· ${PERIOD_LABELS[b.period].toLowerCase()}`}` : null;
  return (
    <View style={{ paddingVertical: space.sm, gap: 4 }}>
      <Row>
        <T variant="label" style={{ flex: 1 }}>{b.name}</T>
        {b.source_url ? (
          <Pressable accessibilityLabel="Open issuer terms" onPress={() => Linking.openURL(b.source_url!)} hitSlop={8}>
            <Ionicons name="open-outline" size={16} color={c.textFaint} />
          </Pressable>
        ) : null}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        {amount ? <Badge label={amount} tone="good" /> : <Badge label="Amount not verified" />}
        {b.type === 'credit' && b.period !== 'per_claim' && b.period_anchor === 'cardmember_year' ? <Badge label="Resets on card anniversary" /> : null}
        {b.enrollment_required ? <Badge label="Enrollment required" icon="alert-circle-outline" /> : null}
      </Row>
      {b.terms_summary ? <T variant="caption" muted>{b.terms_summary}</T> : null}
    </View>
  );
}

export default function CardScreen() {
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
    refresh();
  };

  const remove = () =>
    Alert.alert('Remove this card?', 'Its credit history in PerkScan will be deleted too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error: e } = await supabase.from('user_cards').delete().eq('id', uc.id);
          if (e) return setError(e.message);
          await refresh();
          router.back();
        },
      },
    ]);

  return (
    <Screen edges={[]}>
      <View style={{ gap: 2 }}>
        <T variant="label" faint>{card.issuer}</T>
        <T variant="title">{uc.nickname || card.product_name}</T>
        <T muted>•••• {uc.last_four}{uc.open_date ? ` · opened ${uc.open_date}` : ''}</T>
      </View>

      <Row>
        <View style={{ flex: 1 }}>
          <Button title="Worth the fee?" icon="scale-outline" onPress={() => router.push({ pathname: '/card/[id]/worth-it', params: { id: uc.id } })} />
        </View>
        <Button title={editing ? 'Cancel' : 'Edit'} kind="secondary" onPress={() => (editing ? setEditing(false) : startEdit())} />
      </Row>

      {editing && draft ? (
        <>
          <CardDetailsForm card={card} benefits={data.benefits} draft={draft} onChange={setDraft} errors={validateDraft(draft)} />
          <Button title="Save changes" onPress={save} loading={busy} />
          <T variant="caption" muted>Changing the open date rebuilds unused credit periods for this card.</T>
        </>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}

      <Panel>
        <Row>
          <T variant="heading" style={{ flex: 1 }}>Annual fee</T>
          <T variant="heading">{card.annual_fee === null ? 'Not verified' : formatMoney(card.annual_fee)}</T>
        </Row>
      </Panel>

      {SECTIONS.map(({ type, title }) => {
        const list = benefits.filter((b) => b.type === type);
        if (!list.length) return null;
        return (
          <Panel key={type}>
            <T variant="heading">{title}</T>
            {list.map((b) => <BenefitLine key={b.id} b={b} />)}
          </Panel>
        );
      })}

      <Disclaimer />
      <Button title="Remove card" kind="danger" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}
