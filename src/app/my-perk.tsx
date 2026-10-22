import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { ListRow } from '@/components/ListRow';
import { Button, ErrorNote, Field, Note, Panel, Screen, T } from '@/components/ui';
import { useData } from '@/lib/data';
import { deleteMyPerk, saveMyPerk, validatePerk, type PerkDraft } from '@/lib/student';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

/** Add or edit a perk from your own school. */
export default function MyPerk() {
  const toast = useToast();
  const { data, refresh } = useData();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = id ? data.myPerks.find((p) => p.id === id) : undefined;
  const school = data.school;
  const [draft, setDraft] = useState<PerkDraft>({
    title: existing?.title ?? '',
    details: existing?.details ?? '',
    url: existing?.url ?? '',
    suggest: existing?.suggest ?? false,
  });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validatePerk(draft);
  const set = (k: keyof PerkDraft) => (v: string | boolean) => setDraft({ ...draft, [k]: v });
  const close = () => (router.canGoBack() ? router.back() : router.replace('/student'));

  const save = async () => {
    if (Object.keys(errors).length) return setShowErrors(true);
    setBusy(true);
    setError(null);
    try {
      await saveMyPerk(draft, existing?.university_id ?? school?.id ?? null, existing?.id);
      await refresh();
      toast(existing ? 'Perk updated' : 'Perk added');
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (Platform.OS === 'web' && !globalThis.confirm?.('Delete this perk?')) return;
    try {
      await deleteMyPerk(existing.id);
      await refresh();
      toast('Perk deleted', { tone: 'info' });
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>
        A perk {school ? `${school.short_name} gives its students` : 'your school gives students'} that PerkScan doesn’t list — a campus discount,
        free software, a service. Only you can see it.
      </T>
      <Field label="What is it?" value={draft.title} onChangeText={set('title')} placeholder="e.g. Campus bookstore 10% off" maxLength={80} error={showErrors ? errors.title : null} />
      <Field
        label="Details (optional)"
        value={draft.details}
        onChangeText={set('details')}
        placeholder="e.g. Show your student ID at the counter"
        multiline
        maxLength={280}
        error={showErrors ? errors.details : null}
      />
      <Field
        label="Link (optional)"
        value={draft.url}
        onChangeText={set('url')}
        placeholder="https://"
        autoCapitalize="none"
        keyboardType="url"
        error={showErrors ? errors.url : null}
      />
      <Panel style={{ paddingVertical: space.xs }}>
        <ListRow
          icon="paper-plane-outline"
          tone="blue"
          title="Suggest it to PerkScan"
          subtitle={`We may check it and add it for everyone at ${school?.short_name ?? 'your school'}. Only the perk is shared, never your details.`}
          toggle={draft.suggest}
          onToggle={(v) => set('suggest')(v)}
        />
      </Panel>
      {error ? <ErrorNote message={error} /> : null}
      <View style={{ gap: space.sm }}>
        <Button title={existing ? 'Save' : 'Add perk'} icon="checkmark" onPress={save} loading={busy} />
        {existing ? <Button title="Delete" kind="danger" icon="trash-outline" onPress={remove} /> : null}
      </View>
      <Note icon="information-circle-outline">Don’t include personal details like your student ID number.</Note>
    </Screen>
  );
}
