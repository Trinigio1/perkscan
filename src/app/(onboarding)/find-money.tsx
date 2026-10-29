import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ListRow } from '@/components/ListRow';
import { Steps } from '@/components/Steps';
import { Button, Panel, Row, Screen, T, type IconName } from '@/components/ui';
import { space, useColors } from '@/theme';

const FINDS: { icon: IconName; text: string }[] = [
  { icon: 'card', text: 'Which card earns most, and what the wrong one cost you' },
  { icon: 'cash', text: 'Refunds, price drops and double charges' },
  { icon: 'ticket', text: 'Credits, codes and gift cards before they expire' },
];

/** Onboarding: connecting a bank (or email) is the most useful thing a new user can do, so it gets its own step. */
export default function FindMoney() {
  const c = useColors();
  return (
    <Screen>
      <Steps step={4} total={6} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Find what you’re missing</T>
        <T muted>Connect your bank for the fastest start: PerkScan looks at your card purchases and shows what you’re missing in about a minute. Email adds receipts, codes and refunds.</T>
      </View>

      <View style={{ gap: space.sm }}>
        {FINDS.map((f) => (
          <Row key={f.text} gap={space.sm}>
            <Ionicons name={f.icon} size={18} color={c.accent} />
            <T style={{ flex: 1 }}>{f.text}</T>
          </Row>
        ))}
      </View>

      <Panel style={{ paddingVertical: space.xs }}>
        <ListRow icon="business" tone="teal" title="Bank" subtitle="Fastest: about a minute, read-only" onPress={() => router.push('/connect-bank')} />
        <ListRow icon="mail" tone="blue" title="Gmail" subtitle="About 5 minutes, once, on a computer" onPress={() => router.push('/connect-gmail')} />
        <ListRow icon="chatbubbles" tone="green" title="Bank texts" subtitle="Card alerts by SMS, on your phone" onPress={() => router.push('/connect-texts')} />
      </Panel>
      <T variant="caption" faint>Read-only: PerkScan can never move money. It keeps only the last four digits of a card, and email text is deleted within a day.</T>

      <Button title="Continue" icon="arrow-forward" onPress={() => router.push('/spending')} />
      <Button title="I’ll do this later" kind="ghost" onPress={() => router.push('/spending')} />
    </Screen>
  );
}
