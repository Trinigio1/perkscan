import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CardDetailsForm } from '@/components/CardDetailsForm';
import { emptyDraft, validateDraft, type CardDraft } from '@/domain/cardDraft';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { addUserCards } from '@/lib/cards';
import { useData } from '@/lib/data';
import { space } from '@/theme';
import { useOnboarding } from '@/lib/onboarding';

export default function CardDetails() {
  const { data } = useData();
  const { selected } = useOnboarding();
  const [drafts, setDrafts] = useState<CardDraft[]>(() => selected.map(emptyDraft));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = drafts.map(validateDraft);
  const valid = errors.every((e) => Object.keys(e).length === 0);

  const save = async () => {
    setShowErrors(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await addUserCards(drafts);
      router.push('/finish');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <T variant="label" faint>Step 2 of 3</T>
        <T variant="title">Card details</T>
        <T muted>Just the last 4 digits — that’s all we ever store.</T>
      </View>
      {drafts.map((d, i) => {
        const card = data.cards.find((c) => c.id === d.card_id);
        if (!card) return null;
        return (
          <CardDetailsForm
            key={d.card_id}
            card={card}
            benefits={data.benefits}
            draft={d}
            errors={showErrors ? errors[i]! : {}}
            onChange={(next) => setDrafts(drafts.map((x, j) => (j === i ? next : x)))}
          />
        );
      })}
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Save cards" onPress={save} loading={busy} />
      <Button title="Back" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
