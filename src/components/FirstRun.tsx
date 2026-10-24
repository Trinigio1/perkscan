import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { FoundSummary } from '@/domain/firstRun';
import type { SetupStep } from '@/domain/money';
import { space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T, type IconName } from './ui';

const TIPS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkles', title: 'Your total', body: 'The big number is money you can use now. Tap it to see where it comes from.' },
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
    icon: 'mail',
    title: 'Connect your email',
    body: 'Codes, gift cards, refunds and card alerts hiding in your inbox show up here by themselves.',
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

/** "PerkScan found 5 things in your email", once, after the first scan. */
export function Found({ summary, onDone }: { summary: FoundSummary; onDone: () => void }) {
  const c = useColors();
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="checkmark-done" tone="green" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">PerkScan found {summary.total} {summary.total === 1 ? 'thing' : 'things'} in your email</T>
          <T variant="caption" muted>{summary.parts.slice(0, 4).map((p) => p.label).join(' · ')}</T>
        </View>
        <Pressable onPress={onDone} hitSlop={10} accessibilityLabel="Hide">
          <Ionicons name="close" size={18} color={c.textFaint} />
        </Pressable>
      </Row>
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          title="See them"
          size="sm"
          kind="secondary"
          onPress={() => {
            onDone();
            router.push('/money');
          }}
        />
      </View>
    </Panel>
  );
}
