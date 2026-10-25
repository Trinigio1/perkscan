import { router } from 'expo-router';
import { View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Hero } from '@/components/Hero';
import { Button, IconBubble, Row, Screen, T } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { IconTone } from '@/domain/visuals';
import { space, useColors } from '@/theme';

const STEPS: { icon: IconName; tone: IconTone; title: string }[] = [
  { icon: 'card', tone: 'blue', title: 'Card credits and perks' },
  { icon: 'ticket', tone: 'orange', title: 'Codes and gift cards from email and texts' },
  { icon: 'notifications', tone: 'green', title: 'A nudge before anything expires' },
];

export default function Welcome() {
  const c = useColors();
  return (
    <Screen>
      <Hero style={{ marginTop: space.sm }}>
        <T variant="overline" color={c.heroMuted}>Welcome to PerkScan</T>
        <T variant="title" color={c.heroText}>Find the money you’re owed.</T>
        <View style={{ marginTop: space.lg, transform: [{ rotate: '-4deg' }], width: '78%', alignSelf: 'center' }}>
          <CardArt cardId="amex_platinum" issuer="Your card" name="Money you’re owed" lastFour="1234" size="md" />
        </View>
      </Hero>
      <View style={{ gap: space.lg }}>
        {STEPS.map((s) => (
          <Row key={s.title} gap={space.md}>
            <IconBubble icon={s.icon} tone={s.tone} />
            <T variant="subheading" style={{ flex: 1 }}>{s.title}</T>
          </Row>
        ))}
      </View>
      <Button title="Get started" icon="arrow-forward" onPress={() => router.push('/where')} />
    </Screen>
  );
}
