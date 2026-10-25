import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { eventConfidence, eventWhen, reminderFor, type LocalEvent } from '@/domain/events';
import type { Suggestion } from '@/domain/suggestions';
import { useData } from '@/lib/data';
import { addItem } from '@/lib/programs';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { ConfidenceTag } from './ConfidenceTag';
import { IconBubble, Row, T, type IconName } from './ui';

const EVENT_ICON: Record<LocalEvent['category'], { icon: IconName; tone: 'green' | 'blue' | 'orange' | 'purple' | 'teal' | 'pink' }> = {
  bank_promo: { icon: 'card', tone: 'green' },
  free_day: { icon: 'ticket', tone: 'teal' },
  enrollment: { icon: 'clipboard', tone: 'blue' },
  deadline: { icon: 'hourglass', tone: 'orange' },
  sale: { icon: 'pricetag', tone: 'pink' },
  student: { icon: 'school', tone: 'purple' },
};

const today = () => new Date().toISOString().slice(0, 10);

/** An event near you: when, what, how sure, and "Remind me" so it lands in Money with a deadline. */
export function EventRow({ e }: { e: LocalEvent }) {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const reminded = data.opportunities.some((o) => o.status === 'open' && o.dedupe_key?.startsWith('manual:') && o.title === e.title);
  const when = eventWhen(e, today());
  const soon = /^(Today|Tomorrow|Ends)/.test(when);
  const { icon, tone } = EVENT_ICON[e.category];

  const remind = async () => {
    setBusy(true);
    try {
      const r = reminderFor(e);
      await addItem({ type: r.type, title: r.title, expiresOn: r.expiresOn, note: r.note, currency: null, unconfirmed: r.unconfirmed });
      await refresh();
      toast('Added to Money — you’ll get a reminder', { tone: 'success' });
    } catch (err) {
      toast((err as Error).message, { tone: 'info' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingVertical: space.md, gap: 6 }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={icon} tone={tone} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{e.title}</T>
          <T variant="caption" color={soon ? c.warn : c.textMuted}>{when}</T>
          <T variant="caption" numberOfLines={3}>{e.summary}</T>
          {e.status === 'expected' && e.based_on ? <T variant="caption" faint>Not announced yet. {e.based_on}</T> : null}
          <Row gap={space.lg} style={{ marginTop: 4 }}>
            <ConfidenceTag value={eventConfidence(e)} />
            {reminded ? (
              <Row gap={4}>
                <Ionicons name="checkmark-circle" size={14} color={c.accentStrong} />
                <T variant="caption" color={c.accentStrong}>Reminder set</T>
              </Row>
            ) : (
              <Pressable onPress={remind} disabled={busy} hitSlop={8} accessibilityRole="button">
                <T variant="label" color={c.accent}>{busy ? 'Adding…' : 'Remind me'}</T>
              </Pressable>
            )}
            <Pressable onPress={() => Linking.openURL(e.url)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Open details for ${e.title}`}>
              <Row gap={4}>
                <T variant="label" color={c.accent}>{e.category === 'bank_promo' || e.category === 'sale' ? 'Claim' : 'Details'}</T>
                <Ionicons name="open-outline" size={13} color={c.accent} />
              </Row>
            </Pressable>
          </Row>
        </View>
      </Row>
    </View>
  );
}

/** Something you probably qualify for, with one action and a way to hide it. */
export function SuggestionRow({ s, onHide }: { s: Suggestion; onHide: () => void }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: space.md }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={s.icon} tone={s.tone} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{s.title}</T>
          <T variant="caption" muted numberOfLines={2}>{s.body}</T>
          <Pressable onPress={() => router.push({ pathname: s.action.pathname, params: s.action.params })} hitSlop={6} accessibilityRole="button">
            <T variant="label" color={c.accent} style={{ marginTop: 4 }}>{s.action.label} ›</T>
          </Pressable>
        </View>
        <Pressable onPress={onHide} hitSlop={10} accessibilityLabel={`Hide: ${s.title}`}>
          <Ionicons name="close" size={18} color={c.textFaint} />
        </Pressable>
      </Row>
    </View>
  );
}
