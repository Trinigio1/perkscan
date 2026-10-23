import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { InterestPicker } from '@/components/InterestPicker';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { US_STATES } from '@/domain/usStates';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useDeals } from '@/lib/deals';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

/** Pick what you're into (and your US state), so the right deals come first. */
export default function Interests() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  const { picked, suggested } = useDeals();
  const toast = useToast();
  const [chosen, setChosen] = useState<string[]>(picked.length ? picked : suggested);
  const [state, setState] = useState<string | null>(data.profile?.region ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUS = data.profile?.country === 'US';

  const save = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(session.user.id, { interests: chosen, ...(isUS ? { region: state } : {}) });
      track('interests_saved', { count: chosen.length });
      await refresh();
      toast('Saved');
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>Deals for these come first. PerkScan also learns from your receipts and what you save.</T>
      <InterestPicker value={chosen} onChange={setChosen} />
      {isUS ? (
        <View style={{ gap: space.sm }}>
          <T variant="subheading">Your state</T>
          <T variant="caption" muted>For deals and dates that only apply in one state.</T>
          <InterestPicker
            options={US_STATES.map((s) => ({ id: s.code, label: s.code }))}
            value={state ? [state] : []}
            onChange={(v) => setState(v.find((x) => x !== state) ?? null)}
          />
        </View>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Save" onPress={save} loading={busy} />
    </Screen>
  );
}
