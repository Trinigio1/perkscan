import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, Empty, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { formatBag, relativeDays } from '@/domain/format';
import { readReport, type ReadOutcome } from '@/domain/readReport';
import type { InboundMessage } from '@/domain/types';
import type { IconTone } from '@/domain/visuals';
import { useData } from '@/lib/data';
import { countMessages, listMessages, retryFailed, type MessageTotals } from '@/lib/inbox';
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

/** Messages per page in the list; "Show more" adds another page. */
const PAGE = 200;

const OUTCOME_COLOR: Record<ReadOutcome, 'accent' | 'muted' | 'warn' | 'bad'> = { found: 'accent', receipt: 'muted', nothing: 'muted', failed: 'bad', waiting: 'warn' };

/** "What PerkScan read": every email and text it got, what it found in each, or why it found nothing. */
export default function Inbox() {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const [messages, setMessages] = useState<InboundMessage[] | null>(null);
  const [totals, setTotals] = useState<MessageTotals | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, t] = await Promise.all([listMessages(shown), countMessages()]);
      setMessages(list);
      setTotals(t);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [shown]);

  // Loading reruns with the bigger page (the list on screen is refetched, so it stays in order).
  const showMore = () => {
    setLoadingMore(true);
    setShown((n) => n + PAGE);
  };

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

  const report = useMemo(() => (messages ? readReport(messages, data.opportunities) : null), [messages, data.opportunities]);
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
        Message text is deleted once read. Only what’s listed below is kept.
      </Note>
      {messages?.length ? (
        <Button title="Check what PerkScan read" icon="checkmark-done" kind="secondary" onPress={() => router.push('/review')} />
      ) : null}
      {report && messages?.length ? (
        <Panel style={{ gap: space.sm }}>
          {totals ? (
            <T variant="caption" muted>
              {totals.total.toLocaleString('en-US')} email{totals.total === 1 ? '' : 's'} received in all
              {totals.waiting ? ` · ${totals.waiting.toLocaleString('en-US')} still waiting to be read` : ''}
            </T>
          ) : null}
          <T variant="subheading">
            {totals && totals.total <= messages.length ? 'All' : 'Latest'} {messages.length} message{messages.length === 1 ? '' : 's'}: {report.offers} offer{report.offers === 1 ? '' : 's'} found
            {Object.keys(report.money).length ? ` worth ${formatBag(report.money)}` : ''}
          </T>
          <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
            <Count n={report.counts.found} label="had something to use" color={c.accentStrong} />
            <Count n={report.counts.receipt} label="receipts" color={c.text} />
            <Count n={report.counts.nothing} label="nothing to use" color={c.textMuted} />
            {report.counts.failed ? <Count n={report.counts.failed} label="couldn’t read" color={c.danger} /> : null}
            {report.counts.waiting ? <Count n={report.counts.waiting} label="waiting" color={c.warn} /> : null}
          </Row>
          <T variant="caption" muted>
            Something missing? Label the email “PerkScan” in Gmail and it’s sent next time, or check what was read and tell PerkScan what it got wrong.
          </T>
        </Panel>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      {needsRetry ? <Button title={`Try again (${needsRetry})`} icon="refresh" kind="secondary" loading={busy} onPress={retry} /> : null}
      {messages && messages.length === 0 ? (
        <Empty icon="mail" title="Nothing here yet" body="Once your Gmail script or texts Shortcut runs, what it sends shows up here." action={<Button title="Set up Gmail" icon="settings" onPress={() => router.push('/connect-gmail')} />} />
      ) : null}
      {messages && messages.length && report ? (
        <Panel style={{ paddingVertical: space.xs }}>
          {report!.lines.map(({ message: m, outcome, detail }, i) => {
            const k = KIND[m.kind ?? 'other'] ?? KIND.other!;
            const tone = OUTCOME_COLOR[outcome];
            return (
              <Row key={m.id} gap={space.md} style={[{ paddingVertical: space.md, alignItems: 'flex-start' }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}>
                {outcome === 'failed' ? <IconBubble icon="alert-circle" tone="orange" /> : <IconBubble icon={k.icon} tone={outcome === 'found' || outcome === 'receipt' ? k.tone : 'gray'} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="subheading" numberOfLines={1}>{m.summary ?? (m.source !== 'email' ? 'Text message' : m.from_domain ? `Email from ${m.from_domain}` : 'Email')}</T>
                  {m.summary && m.from_domain ? <T variant="caption" faint numberOfLines={1}>{m.from_domain}</T> : null}
                  <T variant="caption" color={tone === 'accent' ? c.accentStrong : tone === 'bad' ? c.danger : tone === 'warn' ? c.warn : c.textMuted} numberOfLines={3}>
                    {outcome === 'found' ? `Found: ${detail}` : detail}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Row gap={4}>
                    <Ionicons name={m.source === 'email' ? 'mail-outline' : 'chatbubble-outline'} size={12} color={c.textFaint} />
                    <T variant="caption" faint>{relativeDays(new Date(m.received_at), new Date())}</T>
                  </Row>
                  {outcome === 'found' ? <Ionicons name="checkmark-circle" size={16} color={c.accent} /> : null}
                </View>
              </Row>
            );
          })}
        </Panel>
      ) : null}
      {messages && totals && totals.total > messages.length ? (
        <Button
          title={`Show ${Math.min(PAGE, totals.total - messages.length)} more (${messages.length.toLocaleString('en-US')} of ${totals.total.toLocaleString('en-US')} shown)`}
          icon="chevron-down"
          kind="secondary"
          loading={loadingMore}
          onPress={showMore}
        />
      ) : null}
    </Screen>
  );
}

function Count({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <T variant="caption" color={color}>
      <T variant="label" color={color}>{n}</T> {label}
    </T>
  );
}
