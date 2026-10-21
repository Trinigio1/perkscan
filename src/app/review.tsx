import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { ReadSummary } from '@/components/ReadSummary';
import { Badge, Button, Empty, ErrorNote, Note, Panel, ProgressBar, Row, Screen, Segmented, T } from '@/components/ui';
import { accuracyPercent, reviewsNeeded, topMistakes, type Accuracy } from '@/domain/accuracy';
import { relativeDays } from '@/domain/format';
import { getAccuracy, listForReview, submitReview, type ReviewItem } from '@/lib/feedback';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

type Filter = 'todo' | 'done';

/** Go through what PerkScan read and mark each message right or wrong. */
export default function Review() {
  const c = useColors();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('todo');
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, acc] = await Promise.all([listForReview(), getAccuracy()]);
      setItems(list);
      setAccuracy(acc);
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

  const markRight = async (item: ReviewItem) => {
    setBusy(item.message.id);
    try {
      await submitReview({ messageId: item.message.id, verdict: 'right' });
      toast('Marked right', { tone: 'info' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = (items ?? []).filter((i) => (filter === 'todo' ? !i.review : !!i.review));
  const pct = accuracy ? accuracyPercent(accuracy) : null;
  const need = accuracy ? reviewsNeeded(accuracy) : null;
  const mistakes = accuracy ? topMistakes(accuracy) : [];

  return (
    <Screen
      edges={[]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={c.accent}
        />
      }
    >
      <Panel style={{ gap: space.md }}>
        {accuracy && accuracy.checked > 0 ? (
          <>
            <Row style={{ alignItems: 'baseline' }} gap={6}>
              <T variant="display" color={pct !== null && pct >= 90 ? c.accentStrong : pct !== null && pct < 75 ? c.danger : c.text}>{pct}%</T>
              <T muted>read right</T>
            </Row>
            <ProgressBar value={(pct ?? 0) / 100} />
            <T variant="caption" muted>
              {accuracy.right} of {accuracy.checked} you checked · {accuracy.read} read in total
              {need ? ` · check ${need} more for a reliable number` : ''}
            </T>
            {mistakes.length ? (
              <View style={{ gap: 6 }}>
                <T variant="label">Most common mistakes</T>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {mistakes.map((m) => (
                    <Badge key={m.field} label={`${m.label} · ${m.count}`} tone="warn" />
                  ))}
                </Row>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <T variant="heading">How well does PerkScan read?</T>
            <T variant="caption" muted>
              Check what it took from each email and text. Mark it right, or fix what’s wrong. After 10–30 checks you’ll
              know how far to trust the numbers.
            </T>
          </>
        )}
      </Panel>

      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { label: `To check${items ? ` (${items.filter((i) => !i.review).length})` : ''}`, value: 'todo' },
          { label: 'Checked', value: 'done' },
        ]}
      />

      {error ? <ErrorNote message={error} /> : null}

      {items && shown.length === 0 ? (
        <Empty
          icon={filter === 'todo' ? 'checkmark-done' : 'list'}
          title={filter === 'todo' ? 'All checked' : 'Nothing checked yet'}
          body={filter === 'todo' ? 'New emails and texts show up here once PerkScan has read them.' : 'Messages you mark show up here.'}
        />
      ) : null}

      {shown.map((item) => {
        const m = item.message;
        return (
          <Panel key={m.id} style={{ gap: space.sm }}>
            <Row gap={space.sm}>
              <Ionicons name={m.source === 'email' ? 'mail-outline' : 'chatbubble-outline'} size={16} color={c.textMuted} />
              <T variant="subheading" style={{ flex: 1 }} numberOfLines={2}>{m.summary ?? 'Message'}</T>
              <T variant="caption" faint>{relativeDays(new Date(m.received_at), new Date())}</T>
            </Row>
            <ReadSummary offers={item.offers} purchases={item.purchases} />
            {item.review ? (
              <Badge
                label={item.review.verdict === 'right' ? 'You said: right' : 'You said: something was wrong'}
                tone={item.review.verdict === 'right' ? 'good' : 'warn'}
                icon={item.review.verdict === 'right' ? 'checkmark' : 'alert-circle'}
              />
            ) : null}
            <Row gap={space.sm}>
              <Button
                title="Right"
                icon="thumbs-up-outline"
                size="sm"
                kind={item.review?.verdict === 'right' ? 'primary' : 'secondary'}
                loading={busy === m.id}
                onPress={() => markRight(item)}
                style={{ flex: 1 }}
              />
              <Button
                title="Something’s wrong"
                icon="create-outline"
                size="sm"
                kind="secondary"
                onPress={() => router.push({ pathname: '/report', params: { messageId: m.id } })}
                style={{ flex: 1 }}
              />
            </Row>
          </Panel>
        );
      })}

      <Note icon="lock-closed-outline">
        Your checks keep only what was wrong and the corrected values — never the email or text itself.
      </Note>
    </Screen>
  );
}
