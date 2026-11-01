import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { formatBag, formatMoney, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { perksWorth, type PerksWorth } from '@/domain/perkValue';
import { useData } from '@/lib/data';
import { space, useColors } from '@/theme';
import { IconBubble, Panel, Row, T } from './ui';

const nonZero = (bag: MoneyBag) => Object.values(bag).some((v) => v > 0);

/** What your cards' and memberships' perks are worth a year, from the issuer's amounts and real prices. */
export function usePerksWorth(): PerksWorth & { home: string } {
  const { data } = useData();
  return useMemo(() => {
    const home = data.profile?.home_currency?.trim() || getHomeCurrency();
    return { ...perksWorth(data.userCards, data.cards, data.benefits, data.flights, new Date()), home };
  }, [data.userCards, data.cards, data.benefits, data.flights, data.profile?.home_currency]);
}

/**
 * "Your perks are worth ≈ $1,140 a year": statement credits at the issuer's amounts, plus perks valued
 * at what the same thing costs on its own (a lounge visit, a checked bag) and how often you fly. The
 * biggest few are named; per-use perks you haven't used yet show their price per use.
 */
export function PerksWorthPanel({ show = 3, linked = true }: { show?: number; linked?: boolean }) {
  const c = useColors();
  const w = usePerksWorth();
  if (!nonZero(w.total) && !w.perUse.length) return null;
  const estimate = nonZero(w.perks);
  return (
    <Panel onPress={linked ? () => router.push('/perks') : undefined} style={{ gap: space.sm }}>
      <Row gap={space.sm}>
        <IconBubble icon="diamond" tone="purple" size={32} />
        <T variant="label" color={c.accentStrong} style={{ flex: 1 }}>What your perks are worth</T>
        {linked ? <Ionicons name="chevron-forward" size={16} color={c.textFaint} /> : null}
      </Row>
      {nonZero(w.total) ? (
        <View style={{ gap: 2 }}>
          <T variant="title">{estimate ? '≈ ' : ''}{formatBag(w.total, w.home)} a year</T>
          <T variant="caption" muted>
            {[nonZero(w.credits) ? `${formatBag(w.credits, w.home)} in credits` : null, estimate ? `≈ ${formatBag(w.perks, w.home)} in perks` : null, nonZero(w.fees) ? `you pay ${formatBag(w.fees, w.home)} a year in fees` : null]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </View>
      ) : (
        <T variant="subheading">Worth money each time you use them</T>
      )}
      {w.lines.slice(0, show).map((l) => (
        <View key={l.key} style={{ gap: 1 }}>
          <Row gap={space.sm}>
            <T variant="body" style={{ flex: 1 }} numberOfLines={1}>{l.title}</T>
            <T variant="label">{l.stated ? '' : '≈ '}{formatMoney(l.value, { currency: l.currency, home: w.home })}</T>
          </Row>
          <T variant="caption" faint numberOfLines={2}>{l.from} · {l.how}</T>
        </View>
      ))}
      {w.perUse.slice(0, 2).map((p) => (
        <View key={p.key} style={{ gap: 1 }}>
          <Row gap={space.sm}>
            <T variant="body" style={{ flex: 1 }} numberOfLines={1}>{p.title}</T>
            <T variant="label">≈ {formatMoney(p.worth, { currency: p.currency, home: w.home })} each use</T>
          </Row>
          <T variant="caption" faint numberOfLines={2}>{p.from} · {p.basis ?? 'Not used this past year'}</T>
        </View>
      ))}
      {linked && w.lines.length > show ? <T variant="caption" color={c.accent}>+ {w.lines.length - show} more · see every perk</T> : null}
      {!linked ? <T variant="caption" faint>Credits are the issuer’s own amounts. ≈ values are what the same thing costs on its own (a Priority Pass visit, an airline’s bag fee), counted for the flights in your receipts this past year.</T> : null}
    </Panel>
  );
}
