import { router } from 'expo-router';
import { useState } from 'react';
import { InterestPicker } from '@/components/InterestPicker';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { MONTHS } from '@/domain/moments';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';

/** Your birth month (only the month), so PerkScan can tell you when birthday rewards are ready. */
export default function Birthday() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  const toast = useToast();
  const [month, setMonth] = useState<number | null>(data.profile?.birth_month ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: number | null) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(session.user.id, { birth_month: value });
      await refresh();
      toast(value ? 'Saved' : 'Removed');
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>Many stores give a free birthday reward to members. On the 1st of your birthday month, PerkScan lists the ones at stores you use. Only the month is kept, never the day or year.</T>
      <InterestPicker
        options={MONTHS.map((m, i) => ({ id: String(i + 1), label: m }))}
        value={month ? [String(month)] : []}
        onChange={(v) => setMonth(Number(v.find((x) => x !== String(month)) ?? 0) || null)}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Save" onPress={() => save(month)} loading={busy} disabled={!month} />
      {data.profile?.birth_month ? <Button title="Remove my birthday month" kind="ghost" onPress={() => save(null)} disabled={busy} /> : null}
    </Screen>
  );
}
