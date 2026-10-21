import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, Empty, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { relativeDays } from '@/domain/format';
import type { InboundMessage } from '@/domain/types';
import type { IconTone } from '@/domain/visuals';
import { useData } from '@/lib/data';
import { listMessages, retryFailed } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

const KIND: Record<string, { icon: IconName; tone: IconTone; label: string }> = {
  receipt: { icon: 'receipt', tone: 'green', label: 'Receipt' },
  card_alert: { icon: 'card', tone: 'blue', label: 'Card alert' },
  promo: { icon: 'ticket', tone: 'orange', label: 'Promo' },
  gift_card_or_store_credit: { icon: 'gift', tone: 'pink', label: 'Gift card / credit' },
  loyalty: { icon: 'star', tone: 'purple', label: 'Points' },
  trial_or_subscription: { icon: 'hourglass', tone: 'blue', label: 'Trial' },
  settlement: { icon: 'document-text', tone: 'teal', label: 'Settlement' },
  other: { icon: 'mail-open', tone: 'gray', label: 'Nothing to act on' },
};

function statusLine(m: InboundMessage): { text: string; color?: 'warn' | 'bad' } {
  switch (m.parse_status) {
    case 'pending':
      return { text: m.parse_error ?? 'Waiting to be read', color: m.parse_error ? 'warn' : undefined };
    case 'parsing':
      return { text: 'Reading…' };
    case 'failed':
      return { text: m.parse_error ?? 'Couldn’t read this email', color: 'bad' };
    case 'ignored':
      return { text: 'No offers or receipts found' };
    default:
      return { text: KIND[m.kind ?? 'other']?.label ?? 'Read' };
  }
}

export default function Inbox() {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [messages, setMessages] = useState<InboundMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMessages(await listMessages(100));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const retry = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await retryFailed();
      const ok = (r.results ?? []).filter((x) => x.status === 'parsed').length;
      toast(ok ? `${ok} email${ok === 1 ? '' : 's'} read` : 'Nothing new to read', { tone: ok ? 'success' : 'info' });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const needsRetry = (messages ?? []).filter((m) => m.parse_status === 'failed' || m.parse_status === 'pending').length;

  return (
    <Screen
      edges={[]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([load(), refresh()]);
            setRefreshing(false);
          }}
          tintColor={c.accent}
        />
      }
    >
      <Note icon="lock-closed-outline">
        Only emails you label “PerkScan” and texts your Shortcut sends (or you paste) come here. Their text is deleted as
        soon as it’s been read; only what’s listed below is kept.
      </Note>
      {error ? <ErrorNote message={error} /> : null}
      {needsRetry ? <Button title={`Try again (${needsRetry})`} icon="refresh" kind="secondary" loading={busy} onPress={retry} /> : null}
      {messages && messages.length === 0 ? (
        <Empty icon="mail" title="Nothing here yet" body="Once your Gmail script or texts Shortcut runs, what it sends shows up here." action={<Button title="Set up Gmail" icon="settings" onPress={() => router.push('/connect-gmail')} />} />
      ) : null}
      {messages && messages.length ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {messages.map((m, i) => {
            const k = KIND[m.kind ?? 'other'] ?? KIND.other!;
            const s = statusLine(m);
            const failed = m.parse_status === 'failed';
            return (
              <Row key={m.id} gap={space.md} style={[{ paddingVertical: space.md }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}>
                {failed ? <IconBubble icon="alert-circle" tone="orange" /> : <IconBubble icon={k.icon} tone={m.parse_status === 'parsed' ? k.tone : 'gray'} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading" numberOfLines={1}>{m.summary ?? (m.source !== 'email' ? 'Text message' : m.from_domain ? `Email from ${m.from_domain}` : 'Email')}</T>
                  <T variant="caption" color={s.color === 'bad' ? c.danger : s.color === 'warn' ? c.warn : c.textMuted} numberOfLines={2}>
                    {s.text}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Row gap={4}>
                    <Ionicons name={m.source === 'email' ? 'mail-outline' : 'chatbubble-outline'} size={12} color={c.textFaint} />
                    <T variant="caption" faint>{relativeDays(new Date(m.received_at), new Date())}</T>
                  </Row>
                  {m.parse_status === 'parsed' ? <Ionicons name="checkmark-circle" size={16} color={c.accent} /> : null}
                </View>
              </Row>
            );
          })}
        </Panel>
      ) : null}
    </Screen>
  );
}
