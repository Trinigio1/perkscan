import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Button, ErrorNote, Field, Money, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney, lastDayLabel, PERIOD_LABELS, relativeDays } from '@/domain/format';
import { markCredit } from '@/lib/credits';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

export default function CreditDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardLabel } = useLookups();
  const [partial, setPartial] = useState('');
  const [showPartial, setShowPartial] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opp = data.opportunities.find((o) => o.id === id);
  if (!opp) {
    return (
      <Screen edges={[]}>
        <T muted>This credit isn’t available anymore.</T>
        <Button title="Close" onPress={() => router.back()} />
      </Screen>
    );
  }

  const benefit = opp.benefit_id ? benefitById.get(opp.benefit_id) : undefined;
  const recovered = recoveredByOpp.get(opp.id) ?? 0;
  const value = opp.value_estimate;
  const now = new Date();
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const savePartial = () => {
    const amount = Number(partial.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter how much you used, e.g. 12.50');
    const full = value !== null && amount >= value;
    act('partial', () => markCredit(opp.id, full, amount));
  };

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.xs }}>
        <T variant="label" faint>{userCardLabel(opp.user_card_id)}</T>
        <T variant="title">{opp.title}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {opp.status === 'claimed' ? <Badge label="Used" tone="good" icon="checkmark" /> : null}
          {opp.status === 'expired' ? <Badge label="Missed" tone="bad" /> : null}
          {benefit ? <Badge label={PERIOD_LABELS[benefit.period]} /> : null}
          {benefit?.enrollment_required ? <Badge label="Enrollment required" icon="alert-circle-outline" tone="warn" /> : null}
        </Row>
      </View>

      <Panel>
        {value === null ? (
          <>
            <T variant="heading">Amount not verified</T>
            <T variant="caption" muted>
              We haven’t confirmed this credit’s amount with the issuer yet, so it counts as $0 in your totals. You can
              still mark it used.
            </T>
          </>
        ) : (
          <>
            <T variant="label" muted>This period</T>
            <Money value={value} size={44} />
            {recovered > 0 ? <T muted>{formatMoney(recovered)} used · {formatMoney(Math.max(0, value - recovered))} left</T> : null}
          </>
        )}
        {expires ? (
          <T variant="caption" color={opp.status === 'open' && expires.getTime() - now.getTime() < 7 * 86_400_000 ? c.warn : c.textMuted}>
            {opp.status === 'expired' || expires <= now
              ? `Reset ${relativeDays(expires, now)} (last day was ${lastDayLabel(opp.expires_at!)})`
              : `Use by ${lastDayLabel(opp.expires_at!)} — resets ${relativeDays(expires, now)}`}
          </T>
        ) : null}
      </Panel>

      {error ? <ErrorNote message={error} /> : null}

      <View style={{ gap: space.sm }}>
        {opp.status !== 'claimed' ? (
          <Button title="I used all of it" icon="checkmark-circle-outline" loading={busy === 'full'} disabled={!!busy} onPress={() => act('full', () => markCredit(opp.id, true))} />
        ) : null}
        {showPartial ? (
          <Panel>
            <Field label="How much did you use?" value={partial} onChangeText={setPartial} placeholder="$0.00" keyboardType="decimal-pad" autoFocus />
            <Button title="Save" loading={busy === 'partial'} disabled={!!busy} onPress={savePartial} />
          </Panel>
        ) : opp.status !== 'claimed' ? (
          <Button title="I used part of it" kind="secondary" disabled={!!busy} onPress={() => setShowPartial(true)} />
        ) : null}
        {opp.status === 'claimed' || recovered > 0 ? (
          <Button title="Mark as not used" kind="ghost" loading={busy === 'reset'} disabled={!!busy} onPress={() => act('reset', () => markCredit(opp.id, false, null))} />
        ) : null}
      </View>

      {opp.action_steps.length ? (
        <Panel>
          <T variant="heading">How to use it</T>
          {opp.action_steps.map((s, i) => (
            <Row key={i} style={{ alignItems: 'flex-start' }}>
              <T variant="label" muted>{i + 1}.</T>
              <T style={{ flex: 1 }}>{s.step}</T>
              {s.url ? <Button title="Open" kind="ghost" icon="open-outline" onPress={() => Linking.openURL(s.url!)} /> : null}
            </Row>
          ))}
        </Panel>
      ) : null}

      {benefit?.terms_summary || benefit?.notes ? (
        <Panel>
          <T variant="heading">Terms</T>
          {benefit.terms_summary ? <T variant="caption" muted>{benefit.terms_summary}</T> : null}
          {benefit.last_verified ? <T variant="caption" faint>Last verified {benefit.last_verified}</T> : <T variant="caption" faint>Not yet verified against the issuer’s terms.</T>}
        </Panel>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}
