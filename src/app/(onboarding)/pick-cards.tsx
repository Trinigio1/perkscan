import { router } from 'expo-router';
import { View } from 'react-native';
import { CardPicker } from '@/components/CardPicker';
import { Steps } from '@/components/Steps';
import { Button, Screen, T } from '@/components/ui';
import { useData } from '@/lib/data';
import { useOnboarding } from '@/lib/onboarding';
import { space } from '@/theme';

export default function PickCards() {
  const { data } = useData();
  const { selected, setSelected } = useOnboarding();
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Screen>
      <Steps step={2} total={6} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Which cards do you carry?</T>
        <T muted>Pick all that apply. You can add more later.</T>
      </View>
      <CardPicker cards={data.cards} selected={selected} onToggle={toggle} country={data.profile?.country ?? null} />
      <Button
        title={selected.length ? `Continue with ${selected.length} card${selected.length > 1 ? 's' : ''}` : 'Pick at least one card'}
        icon={selected.length ? 'arrow-forward' : undefined}
        disabled={!selected.length}
        onPress={() => router.push('/details')}
      />
      <Button title="Skip for now" kind="ghost" onPress={() => router.push('/find-money')} />
    </Screen>
  );
}
