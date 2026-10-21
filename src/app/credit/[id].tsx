import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Button, Chip, ErrorNote, Field, IconBubble, Money, Panel, ProgressRing, Row, Screen, T } from '@/components/ui';
import { formatMoney, lastDayLabel, PERIOD_LABELS, relativeDays } from '@/domain/format';
import { benefitIcon } from '@/domain/visuals';
import { markCredit } from '@/lib/credits';
import { useData, useLookups } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { radius, space, useColors } from '@/theme';

export default function CreditDetail() {
  const c = useColors();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, refresh } = useData();
  const { benefitById, recoveredByOpp, userCardById, cardById } = useLookups();
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
  const uc = opp.user_card_id ? userCardById.get(opp.user_card_id) : undefined;
  const card = uc ? cardById.get(uc.card_id) : undefined;
  const recovered = recoveredByOpp.get(opp.id) ?? 0;
  const value = opp.value_estimate;
  const now = new Date();
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const used = opp.status === 'claimed';
  const missed = opp.status === 'expired' || (!!expires && expires <= now);
  const soon = !!expires && !used && !missed && expires.getTime() - now.getTime() < 7 * 86_400_000;
  const { icon, tone } = benefitIcon(opp.title, 'credit');
  const money = (n: number) => formatMoney(n, { currency: opp.currency });

  const act = async (key: string, fn: () => Promise<void>, message: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      toast(message);
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const savePartial = (raw = partial) => {
    const amount = Number(String(raw).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter how much you used, e.g. 12.50');
    const full = value !== null && amount >= value;
    act('partial', () => markCredit(opp.id, full, amount), `Nice — ${money(value !== null ? Math.min(amount, value) : amount)} recovered`);
  };

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <IconBubble icon={icon} tone={tone} size={64} />
        <T variant="title" center>{opp.title}</T>
        {card && uc ? (
          <Row gap={space.sm}>
            <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" style={{ width: 30, height: 19, borderRadius: 3 }} />
            <T variant="caption" muted>{uc.nickname || card.product_name.replace(/®/g, '')} ·· {uc.last_four}</T>
          </Row>
        ) : null}
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          {used ? <Badge label="Used" tone="good" icon="checkmark" /> : null}
          {missed && !used ? <Badge label="Missed" tone="bad" /> : null}
          {benefit ? <Badge label={PERIOD_LABELS[benefit.period]} /> : null}
          {benefit?.enrollment_required ? <Badge label="Enrollment required" icon="alert-circle" tone="warn" /> : null}
        </Row>
      </View>

      <Panel style={{ alignItems: 'center', paddingVertical: space.xl }}>
        {value === null ? (
          <>
            <T variant="heading">Amount not verified</T>
            <T variant="caption" muted center>
              We haven’t confirmed this credit’s amount with the issuer yet, so it counts as $0 in your totals. You can still mark it used.
            </T>
          </>
        ) : (
          <ProgressRing value={value ? recovered / value : 0} done={used} size={150} stroke={12} color={soon ? c.warn : c.accent}>
            <View style={{ alignItems: 'center' }}>
              <Money value={used ? value : Math.max(0, value - recovered)} size={32} currency={opp.currency} />
              <T variant="caption" muted>{used ? 'used' : recovered > 0 ? `left of ${money(value)}` : 'this period'}</T>
            </View>
          </ProgressRing>
        )}
        {expires ? (
          <Row style={{ marginTop: space.md, backgroundColor: soon ? c.warnSoft : missed && !used ? c.dangerSoft : c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }} gap={6}>
            <Ionicons name="time" size={14} color={soon ? c.warn : missed && !used ? c.danger : c.textMuted} />
            <T variant="label" color={soon ? c.warn : missed && !used ? c.danger : c.textMuted}>
              {missed ? `Reset ${relativeDays(expires, now)} · last day was ${lastDayLabel(opp.expires_at!)}` : `Use by ${lastDayLabel(opp.expires_at!)} · resets ${relativeDays(expires, now)}`}
            </T>
          </Row>
        ) : null}
      </Panel>

      {error ? <ErrorNote message={error} /> : null}

      <View style={{ gap: space.sm }}>
        {!used ? (
          <Button
            title="I used all of it"
            icon="checkmark-circle"
            loading={busy === 'full'}
            disabled={!!busy}
            onPress={() => act('full', () => markCredit(opp.id, true), value !== null ? `Nice — ${money(value)} recovered` : 'Marked as used')}
          />
        ) : null}
        {!used && !showPartial ? (
          <Button title="I used part of it" kind="secondary" disabled={!!busy} onPress={() => setShowPartial(true)} />
        ) : null}
        {showPartial && !used ? (
          <Panel>
            <T variant="subheading">How much did you use?</T>
            {value !== null ? (
              <Row style={{ flexWrap: 'wrap' }}>
                {[0.25, 0.5, 0.75].map((f) => {
                  const amt = Math.round(value * f * 100) / 100;
                  return <Chip key={f} label={money(amt)} selected={partial === String(amt)} onPress={() => setPartial(String(amt))} />;
                })}
              </Row>
            ) : null}
            <Field label="Amount" value={partial} onChangeText={setPartial} placeholder="$0.00" keyboardType="decimal-pad" />
            <Button title="Save" loading={busy === 'partial'} disabled={!!busy || !partial} onPress={() => savePartial()} />
          </Panel>
        ) : null}
        {used || recovered > 0 ? (
          <Button title="Mark as not used" kind="ghost" loading={busy === 'reset'} disabled={!!busy} onPress={() => act('reset', () => markCredit(opp.id, false, null), 'Reset to unused')} />
        ) : null}
      </View>

      {opp.action_steps.length ? (
        <Panel>
          <T variant="heading">How to use it</T>
          {opp.action_steps.map((s, i) => (
            <Row key={i} gap={space.md} style={{ alignItems: 'flex-start', paddingVertical: 4 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <T variant="caption" color={c.accentStrong}>{i + 1}</T>
              </View>
              {s.url ? (
                <Pressable onPress={() => Linking.openURL(s.url!)} style={{ flex: 1 }}>
                  <Row gap={4}>
                    <T color={c.accent} style={{ textDecorationLine: 'underline' }}>{s.step}</T>
                    <Ionicons name="open-outline" size={14} color={c.accent} />
                  </Row>
                </Pressable>
              ) : (
                <T style={{ flex: 1 }}>{s.step}</T>
              )}
            </Row>
          ))}
        </Panel>
      ) : null}

      {benefit?.terms_summary ? (
        <Panel>
          <T variant="heading">Terms</T>
          <T variant="caption" muted>{benefit.terms_summary}</T>
          <T variant="caption" faint>{benefit.last_verified ? `Last verified ${benefit.last_verified}` : 'Not yet verified against the issuer’s terms.'}</T>
        </Panel>
      ) : null}

      <Disclaimer />
    </Screen>
  );
}
