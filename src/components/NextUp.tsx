import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { addToBag, formatBag, getHomeCurrency, type MoneyBag } from '@/domain/format';
import { claimsToCheck } from '@/domain/claims';
import { foundMoney, nextStep, worthCelebrating } from '@/domain/firstRun';
import { setupSteps } from '@/domain/money';
import { allSetup } from '@/domain/paidFor';
import { usedQuestions } from '@/domain/usedFromReceipts';
import { useData } from '@/lib/data';
import { useMembershipHints, useMySubscriptions, usePayingTwice } from '@/lib/memberships';
import { usePaidFor } from '@/lib/paidFor';
import { useDismissed } from '@/lib/suggestions';
import { space, useColors } from '@/theme';
import { ArrivalCheck, UsedCheck } from './Claims';
import { Found, NextStep } from './FirstRun';
import { TurnOnPanel } from './PaidFor';
import { MembershipNudge, PayingTwicePanel } from './PayingTwice';
import { SpottedCardPanel, useSpottedCards } from './SpottedCards';
import { Panel, Row, T } from './ui';

// "Next up": everything PerkScan wants you to do or answer, most important first. Home shows the first
// one; the rest wait one tap away, so Home stays one screen. Nothing here is new: these are the same
// panels Home used to stack.

export interface NextUpItem {
  key: string;
  node: ReactNode;
}

export function useNextUp(): NextUpItem[] {
  const c = useColors();
  const { data } = useData();
  const [dismissed, dismiss, loaded] = useDismissed();
  const spotted = useSpottedCards();
  const twice = usePayingTwice();
  const hints = useMembershipHints();
  const subs = useMySubscriptions();
  const toTurnOn = allSetup(usePaidFor());
  const statusOf = useCallback((id: string) => data.benefits.find((b) => b.id === id)?.status, [data.benefits]);

  return useMemo(() => {
    const now = new Date();
    const home = data.profile?.home_currency?.trim() || getHomeCurrency();
    const items: NextUpItem[] = [];
    // 1. Questions only you can answer: did you use it, did the money arrive.
    const ask = usedQuestions(data.opportunities, data.receipts)[0];
    if (ask) items.push({ key: 'used', node: <UsedCheck question={ask} /> });
    const arrived = claimsToCheck(data.opportunities, now)[0];
    if (arrived) items.push({ key: 'arrived', node: <ArrivalCheck opp={arrived} /> });
    // 2. Setup still to finish.
    const step = nextStep(setupSteps(data));
    if (step) items.push({ key: 'step', node: <NextStep step={step} /> });
    if (!loaded) return items;
    // 3. The "we found $X" moment, until it's seen.
    const found = foundMoney(data.opportunities, data.recovered, now, statusOf);
    if (worthCelebrating(found) && data.profile?.onboarded_at && !dismissed.has('found')) items.push({ key: 'found', node: <Found found={found} home={home} onDone={() => dismiss('found')} /> });
    // 4. Things to set up or stop paying for.
    if (spotted[0]) items.push({ key: 'card', node: <SpottedCardPanel spotted={spotted[0]} more={spotted.length - 1} /> });
    if (twice.length) items.push({ key: 'twice', node: <PayingTwicePanel /> });
    const turnOnKey = `turn-on:${toTurnOn.length}`;
    if (toTurnOn.length && !dismissed.has(turnOnKey)) items.push({ key: 'turn-on', node: <TurnOnPanel items={toTurnOn} onHide={() => dismiss(turnOnKey)} /> });
    const student = subs.filter((x) => x.student);
    if (student.length) {
      const yearly = student.reduce((b, x) => addToBag(b, x.student!.currency, x.student!.savesYearly), {} as MoneyBag);
      items.push({
        key: 'student',
        node: (
          <Panel onPress={() => router.push('/subscriptions')} style={{ gap: 4 }}>
            <T variant="caption" color={c.accentStrong}>Your subscriptions</T>
            <T variant="subheading">Save {formatBag(yearly)} a year with student prices</T>
            <T variant="caption" muted>{student.map((x) => x.name).join(', ')}: you pay the full price, and you qualify for the student plan.</T>
          </Panel>
        ),
      });
    }
    const hasMembership = data.userCards.some((u) => data.cards.find((x) => x.id === u.card_id)?.kind === 'membership');
    const nudgeKey = `memberships:${hints[0]?.membershipId ?? 'general'}`;
    if (data.profile?.onboarded_at && (hints.length > 0 || !hasMembership) && !dismissed.has(nudgeKey)) items.push({ key: 'membership', node: <MembershipNudge onHide={() => dismiss(nudgeKey)} /> });
    return items;
  }, [c, data, loaded, dismissed, dismiss, spotted, twice, hints, subs, toTurnOn, statusOf]);
}

/** Home: the most important thing to do, and how many more are waiting. */
export function NextUpCard() {
  const c = useColors();
  const items = useNextUp();
  if (!items.length) return null;
  return (
    <>
      {items[0]!.node}
      {items.length > 1 ? (
        <Pressable onPress={() => router.push('/next-up')} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginTop: -space.xs })}>
          <Row gap={4} style={{ justifyContent: 'center' }}>
            <T variant="label" color={c.accent}>{items.length - 1} more thing{items.length === 2 ? '' : 's'} to do</T>
            <Ionicons name="chevron-forward" size={14} color={c.accent} />
          </Row>
        </Pressable>
      ) : null}
    </>
  );
}
