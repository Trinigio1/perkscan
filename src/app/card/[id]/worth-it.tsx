import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, Money, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { annualCreditValue, computeWorthIt, historicalUseRate, type Verdict } from '@/domain/worthIt';
import { useData, useLookups } from '@/lib/data';
import { space, useColors } from '@/theme';

const RATES = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ label: `${v * 100}%`, value: v }));
const nearestRate = (r: number) => RATES.reduce((best, x) => (Math.abs(x.value - r) < Math.abs(best.value - r) ? x : best)).value;

const VERDICT_COPY: Record<Verdict, string> = {
  worth_it: 'Looks worth it',
  borderline: 'About even',
  not_worth_it: 'Probably not worth it',
  unknown: 'Not enough verified data',
};

export default function WorthIt() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useData();
  const { recoveredByOpp } = useLookups();
  const uc = data.userCards.find((x) => x.id === id);
  const card = uc ? data.cards.find((x) => x.id === uc.card_id) : undefined;
  const credits = useMemo(
    () => data.benefits.filter((b) => card && b.card_id === card.id && b.type === 'credit' && b.period !== 'per_claim'),
    [data.benefits, card],
  );

  // Start each slider from how the user has actually used the credit so far.
  const initialRates = useMemo(() => {
    const out: Record<string, number> = {};
    for (const b of credits) {
      const opps = data.opportunities.filter((o) => o.user_card_id === id && o.benefit_id === b.id && o.value_estimate !== null);
      const tracked = opps.filter((o) => o.status !== 'open' || recoveredByOpp.has(o.id));
      const trackedValue = tracked.reduce((s, o) => s + (o.value_estimate ?? 0), 0);
      const usedValue = tracked.reduce((s, o) => s + (recoveredByOpp.get(o.id) ?? 0), 0);
      out[b.id] = nearestRate(historicalUseRate(tracked.length, usedValue, trackedValue));
    }
    return out;
  }, [credits, data.opportunities, id, recoveredByOpp]);
  const [rates, setRates] = useState(initialRates);

  const recoveredThisYear = useMemo(() => {
    const year = new Date().getFullYear();
    return data.recovered
      .filter((r) => new Date(r.recovered_at).getFullYear() === year)
      .filter((r) => data.opportunities.find((o) => o.id === r.opportunity_id)?.user_card_id === id)
      .reduce((s, r) => s + r.amount, 0);
  }, [data, id]);

  if (!uc || !card) return <Screen edges={[]}><T muted>Card not found.</T></Screen>;

  const result = computeWorthIt(
    card.annual_fee,
    credits.map((b) => ({ benefitId: b.id, name: b.name, annualValue: annualCreditValue(b), useRate: rates[b.id] ?? 0.5 })),
  );
  const tone = result.verdict === 'worth_it' ? c.accent : result.verdict === 'not_worth_it' ? c.danger : c.warn;

  return (
    <Screen edges={[]}>
      <View style={{ gap: 2 }}>
        <T variant="label" faint>{card.issuer}</T>
        <T variant="title">{uc.nickname || card.product_name}</T>
      </View>

      <Panel>
        <T variant="heading" color={result.verdict === 'unknown' ? c.textMuted : tone}>{VERDICT_COPY[result.verdict]}</T>
        {result.net !== null && result.verdict !== 'unknown' ? (
          <>
            <Money value={Math.abs(result.net)} size={44} color={tone} />
            <T muted>
              {result.net >= 0 ? 'more' : 'less'} in credits than the {formatMoney(result.annualFee!)} fee, at the usage you set below
            </T>
          </>
        ) : (
          <T variant="caption" muted>
            {card.annual_fee === null
              ? 'This card’s annual fee hasn’t been verified yet.'
              : 'None of this card’s credit amounts are verified yet, so we can’t compare them with the fee.'}
          </T>
        )}
      </Panel>

      <Row style={{ alignItems: 'stretch' }}>
        <Panel style={{ flex: 1 }}>
          <T variant="caption" muted>Annual fee</T>
          <T variant="heading">{card.annual_fee === null ? '—' : formatMoney(card.annual_fee)}</T>
        </Panel>
        <Panel style={{ flex: 1 }}>
          <T variant="caption" muted>If you use it all</T>
          <T variant="heading">{formatMoney(result.maxValue)}</T>
        </Panel>
        <Panel style={{ flex: 1 }}>
          <T variant="caption" muted>Used this year</T>
          <T variant="heading" color={c.accent}>{formatMoney(recoveredThisYear)}</T>
        </Panel>
      </Row>

      {result.breakEvenRate !== null && card.annual_fee ? (
        <T muted>You break even if you use about {Math.ceil(result.breakEvenRate * 100)}% of the verified credit value.</T>
      ) : null}

      <Panel>
        <T variant="heading">How much will you really use?</T>
        <T variant="caption" muted>Starts from your history on this card. Be honest — unused credits are worth $0.</T>
        {credits.length === 0 ? <T muted>This card has no recurring credits.</T> : null}
        {credits.map((b) => {
          const annual = annualCreditValue(b);
          return (
            <View key={b.id} style={{ gap: space.sm, paddingVertical: space.sm }}>
              <Row>
                <T variant="label" style={{ flex: 1 }}>{b.name}</T>
                {annual === null ? <Badge label="Not verified" /> : <T variant="label">{formatMoney(annual)}/yr</T>}
              </Row>
              {annual !== null ? (
                <Segmented options={RATES} value={rates[b.id] ?? 0.5} onChange={(v) => setRates({ ...rates, [b.id]: v })} />
              ) : null}
            </View>
          );
        })}
      </Panel>

      {result.unverifiedCount > 0 ? (
        <T variant="caption" muted>
          {result.unverifiedCount} credit{result.unverifiedCount > 1 ? 's are' : ' is'} left out because the amount isn’t verified yet.
        </T>
      ) : null}
      <T variant="caption" muted>
        Only statement credits are counted. Points, lounge access, insurance and other perks aren’t, so cards that earn a
        lot of points may be worth more to you than this shows.
      </T>
      <Disclaimer text="This is an estimate to help you think it through, not financial advice. Check current terms with your issuer before you keep, downgrade, or cancel a card." />
    </Screen>
  );
}
