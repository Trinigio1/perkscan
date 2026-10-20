import { router } from 'expo-router';
import { useState } from 'react';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { emptyDraft, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { CardPicker } from '@/components/CardPicker';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { addUserCards } from '@/lib/cards';
import { useData } from '@/lib/data';

export default function AddCard() {
  const { data, refresh } = useData();
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<CardDraft[] | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!drafts) {
    return (
      <Screen edges={[]}>
        <T muted>Pick the cards you want to add.</T>
        <CardPicker
          cards={data.cards}
          selected={selected}
          ownedIds={data.userCards.map((u) => u.card_id)}
          onToggle={(id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])}
        />
        <Button title="Next" disabled={!selected.length} onPress={() => setDrafts(selected.map(emptyDraft))} />
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
      <Button title="Save" onPress={save} loading={busy} />
      <Button title="Back" kind="ghost" onPress={() => setDrafts(null)} />
    </Screen>
  );
}
