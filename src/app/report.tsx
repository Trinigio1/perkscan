import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { offerLine, purchaseLine, ReadSummary } from '@/components/ReadSummary';
import { Button, Chip, ErrorNote, Field, Loading, Panel, Row, Screen, T } from '@/components/ui';
import { WRONG_FIELD_LABELS, type WrongField } from '@/domain/accuracy';
import { CURRENCIES } from '@/domain/countries';
import { useData } from '@/lib/data';
import { listForReview, submitReview, type Corrections, type ReviewItem } from '@/lib/feedback';
import { rematchReceipts } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

type Target = { kind: 'offer' | 'purchase'; id: string } | null;

const OFFER_FIELDS: WrongField[] = ['not_real', 'amount', 'code', 'expiry', 'merchant', 'currency', 'kind', 'missed', 'other'];
const PURCHASE_FIELDS: WrongField[] = ['amount', 'card', 'merchant', 'date', 'currency', 'kind', 'missed', 'other'];
const NOTHING_FIELDS: WrongField[] = ['missed', 'kind', 'other'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "Something's wrong": say what, and optionally fix it. */
export default function Report() {
  const toast = useToast();
  const { refresh } = useData();
  const { messageId, opportunityId } = useLocalSearchParams<{ messageId: string; opportunityId?: string }>();
  const [item, setItem] = useState<ReviewItem | null | undefined>(undefined);
  const [target, setTarget] = useState<Target>(null);
  const [fields, setFields] = useState<WrongField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listForReview(messageId)
      .then(([found]) => {
        setItem(found ?? null);
        if (!found) return;
        const o = found.offers.find((x) => x.id === opportunityId) ?? (found.purchases.length ? null : found.offers[0]);
        if (o) setTarget({ kind: 'offer', id: o.id });
        else if (found.purchases[0]) setTarget({ kind: 'purchase', id: found.purchases[0].id });
      })
      .catch((e: Error) => setError(e.message));
  }, [messageId, opportunityId]);

  if (item === undefined) return error ? <Screen edges={[]}><ErrorNote message={error} /></Screen> : <Loading />;
  if (!item) return <Screen edges={[]}><T muted>This message isn’t available anymore.</T></Screen>;

  const offer = target?.kind === 'offer' ? item.offers.find((o) => o.id === target.id) : undefined;
  const purchase = target?.kind === 'purchase' ? item.purchases.find((p) => p.id === target.id) : undefined;
  const choices = offer ? OFFER_FIELDS : purchase ? PURCHASE_FIELDS : NOTHING_FIELDS;
  const toggle = (f: WrongField) => setFields(fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f]);
  const set = (k: string) => (v: string) => setValues({ ...values, [k]: v });
  const has = (f: WrongField) => fields.includes(f);

  const save = async () => {
    if (!fields.length) return setError('Pick what was wrong.');
    const corrected: Corrections = {};
    const v = (k: string) => values[k]?.trim();
    if (has('amount') && v('amount')) {
      const n = Number(v('amount')!.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(n) || n < 0) return setError('Enter the amount like 12.50');
      corrected.amount = n;
    }
    if (has('currency') && v('currency')) corrected.currency = v('currency');
    if (has('code') && v('code')) {
      if (!/^[A-Za-z0-9-]{3,40}$/.test(v('code')!)) return setError('Codes are 3–40 letters or numbers.');
      corrected.code = v('code');
    }
    if (has('expiry') && v('expires_on')) {
      if (!ISO.test(v('expires_on')!)) return setError('Write the expiry date as YYYY-MM-DD.');
      corrected.expires_on = v('expires_on');
    }
    if (has('date') && v('purchase_date')) {
      if (!ISO.test(v('purchase_date')!)) return setError('Write the purchase date as YYYY-MM-DD.');
      corrected.purchase_date = v('purchase_date');
    }
    if (has('merchant') && v('merchant')) corrected.merchant = v('merchant');
    if (has('card') && v('last_four')) {
      if (!/^\d{4}$/.test(v('last_four')!)) return setError('Card ending is the last 4 digits.');
      corrected.last_four = v('last_four');
    }

    setBusy(true);
    setError(null);
    try {
      await submitReview({
        messageId: item.message.id,
        verdict: 'wrong',
        wrongFields: fields,
        corrected,
        note,
        opportunityId: offer?.id ?? null,
        receiptId: purchase?.id ?? null,
      });
      // New card digits can link the purchase to a different card.
      if (corrected.last_four) await rematchReceipts();
      await refresh();
      toast(Object.keys(corrected).length || has('not_real') ? 'Fixed — thanks for checking' : 'Noted — thanks for checking');
      if (router.canGoBack()) router.back();
      else router.replace('/review');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const currencyChoices = Array.from(new Set([offer?.currency ?? purchase?.currency ?? 'USD', ...CURRENCIES]));

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: space.sm }}>
        <T variant="label">{item.message.summary ?? 'Message'}</T>
        <ReadSummary offers={item.offers} purchases={item.purchases} />
      </Panel>

      {item.offers.length + item.purchases.length > 1 ? (
        <View style={{ gap: space.sm }}>
          <T variant="subheading">Which one?</T>
          {item.purchases.map((p) => (
            <Chip key={p.id} label={purchaseLine(p)} selected={purchase?.id === p.id} onPress={() => setTarget({ kind: 'purchase', id: p.id })} />
          ))}
          {item.offers.map((o) => (
            <Chip key={o.id} label={offerLine(o)} selected={offer?.id === o.id} onPress={() => setTarget({ kind: 'offer', id: o.id })} />
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <T variant="subheading">What’s wrong?</T>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {choices.map((f) => (
            <Chip key={f} label={WRONG_FIELD_LABELS[f]} selected={has(f)} onPress={() => toggle(f)} />
          ))}
        </Row>
      </View>

      {has('amount') && (offer || purchase) ? (
        <Field label="Right amount" value={values.amount ?? ''} onChangeText={set('amount')} keyboardType="decimal-pad" placeholder="0.00" />
      ) : null}
      {has('currency') && (offer || purchase) ? (
        <View style={{ gap: space.sm }}>
          <T variant="label">Right currency</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {currencyChoices.map((cur) => (
              <Chip key={cur} label={cur} selected={values.currency === cur} onPress={() => set('currency')(cur)} />
            ))}
          </Row>
        </View>
      ) : null}
      {has('code') && offer ? <Field label="Right code" value={values.code ?? ''} onChangeText={set('code')} autoCapitalize="characters" placeholder={offer.code ?? 'SAVE10'} /> : null}
      {has('expiry') && offer ? <Field label="Right expiry date" value={values.expires_on ?? ''} onChangeText={set('expires_on')} placeholder="YYYY-MM-DD" /> : null}
      {has('merchant') && (offer || purchase) ? (
        <Field label="Right store name" value={values.merchant ?? ''} onChangeText={set('merchant')} placeholder={offer?.merchant ?? purchase?.merchant ?? ''} />
      ) : null}
      {has('card') && purchase ? (
        <Field label="Right card ending" value={values.last_four ?? ''} onChangeText={set('last_four')} keyboardType="number-pad" maxLength={4} placeholder="1234" />
      ) : null}
      {has('date') && purchase ? <Field label="Right purchase date" value={values.purchase_date ?? ''} onChangeText={set('purchase_date')} placeholder="YYYY-MM-DD" /> : null}
      {has('not_real') ? <T variant="caption" muted>It will be removed from your offers.</T> : null}

      <Field
        label="Anything else? (optional)"
        hint="Don’t include names, addresses or account numbers."
        value={note}
        onChangeText={setNote}
        maxLength={280}
        multiline
        placeholder={has('missed') ? 'e.g. it missed the $5 gift card' : ''}
      />

      {error ? <ErrorNote message={error} /> : null}
      <Button title="Save" icon="checkmark" onPress={save} loading={busy} />
    </Screen>
  );
}
