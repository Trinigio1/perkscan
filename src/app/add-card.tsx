import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { emptyDraft, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { CardPicker } from '@/components/CardPicker';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { addUserCards } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';

export default function AddCard() {
  const { data, refresh } = useData();
  const toast = useToast();
  // From a card spotted in email: the card itself (or its issuer to pick from) and its last 4 digits.
  const params = useLocalSearchParams<{ card?: string; issuer?: string; last4?: string }>();
  const last4 = params.last4 && /^\d{4}$/.test(params.last4) ? params.last4 : '';
  const withDigits = (d: CardDraft): CardDraft => ({ ...d, last_four: last4 });
  const spottedCard = params.card && data.cards.some((c) => c.id === params.card) ? params.card : null;
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<CardDraft[] | null>(spottedCard ? [withDigits(emptyDraft(spottedCard))] : null);
  const [allIssuers, setAllIssuers] = useState(false);
  const issuerKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const issuer = params.issuer && !allIssuers ? issuerKey(params.issuer) : null;
  const choices = useMemo(
    () => (issuer ? data.cards.filter((c) => issuerKey(c.issuer).startsWith(issuer) || issuer.startsWith(issuerKey(c.issuer))) : data.cards),
    [data.cards, issuer],
  );
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!drafts) {
    return (
      <Screen edges={[]}>
        <T muted>{issuer && choices.length ? `Which ${params.issuer} card is it?` : 'Pick the cards you want to add. You can pick several.'}</T>
        <CardPicker
          cards={issuer && choices.length ? choices : data.cards}
          selected={selected}
          ownedIds={data.userCards.map((u) => u.card_id)}
          country={data.profile?.country ?? null}
          onToggle={(id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])}
        />
        <Button
          title={selected.length ? `Next · ${selected.length} selected` : 'Pick a card'}
          icon={selected.length ? 'arrow-forward' : undefined}
          disabled={!selected.length}
          onPress={() => setDrafts(selected.map((id, i) => (i === 0 ? withDigits(emptyDraft(id)) : emptyDraft(id))))}
        />
        {issuer && choices.length ? <Button title="Not listed: show all cards" kind="ghost" onPress={() => setAllIssuers(true)} /> : null}
      </Screen>
    );
  }

  const errors = drafts.map(validateDraft);
  const save = async () => {
    setShowErrors(true);
    if (!errors.every((e) => Object.keys(e).length === 0)) return;
    setBusy(true);
    setError(null);
    try {
      await addUserCards(drafts);
      await refresh();
      toast(drafts.length > 1 ? `${drafts.length} cards added` : 'Card added');
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      {drafts.map((d, i) => {
        const card = data.cards.find((c) => c.id === d.card_id);
        return card ? (
          <CardDetailsForm
            key={d.card_id}
            card={card}
            benefits={data.benefits}
            draft={d}
            errors={showErrors ? errors[i]! : {}}
            onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
          />
        ) : null;
      })}
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Save" icon="checkmark" onPress={save} loading={busy} />
      <Button title="Back" kind="ghost" onPress={() => setDrafts(null)} />
    </Screen>
  );
}
