import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CardArt } from '@/components/CardArt';
import { Disclaimer } from '@/components/Disclaimer';
import { Badge, IconBubble, Note, Panel, ProgressBar, Row, Screen, Segmented, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { benefitIcon } from '@/domain/visuals';
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
  const tone = result.verdict === 'worth_it' ? c.accent : result.verdict === 'not_worth_it' ? c.danger : result.verdict === 'borderline' ? c.warn : c.textMuted;
  const verdictIcon = result.verdict === 'worth_it' ? 'thumbs-up' : result.verdict === 'not_worth_it' ? 'thumbs-down' : result.verdict === 'borderline' ? 'swap-horizontal' : 'help';
  const scale = Math.max(card.annual_fee ?? 0, result.maxValue, 1);

  return (
    <Screen edges={[]}>
      <Row gap={space.md}>
        <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" />
        <View style={{ flex: 1 }}>
          <T variant="caption" muted>{card.issuer}</T>
          <T variant="subheading" numberOfLines={1}>{uc.nickname || card.product_name.replace(/®/g, '')}</T>
        </View>
      </Row>

      <Panel style={{ gap: space.md }}>
        <Row gap={space.md}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={verdictIcon} size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="heading" color={tone}>{VERDICT_COPY[result.verdict]}</T>
            {result.net !== null && result.verdict !== 'unknown' ? (
              <T muted>
                {formatMoney(Math.abs(result.net))} {result.net >= 0 ? 'more' : 'less'} than the fee, at the usage below
              </T>
            ) : (
              <T variant="caption" muted>
                {card.annual_fee === null
                  ? 'This card’s annual fee hasn’t been verified yet.'
                  : 'None of this card’s credit amounts are verified yet, so we can’t compare them with the fee.'}
              </T>
            )}
          </View>
        </Row>

        {card.annual_fee !== null ? (
          <View style={{ gap: space.sm }}>
            <Bar label="Annual fee" value={card.annual_fee} max={scale} color={c.textMuted} />
            <Bar label="What you’d use" value={result.expectedValue} max={scale} color={c.accent} />
            <Bar label="If you used everything" value={result.maxValue} max={scale} color={c.surfaceSunken} textColor={c.textMuted} />
          </View>
        ) : null}

        <Row gap={space.lg}>
          <View style={{ flex: 1 }}>
            <T variant="caption" muted>Used this year</T>
            <T variant="heading" color={c.accentStrong}>{formatMoney(recoveredThisYear)}</T>
          </View>
          {result.breakEvenRate !== null && card.annual_fee ? (
            <View style={{ flex: 1 }}>
              <T variant="caption" muted>Break-even usage</T>
              <T variant="heading">{Math.ceil(result.breakEvenRate * 100)}%</T>
            </View>
          ) : null}
        </Row>
      </Panel>

      <View style={{ gap: 2 }}>
        <T variant="heading">How much will you really use?</T>
        <T variant="caption" muted>Starts from your history on this card. Be honest — unused credits are worth $0.</T>
      </View>
      <Panel style={{ gap: space.md }}>
        {credits.length === 0 ? <T muted>This card has no recurring credits.</T> : null}
        {credits.map((b) => {
          const annual = annualCreditValue(b);
          const { icon, tone: t } = benefitIcon(b.name, 'credit');
          return (
            <View key={b.id} style={{ gap: space.sm }}>
              <Row gap={space.md}>
                <IconBubble icon={icon} tone={t} size={32} />
                <T variant="subheading" style={{ flex: 1 }} numberOfLines={1}>{b.name}</T>
                {annual === null ? <Badge label="Not verified" /> : <T variant="label" muted>{formatMoney(annual)}/yr</T>}
              </Row>
              {annual !== null ? (
                <Segmented options={RATES} value={rates[b.id] ?? 0.5} onChange={(v) => setRates({ ...rates, [b.id]: v })} />
              ) : null}
            </View>
          );
        })}
      </Panel>

      {result.unverifiedCount > 0 ? (
        <Note icon="shield-checkmark-outline">
          {result.unverifiedCount} credit{result.unverifiedCount > 1 ? 's are' : ' is'} left out because the amount isn’t verified yet.
        </Note>
      ) : null}
      <Note icon="bulb-outline">
        Only statement credits are counted. Points, lounge access, insurance and other perks aren’t, so a card that earns lots of points may be worth more to you than this shows.
      </Note>
      <Disclaimer text="This is an estimate to help you think it through, not financial advice. Check current terms with your issuer before you keep, downgrade, or cancel a card." />
    </Screen>
  );
}

function Bar({ label, value, max, color, textColor }: { label: string; value: number; max: number; color: string; textColor?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Row>
        <T variant="caption" muted style={{ flex: 1 }}>{label}</T>
        <T variant="label" color={textColor}>{formatMoney(value)}</T>
      </Row>
      <ProgressBar value={value / max} color={color} height={10} />
    </View>
  );
}
