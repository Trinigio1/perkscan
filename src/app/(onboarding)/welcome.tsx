import { router } from 'expo-router';
import { View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Hero } from '@/components/Hero';
import { Button, IconBubble, Row, Screen, T } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { IconTone } from '@/domain/visuals';
import { space, useColors } from '@/theme';

const STEPS: { icon: IconName; tone: IconTone; title: string; body: string }[] = [
  { icon: 'card', tone: 'blue', title: 'Add your cards', body: 'Just the name and last 4 digits.' },
  { icon: 'pricetags', tone: 'green', title: 'We track every credit', body: 'Monthly, quarterly and yearly — and when each resets.' },
  { icon: 'notifications', tone: 'orange', title: 'Get nudged in time', body: 'A reminder a week and two days before money expires.' },
];

export default function Welcome() {
  const c = useColors();
  return (
    <Screen>
      <Hero style={{ marginTop: space.sm }}>
        <T variant="overline" color={c.heroMuted}>Welcome to PerkScan</T>
        <T variant="title" color={c.heroText}>Premium cards come with credits most people forget to use.</T>
        <View style={{ marginTop: space.lg, transform: [{ rotate: '-4deg' }], width: '78%', alignSelf: 'center' }}>
          <CardArt cardId="amex_platinum" issuer="Your card" name="Credits you’re owed" lastFour="1234" size="md" />
        </View>
        <T color={c.heroMuted} style={{ marginTop: space.lg }}>
          Let’s make sure none of yours expire unused.
        </T>
      </Hero>
      <View style={{ gap: space.lg }}>
        {STEPS.map((s) => (
          <Row key={s.title} gap={space.md} style={{ alignItems: 'flex-start' }}>
            <IconBubble icon={s.icon} tone={s.tone} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="subheading">{s.title}</T>
              <T variant="caption" muted>{s.body}</T>
            </View>
          </Row>
        ))}
      </View>
      <Button title="Get started" icon="arrow-forward" onPress={() => router.push('/where')} />
    </Screen>
  );
}
