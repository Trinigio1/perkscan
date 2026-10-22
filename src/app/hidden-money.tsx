import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Button, ErrorNote, IconBubble, Loading, Panel, Row, Screen, T, type IconName } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { programSections, type Program, type ProgramKind } from '@/domain/programs';
import type { IconTone } from '@/domain/visuals';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { listPrograms } from '@/lib/programs';
import { space, useColors } from '@/theme';

const SECTION_ICON: Record<ProgramKind, { icon: IconName; tone: IconTone }> = {
  unclaimed: { icon: 'search', tone: 'green' },
  loyalty: { icon: 'star', tone: 'purple' },
  deadline_rule: { icon: 'hourglass', tone: 'orange' },
  price_adjust: { icon: 'trending-down', tone: 'teal' },
  refund_rule: { icon: 'cash', tone: 'blue' },
  library: { icon: 'library', tone: 'pink' },
};

/** Other places money hides: unclaimed balances, expiring points, price drops, refunds, library perks. */
export default function HiddenMoney() {
  const c = useColors();
  const { data } = useData();
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = data.profile?.country ?? null;

  useEffect(() => {
    track('hidden_money_viewed');
    listPrograms()
      .then(setPrograms)
      .catch((e: Error) => setError(e.message));
  }, []);

  const sections = programs ? programSections(programs, country) : [];

  return (
    <Screen edges={[]}>
      <T muted>
        {countryByCode(country) ? `For ${countryByCode(country)!.name}. ` : ''}Official sources only. Finding your money is always free.
      </T>

      <Panel onPress={() => router.push('/add')}>
        <Row gap={space.md}>
          <IconBubble icon="add" tone="green" size={36} />
          <View style={{ flex: 1 }}>
            <T variant="subheading">Add something you’re owed</T>
            <T variant="caption" muted>Points, gift cards, allowances, refunds</T>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
        </Row>
      </Panel>

      <Panel onPress={() => router.push('/student')}>
        <Row gap={space.md}>
          <IconBubble icon="school" tone="purple" size={36} />
          <T variant="subheading" style={{ flex: 1 }}>Student offers</T>
          <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
        </Row>
      </Panel>

      {error ? <ErrorNote message={error} /> : null}
      {programs === null && !error ? <Loading /> : null}

      {sections.map((s) => (
        <View key={s.kind} style={{ gap: space.sm }}>
          <Row gap={space.sm}>
            <IconBubble icon={SECTION_ICON[s.kind].icon} tone={SECTION_ICON[s.kind].tone} size={32} />
            <T variant="heading" style={{ flex: 1 }}>{s.title}</T>
          </Row>
          <Panel style={{ paddingVertical: space.xs }}>
            {s.programs.map((p, i) => (
              <View key={p.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <ProgramLine p={p} />
              </View>
            ))}
          </Panel>
        </View>
      ))}
    </Screen>
  );
}

function ProgramLine({ p }: { p: Program }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  // Balances you can track: points, and use-it-or-lose-it accounts.
  const addType = p.kind === 'loyalty' ? 'points' : p.kind === 'deadline_rule' ? 'benefit' : null;
  return (
    <View style={{ paddingVertical: space.md, gap: 6 }}>
      <Row>
        <View style={{ flex: 1 }}>
          <T variant="subheading">{p.name}</T>
          <T variant="caption" muted>{p.provider}{p.status === 'active' ? '' : ' · unconfirmed'}</T>
        </View>
        <Pressable onPress={() => Linking.openURL(p.url)} hitSlop={10} accessibilityLabel={`Open ${p.name}`}>
          <Ionicons name="open-outline" size={18} color={c.accent} />
        </Pressable>
      </Row>
      <T variant="caption">{p.summary}</T>
      {open ? (
        <T variant="caption" muted>{p.how_to}</T>
      ) : (
        <Pressable onPress={() => setOpen(true)} hitSlop={6} accessibilityRole="button">
          <T variant="caption" color={c.accent}>How ›</T>
        </Pressable>
      )}
      {addType ? (
        <Button
          title={addType === 'points' ? 'Add my balance' : 'Add my balance and deadline'}
          icon="add"
          size="sm"
          kind="secondary"
          style={{ alignSelf: 'flex-start' }}
          onPress={() => router.push({ pathname: '/add-item', params: { type: addType, program: p.id } })}
        />
      ) : null}
    </View>
  );
}
