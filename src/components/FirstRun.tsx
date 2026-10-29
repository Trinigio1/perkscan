import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { countLabel, type FoundMoney } from '@/domain/firstRun';
import { formatBag } from '@/domain/format';
import type { SetupStep } from '@/domain/money';
import { space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T, type IconName } from './ui';

const TIPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkles', title: 'Your total', body: 'The big number is what you could save. The lines under it show what’s ready now and what’s an estimate (≈).' },
  { icon: 'wallet', title: 'Money', body: 'Every credit, code and gift card in one list, soonest first. Mark things used to track what you get back.' },
  { icon: 'pricetags', title: 'Deals', body: 'Offers your own inbox won’t show you, picked for what you’re into and where you live.' },
];

/** Three short tips on first open. */
export function Tour({ onDone }: { onDone: () => void }) {
  const c = useColors();
  const [i, setI] = useState(0);
  const tip = TIPS[i]!;
  const last = i === TIPS.length - 1;
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={tip.icon} tone="green" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" faint>Quick tour · {i + 1} of {TIPS.length}</T>
          <T variant="subheading">{tip.title}</T>
          <T variant="caption" muted>{tip.body}</T>
        </View>
        <Pressable onPress={onDone} hitSlop={10} accessibilityLabel="Skip the tour">
          <Ionicons name="close" size={18} color={c.textFaint} />
        </Pressable>
      </Row>
      <Row gap={space.sm} style={{ justifyContent: 'flex-end' }}>
        {TIPS.map((_, k) => (
          <View key={k} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.border }} />
        ))}
        <View style={{ flex: 1 }} />
        <Button title={last ? 'Got it' : 'Next'} size="sm" kind={last ? 'primary' : 'secondary'} onPress={() => (last ? onDone() : setI(i + 1))} />
      </Row>
    </Panel>
  );
}

const STEP_COPY: Record<SetupStep['id'], { icon: IconName; title: string; body: string; button: string }> = {
  cards: { icon: 'card', title: 'Add your cards', body: 'PerkScan shows every credit and perk your cards come with.', button: 'Add cards' },
  inbox: {
    icon: 'business',
    title: 'Connect your bank or email',
    body: 'See what you’re missing in about a minute: credits, refunds, double charges and the right card for each purchase.',
    button: 'Connect',
  },
};

/** The one thing to do next, while setup isn't finished. */
export function NextStep({ step }: { step: SetupStep }) {
  const c = useColors();
  const copy = STEP_COPY[step.id];
  return (
    <Panel style={{ gap: space.sm, backgroundColor: c.accentSoft }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={copy.icon} tone="green" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="caption" color={c.accentStrong}>Next step</T>
          <T variant="subheading">{copy.title}</T>
          <T variant="caption">{copy.body}</T>
        </View>
      </Row>
      <View style={{ alignItems: 'flex-start' }}>
        <Button title={copy.button} size="sm" icon="arrow-forward" onPress={() => router.push(step.route)} />
      </View>
    </Panel>
  );
}

/** "We found $340 for you", until it's opened or hidden. Opens the full breakdown. */
export function Found({ found, home, onDone }: { found: FoundMoney; home: string; onDone: () => void }) {
  const c = useColors();
  const money = Object.values(found.total).some((v) => v > 0);
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="checkmark-done" tone="green" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">
            {money ? `PerkScan found ${formatBag(found.total, home)} for you` : `PerkScan found ${found.itemCount} things for you`}
          </T>
          <T variant="caption" muted>{found.groups.slice(0, 4).map((g) => countLabel(g.kind, g.items.length)).join(' · ')}</T>
        </View>
        <Pressable onPress={onDone} hitSlop={10} accessibilityLabel="Hide">
          <Ionicons name="close" size={18} color={c.textFaint} />
        </Pressable>
      </Row>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          title="See what we found"
          size="sm"
          onPress={() => {
            onDone();
            router.push('/found');
          }}
        />
      </View>
    </Panel>
  );
}
