import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { INTERESTS, dealValue, type RankedDeal } from '@/domain/deals';
import { eventWhen } from '@/domain/events';
import { formatMoney } from '@/domain/format';
import { useData } from '@/lib/data';
import { sendDealFeedback } from '@/lib/deals';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { ConfidenceTag } from './ConfidenceTag';
import { Badge, IconBubble, Row, T } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/** A store deal: what, where, until when, why it's for you — and Save, Hide, Details. */
export function DealRow({ item }: { item: RankedDeal }) {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const d = item.deal;
  const interest = INTERESTS.find((i) => i.id === d.category) ?? INTERESTS[INTERESTS.length - 1]!;
  const saved = data.dealFeedback.some((f) => f.deal_id === d.id && f.action === 'saved');
  const money = (n: number) => formatMoney(n, { currency: d.currency ?? undefined });
  const value = dealValue(d, money);
  const when = d.ends_on ? eventWhen({ starts_on: d.starts_on && d.starts_on > today() ? d.starts_on : today(), ends_on: d.ends_on }, today()) : 'No end date listed';
  const soon = /^(Today|Ends)/.test(when);

  const act = async (action: 'saved' | 'dismissed' | 'didnt_work') => {
    setBusy(true);
    try {
      await sendDealFeedback(d.id, action);
      await refresh();
      toast(action === 'saved' ? 'Saved to Money — you’ll get a reminder' : action === 'dismissed' ? 'Hidden. You’ll see fewer like it.' : 'Thanks — we’ll take it down if others agree', { tone: action === 'saved' ? 'success' : 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ paddingVertical: space.md, gap: 6 }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon={interest.icon} tone={interest.tone} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{d.title}</T>
          <T variant="caption" muted numberOfLines={1}>
            {d.merchant} · <T variant="caption" color={soon ? c.warn : c.textMuted}>{when}</T>
          </T>
          {d.summary ? <T variant="caption" numberOfLines={2}>{d.summary}</T> : null}
          {item.why ? (
            <Row gap={4}>
              <Ionicons name="sparkles" size={12} color={c.accentStrong} />
              <T variant="caption" color={c.accentStrong}>{item.why}</T>
            </Row>
          ) : null}
          {d.source === 'shared' ? <T variant="caption" faint>Code {d.seen_by} PerkScan users near you received</T> : null}

          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
            {value ? <Badge label={value} tone="good" /> : null}
            {d.min_spend !== null ? <Badge label={`On ${money(d.min_spend)}+`} /> : null}
            {d.code ? (
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(d.code!);
                  toast(`Copied ${d.code}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Copy code ${d.code}`}
                hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: c.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}
              >
                <T variant="label" color={c.accent}>{d.code}</T>
                <Ionicons name="copy-outline" size={12} color={c.accent} />
              </Pressable>
            ) : null}
            <ConfidenceTag value={d.confidence} />
          </Row>

          <Row gap={space.lg} style={{ marginTop: 6 }}>
            {saved ? (
              <Row gap={4}>
                <Ionicons name="checkmark-circle" size={14} color={c.accentStrong} />
                <T variant="caption" color={c.accentStrong}>Saved</T>
              </Row>
            ) : (
              <Pressable onPress={() => act('saved')} disabled={busy} hitSlop={8} accessibilityRole="button">
                <T variant="label" color={c.accent}>Save</T>
              </Pressable>
            )}
            {saved ? (
              <Pressable onPress={() => act('didnt_work')} disabled={busy} hitSlop={8} accessibilityRole="button">
                <T variant="label" color={c.textMuted}>Didn’t work?</T>
              </Pressable>
            ) : (
              <Pressable onPress={() => act('dismissed')} disabled={busy} hitSlop={8} accessibilityRole="button">
                <T variant="label" color={c.textMuted}>Not for me</T>
              </Pressable>
            )}
            {d.url ? (
              <Pressable onPress={() => Linking.openURL(d.url!)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Open ${d.merchant}’s page`}>
                <Row gap={4}>
                  <T variant="label" color={c.accent}>Details</T>
                  <Ionicons name="open-outline" size={13} color={c.accent} />
                </Row>
              </Pressable>
            ) : null}
          </Row>
        </View>
      </Row>
    </View>
  );
}
