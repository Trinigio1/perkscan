import { View } from 'react-native';
import type { CardDraft } from '@/domain/cardDraft';
import type { Card, CardBenefit } from '@/domain/types';
import { space } from '@/theme';
import { Field, Panel, T } from './ui';

export function CardDetailsForm({
  card,
  benefits,
  draft,
  onChange,
  errors,
}: {
  card: Card;
  benefits: CardBenefit[];
  draft: CardDraft;
  onChange: (d: CardDraft) => void;
  errors: Partial<Record<keyof CardDraft, string>>;
}) {
  const needsOpenDate = benefits.some((b) => b.card_id === card.id && b.period_anchor === 'cardmember_year');
  return (
    <Panel>
      <View style={{ gap: 2, marginBottom: space.sm }}>
        <T variant="label" faint>{card.issuer}</T>
        <T variant="heading">{card.product_name}</T>
      </View>
      <View style={{ gap: space.md }}>
        <Field
          label="Last 4 digits"
          value={draft.last_four}
          onChangeText={(v) => onChange({ ...draft, last_four: v.replace(/\D/g, '').slice(0, 4) })}
          placeholder="1234"
          keyboardType="number-pad"
          maxLength={4}
          error={errors.last_four}
          hint="Used to match receipts to this card. Never enter your full card number."
        />
        <Field
          label={needsOpenDate ? 'Card open date (recommended)' : 'Card open date (optional)'}
          value={draft.open_date}
          onChangeText={(v) => onChange({ ...draft, open_date: v.replace(/[^\d-]/g, '').slice(0, 10) })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          error={errors.open_date}
          hint={
            needsOpenDate
              ? 'Some credits on this card reset on your card anniversary, not January 1. Without it we use calendar years.'
              : 'Helps with anniversary-based benefits.'
          }
        />
        <Field
          label="Nickname (optional)"
          value={draft.nickname}
          onChangeText={(v) => onChange({ ...draft, nickname: v })}
          placeholder="e.g. Personal Plat"
          error={errors.nickname}
        />
      </View>
    </Panel>
  );
}
