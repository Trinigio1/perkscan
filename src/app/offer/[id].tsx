import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { ClaimButton, ClaimHelper } from '@/components/Claims';
import { ConfidenceTag } from '@/components/ConfidenceTag';
import { Disclaimer } from '@/components/Disclaimer';
import { ReadCheck } from '@/components/ReadCheck';
import { Badge, Button, ErrorNote, Field, IconBubble, Money, Panel, Row, Screen, T } from '@/components/ui';
import { claimTarget } from '@/domain/claimTarget';
import { claimHelp } from '@/domain/claims';
import { CONFIDENCE_HELP, confidenceOf } from '@/domain/confidence';
import { offerEstimate } from '@/domain/estimate';
import { muteKeyOf } from '@/domain/mutes';
import { formatMoney, lastDayLabel, relativeDays } from '@/domain/format';
import { usedFromReceiptNote } from '@/domain/usedFromReceipts';
import { offerIcon, OFFER_TYPE_LABELS } from '@/domain/visuals';
import { track } from '@/lib/analytics';
import { muteStore } from '@/lib/cards';
import { useData } from '@/lib/data';
import { markOpportunity } from '@/lib/inbox';
import { removeItem } from '@/lib/programs';
import { useToast } from '@/lib/toast';
import { radius, space, useColors } from '@/theme';

/** Offers from a store's own emails, which a store can be hidden from. */
const STORE_OFFER_TYPES = new Set(['promo', 'gift_card', 'store_credit', 'points', 'free_trial', 'travel_credit', 'certificate']);

export default function OfferDetail() {
  const c = useColors();
  const toast = useToast();
  const { id, arrived } = useLocalSearchParams<{ id: string; arrived?: string }>();
  const { data, refresh } = useData();
  const [saved, setSaved] = useState('');
  const [askSaved, setAskSaved] = useState(arrived === '1');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const opp = data.opportunities.find((o) => o.id === id);
  // "Spotted on your Oct 20 Uber Eats receipt", when a receipt showed it used.
  const usedNote = opp ? usedFromReceiptNote(opp.id, data.recovered, data.receipts) : null;
  if (!opp) {
    return (
      <Screen edges={[]}>
        <T muted>This offer isn’t available anymore.</T>
        <Button title="Close" onPress={() => router.back()} />
      </Screen>
    );
  }

  const now = new Date();
  const estimate = offerEstimate(opp, data.receipts, now);
  const { icon, tone } = offerIcon(opp.type);
  const expires = opp.expires_at ? new Date(opp.expires_at) : null;
  const missed = opp.status === 'expired' || (opp.status === 'open' && !!expires && expires <= now);
  const soon = opp.status === 'open' && !missed && !!expires && expires.getTime() - now.getTime() <= 7 * 86_400_000;
  // Only real money (promos, gift cards, credit) is "recovered" when used.
  // A protection only becomes money once a claim pays out, so we ask how much.
  const countsAsMoney = ['promo', 'gift_card', 'store_credit', 'travel_credit', 'settlement', 'points', 'protection', 'refund', 'benefit', 'price_drop'].includes(opp.type);
  const isProtection = opp.type === 'protection';
  // Money you get back rather than spend: ask how much came back.
  const comesBack = opp.type === 'refund' || opp.type === 'price_drop';
  const manual = !!opp.dedupe_key?.startsWith('manual:');
  const confidence = confidenceOf(opp, (b) => data.benefits.find((x) => x.id === b)?.status);
  const receipt = opp.source_receipt_id ? data.receipts.find((r) => r.id === opp.source_receipt_id) : undefined;
  const help = opp.status === 'open' && !missed ? claimHelp({ opp, receipt, name: data.profile?.display_name }) : null;
  // Codes, gift cards, points, trials, settlements: straight to where you use them.
  const target = !help || help.kind === 'settlement' ? (!missed ? claimTarget({ opp }) : null) : null;

  // "Hide all offers from Uber Eats": its marketing isn't read any more; its receipts still are.
  const muteKey = muteKeyOf(opp);
  const hideStore = async () => {
    if (!muteKey) return;
    setBusy('mute');
    try {
      await muteStore(muteKey, opp.merchant ?? null);
      await refresh();
      toast(`Hidden. Offers from ${opp.merchant ?? 'this store'} won’t show; undo in Settings → Hidden stores.`, { tone: 'info' });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const act = async (key: string, action: 'used' | 'dismiss' | 'reopen', amount: number | null, message: string) => {
    setBusy(key);
    setError(null);
    try {
      await markOpportunity(opp.id, action, amount);
      if (action === 'used') track('offer_marked_used', { type: opp.type });
      await refresh();
      toast(message, { tone: action === 'used' ? 'success' : 'info' });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const markUsed = () => {
    if (countsAsMoney && opp.value_estimate === null && !askSaved) return setAskSaved(true);
    const amount = saved ? Number(saved.replace(/[^0-9.]/g, '')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return setError('Enter an amount like 12.50');
    const value = amount ?? opp.value_estimate;
    act('used', 'used', countsAsMoney ? amount : 0, countsAsMoney && value ? `Nice — ${formatMoney(value, { currency: opp.currency })} ${isProtection || comesBack ? 'recovered' : 'saved'}` : 'Marked as done');
  };

  return (
    <Screen edges={[]}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <IconBubble icon={icon} tone={tone} size={64} />
        {opp.merchant ? <T variant="label" muted>{opp.merchant}</T> : null}
        <T variant="title" center>{opp.title}</T>
        <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge label={OFFER_TYPE_LABELS[opp.type] ?? 'Offer'} />
          {opp.status === 'claimed' ? <Badge label="Used" tone="good" icon="checkmark" /> : null}
          {opp.status === 'dismissed' ? <Badge label="Dismissed" /> : null}
          {missed ? <Badge label="Expired" tone="bad" /> : null}
        </Row>
        {opp.status === 'open' && !missed ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <ConfidenceTag value={confidence} />
            <T variant="caption" muted center>{CONFIDENCE_HELP[confidence]}</T>
          </View>
        ) : null}
      </View>

      <Panel style={{ alignItems: 'center', paddingVertical: space.xl, gap: space.md }}>
        {opp.value_estimate !== null ? <Money value={opp.value_estimate} size={44} currency={opp.currency} /> : null}
        {estimate ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <T variant="heading">≈ {formatMoney(estimate.value, { currency: estimate.currency })}</T>
            <T variant="caption" muted center>
              {estimate.percent !== null
                ? `Estimate: ${estimate.percent}% of the ${formatMoney(estimate.basis.amount, { currency: estimate.currency })} you usually spend at ${opp.merchant}`
                : `Estimate: you usually spend about ${formatMoney(estimate.basis.amount, { currency: estimate.currency })} at ${opp.merchant}${opp.min_spend ? `, enough for its ${formatMoney(opp.min_spend, { currency: estimate.currency })} minimum` : ''}`}
              {estimate.basis.orders > 1 ? ` (${estimate.basis.orders} orders this year)` : ' (your last order there)'}. Not added to Ready to use.
            </T>
          </View>
        ) : null}
        {!estimate && opp.discount_amount ? (
          <T variant="heading">
            {formatMoney(opp.discount_amount, { currency: opp.currency })} off{opp.min_spend ? ` when you spend ${formatMoney(opp.min_spend, { currency: opp.currency })}` : ''}
          </T>
        ) : null}
        {opp.description ? <T muted center>{opp.description}</T> : null}
        {opp.code ? (
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(opp.code!);
              toast('Code copied', { tone: 'info' });
            }}
            accessibilityLabel={`Copy code ${opp.code}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: c.accent,
              borderRadius: radius.md,
              paddingVertical: space.md,
              paddingHorizontal: space.xl,
              backgroundColor: c.accentSoft,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <T variant="title" color={c.accentStrong} style={{ letterSpacing: 2 }}>{opp.code}</T>
            <Ionicons name="copy-outline" size={18} color={c.accentStrong} />
          </Pressable>
        ) : null}
        {expires ? (
          <Row style={{ backgroundColor: soon ? c.warnSoft : missed ? c.dangerSoft : c.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }} gap={6}>
            <Ionicons name="time" size={14} color={soon ? c.warn : missed ? c.danger : c.textMuted} />
            <T variant="label" color={soon ? c.warn : missed ? c.danger : c.textMuted}>
              {missed ? `Expired ${lastDayLabel(opp.expires_at!)}` : `${opp.type === 'free_trial' ? 'Ends' : 'Use by'} ${lastDayLabel(opp.expires_at!)} · ${relativeDays(expires, now)}`}
            </T>
          </Row>
        ) : (
          <T variant="caption" muted center>{isProtection ? 'The deadline depends on your card’s terms' : manual ? 'No deadline set' : opp.dedupe_key?.startsWith('double_charge:') ? 'Your card’s dispute window applies' : 'No expiry date found in the email'}</T>
        )}
      </Panel>

      {error ? <ErrorNote message={error} /> : null}

      {target && !askSaved ? <ClaimButton opp={opp} target={target} /> : null}
      {help && help.kind !== 'settlement' && !askSaved ? <ClaimHelper opp={opp} help={help} /> : null}
      {help?.kind === 'settlement' && !askSaved ? <ClaimHelper opp={opp} help={{ ...help, url: null }} /> : null}

      <View style={{ gap: space.sm }}>
        {opp.status === 'open' ? (
          <>
            {askSaved ? (
              <Panel>
                <T variant="subheading">{isProtection || opp.type === 'settlement' ? 'How much did the claim pay you? (leave blank if you’re still waiting)' : comesBack ? 'How much did you get back?' : 'How much did you save?'}</T>
                <Field label={`Amount in ${opp.currency} (optional)`} value={saved} onChangeText={setSaved} placeholder="0.00" keyboardType="decimal-pad" autoFocus />
              </Panel>
            ) : null}
            <Button
              title={askSaved ? 'Save' : opp.type === 'free_trial' ? 'I cancelled / decided' : opp.type === 'return_window' ? 'Done with this' : isProtection || opp.type === 'settlement' ? 'I filed a claim' : comesBack ? 'I got it back' : 'I used it'}
              icon="checkmark-circle"
              kind={(target || help) && !askSaved ? 'secondary' : 'primary'}
              loading={busy === 'used'}
              disabled={!!busy}
              onPress={markUsed}
            />
            <Button title={isProtection ? 'Not needed' : opp.type === 'settlement' ? 'Not for me' : opp.dedupe_key?.startsWith('double_charge:') ? 'It was two purchases' : 'Not interested'} kind="ghost" loading={busy === 'dismiss'} disabled={!!busy} onPress={() => act('dismiss', 'dismiss', null, 'Dismissed')} />
            {muteKey && STORE_OFFER_TYPES.has(opp.type) ? (
              <Button title={`Hide all offers from ${opp.merchant ?? 'this store'}`} kind="ghost" icon="eye-off-outline" loading={busy === 'mute'} disabled={!!busy} onPress={hideStore} />
            ) : null}
          </>
        ) : (
          <>
            {usedNote ? <T variant="caption" muted center>{usedNote}. Not right? Undo puts it back.</T> : null}
            <Button title="Undo" kind="secondary" icon="arrow-undo" loading={busy === 'reopen'} disabled={!!busy} onPress={() => act('reopen', 'reopen', null, 'Moved back to active')} />
          </>
        )}
      </View>

      {opp.action_steps.length ? (
        <Panel>
          <T variant="heading">What to do</T>
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

      {manual ? (
        <Button
          title="Delete"
          kind="ghost"
          icon="trash-outline"
          loading={busy === 'delete'}
          disabled={!!busy}
          onPress={async () => {
            setBusy('delete');
            try {
              await removeItem(opp.id);
              await refresh();
              toast('Deleted', { tone: 'info' });
              router.back();
            } catch (e) {
              setError((e as Error).message);
              setBusy(null);
            }
          }}
        />
      ) : null}
      {opp.source_message_id && opp.type !== 'protection' ? <ReadCheck messageId={opp.source_message_id} opportunityId={opp.id} /> : null}

      <Disclaimer />
    </Screen>
  );
}
