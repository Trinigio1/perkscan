import { router } from 'expo-router';
import { View } from 'react-native';
import { CardPicker } from '@/components/CardPicker';
import { Button, Screen, T } from '@/components/ui';
import { useData } from '@/lib/data';
import { space } from '@/theme';
import { useOnboarding } from '@/lib/onboarding';

export default function PickCards() {
  const { data } = useData();
  const { selected, setSelected } = useOnboarding();
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <T variant="label" faint>Step 1 of 3</T>
        <T variant="title">Which cards do you have?</T>
        <T muted>We’ll track each card’s credits and remind you before they reset.</T>
      </View>
      <CardPicker cards={data.cards} selected={selected} onToggle={toggle} />
      <Button
        title={selected.length ? `Continue with ${selected.length} card${selected.length > 1 ? 's' : ''}` : 'Pick at least one card'}
        disabled={!selected.length}
        onPress={() => router.push('/details')}
      />
      <Button title="Skip for now" kind="ghost" onPress={() => router.push('/finish')} />
    </Screen>
  );
}
