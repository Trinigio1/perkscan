import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { InterestPicker } from '@/components/InterestPicker';
import { Steps } from '@/components/Steps';
import { Button, ErrorNote, Screen, T } from '@/components/ui';
import { INTERESTS } from '@/domain/deals';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { space, useColors } from '@/theme';

/** The most common interests first; the rest one tap away. */
const COMMON = ['groceries', 'dining', 'delivery', 'electronics', 'fashion', 'home', 'travel', 'beauty'];

/** Onboarding: what you spend on, so the right deals come first. */
export default function Spending() {
  const c = useColors();
  const { session } = useAuth();
  const [chosen, setChosen] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = INTERESTS.filter((i) => all || COMMON.includes(i.id) || chosen.includes(i.id)).map((i) => ({ id: i.id, label: i.label, icon: i.icon }));

  const next = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (chosen.length) await updateProfile(session.user.id, { interests: chosen });
      router.push('/finish');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Steps step={5} total={6} />
      <View style={{ gap: space.xs }}>
        <T variant="display">What do you spend on?</T>
        <T muted>Pick a few. Deals for these come first, and PerkScan learns the rest from your receipts.</T>
      </View>
      <InterestPicker value={chosen} onChange={setChosen} options={options} />
      {!all ? (
        <Pressable onPress={() => setAll(true)} hitSlop={8} accessibilityRole="button">
          <T variant="label" color={c.accent}>More categories</T>
        </Pressable>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      <Button title={chosen.length ? 'Continue' : 'Skip'} kind={chosen.length ? 'primary' : 'secondary'} icon="arrow-forward" onPress={next} loading={busy} />
    </Screen>
  );
}
