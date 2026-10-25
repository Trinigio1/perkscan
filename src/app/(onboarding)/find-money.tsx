import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { ListRow } from '@/components/ListRow';
import { Steps } from '@/components/Steps';
import { Button, Panel, Row, Screen, T, type IconName } from '@/components/ui';
import { space, useColors } from '@/theme';

const FINDS: { icon: IconName; text: string }[] = [
  { icon: 'ticket', text: 'Promo codes and gift cards before they expire' },
  { icon: 'cash', text: 'Refunds, price drops and return windows' },
  { icon: 'shield-checkmark', text: 'Card protections on what you buy' },
];

/** Onboarding: connecting email is the most useful thing a new user can do, so it gets its own step. */
export default function FindMoney() {
  const c = useColors();
  return (
    <Screen>
      <Steps step={4} total={5} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Find money in your email</T>
        <T muted>Most of what you’re owed arrives by email. Connect it and PerkScan finds it by itself.</T>
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
        <ListRow icon="mail" tone="blue" title="Gmail" subtitle="About 5 minutes, once, on a computer" onPress={() => router.push('/connect-gmail')} />
        <ListRow icon="chatbubbles" tone="green" title="Bank texts" subtitle="Card alerts by SMS, on your phone" onPress={() => router.push('/connect-texts')} />
      </Panel>
      <T variant="caption" faint>Only the emails and texts PerkScan needs are read, card numbers are hidden, and the text is deleted within a day.</T>

      <Button title="Continue" icon="arrow-forward" onPress={() => router.push('/finish')} />
      <Button title="I’ll do this later" kind="ghost" onPress={() => router.push('/finish')} />
    </Screen>
  );
}
