import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { INTERESTS, dealValue, type RankedDeal } from '@/domain/deals';
import { eventWhen } from '@/domain/events';
import { formatMoney } from '@/domain/format';
import { track } from '@/lib/analytics';
import { useData } from '@/lib/data';
import { sendDealFeedback } from '@/lib/deals';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { ConfidenceTag } from './ConfidenceTag';
import { Badge, Button, IconBubble, Row, T, type IconName } from './ui';

const today = () => new Date().toISOString().slice(0, 10);

/** A store deal: what, where, until when, why it's for you — and Save, Hide, Details. */
export function DealRow({ item }: { item: RankedDeal }) {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const d = item.deal;
  const interest = INTERESTS.find((i) => i.id === d.category) ?? INTERESTS[INTERESTS.length - 1]!;
  const saved = data.dealFeedback.some((f) => f.deal_id === d.id && f.action === 'saved');
  const money = (n: number) => formatMoney(n, { currency: d.currency ?? undefined });
  const value = dealValue(d, money);
  const when = d.ends_on ? eventWhen({ starts_on: d.starts_on && d.starts_on > today() ? d.starts_on : today(), ends_on: d.ends_on }, today()) : 'No end date listed';
  const soon = /^(Today|Ends)/.test(when);

  // Copy the code (if any) and open the store's own page.
  const claim = async () => {
    if (d.code) {
      await Clipboard.setStringAsync(d.code);
      toast(`Copied ${d.code}`);
    }
    if (d.url) await Linking.openURL(d.url);
    track('deal_claimed');
  };

  const act = async (action: 'saved' | 'dismissed' | 'didnt_work') => {
    setBusy(true);
    setMenu(false);
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
          {d.source === 'shared' ? <T variant="caption" faint>{d.seen_by} PerkScan users near you got this</T> : null}

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

          {/* Claim takes you there (code copied); Save keeps it for later; the rest behind "⋯". */}
          <Row gap={space.sm} style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {d.url || d.code ? <Button title="Claim" icon={d.url ? 'open-outline' : 'copy-outline'} size="sm" onPress={claim} /> : null}
            {saved ? (
              <Row gap={4} style={{ flex: 1 }}>
                <Ionicons name="checkmark-circle" size={16} color={c.accentStrong} />
                <T variant="label" color={c.accentStrong}>Saved</T>
              </Row>
            ) : (
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <Button title="Save" kind="secondary" icon="bookmark-outline" size="sm" onPress={() => act('saved')} loading={busy} />
              </View>
            )}
            <Pressable
              onPress={() => setMenu(!menu)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`More for ${d.title}`}
              style={({ pressed }) => ({ padding: 6, borderRadius: 999, backgroundColor: menu || pressed ? c.surfaceAlt : 'transparent' })}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={c.textMuted} />
            </Pressable>
          </Row>
          {menu ? (
            <View style={{ marginTop: 4, borderRadius: 12, backgroundColor: c.surfaceAlt, overflow: 'hidden' }}>
              {saved ? (
                <MenuItem icon="alert-circle-outline" label="It didn’t work" onPress={() => act('didnt_work')} />
              ) : (
                <MenuItem icon="eye-off-outline" label="Not for me" onPress={() => act('dismissed')} />
              )}
            </View>
          ) : null}
        </View>
      </Row>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={16} color={c.textMuted} />
      <T variant="label">{label}</T>
    </Pressable>
  );
}
