import { View } from 'react-native';
import type { CardDraft } from '@/domain/cardDraft';
import type { Card, CardBenefit } from '@/domain/types';
import { space } from '@/theme';
import { CardArt } from './CardArt';
import { Field, Panel } from './ui';

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
    <Panel style={{ gap: space.lg }}>
      <CardArt
        cardId={card.id}
        issuer={card.issuer}
        name={draft.nickname.trim() || card.product_name.replace(/®/g, '')}
        lastFour={draft.last_four.padEnd(4, '•')}
        size="md"
      />
      <View style={{ gap: space.md }}>
        <Field
          label="Last 4 digits"
          value={draft.last_four}
          onChangeText={(v) => onChange({ ...draft, last_four: v.replace(/\D/g, '').slice(0, 4) })}
          placeholder="1234"
          keyboardType="number-pad"
          maxLength={4}
          error={errors.last_four}
          hint="Matches receipts to this card. Never enter your full number."
        />
        <Field
          label={needsOpenDate ? 'Card open date · recommended' : 'Card open date · optional'}
          value={draft.open_date}
          onChangeText={(v) => onChange({ ...draft, open_date: v.replace(/[^\d-]/g, '').slice(0, 10) })}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          error={errors.open_date}
          hint={
            needsOpenDate
              ? 'Some credits on this card reset on your card anniversary, not Jan 1.'
              : 'Helps with anniversary-based benefits.'
          }
        />
        <Field
          label="Nickname · optional"
          value={draft.nickname}
          onChangeText={(v) => onChange({ ...draft, nickname: v })}
          placeholder="e.g. Personal Plat"
          error={errors.nickname}
        />
      </View>
    </Panel>
  );
}
