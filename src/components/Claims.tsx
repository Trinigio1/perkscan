import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { followUpQuestion, type ClaimTarget } from '@/domain/claimTarget';
import { mailtoLink, type ClaimHelp } from '@/domain/claims';
import { formatMoney, relativeDays } from '@/domain/format';
import type { Opportunity } from '@/domain/types';
import { orderPhrase, type UsedQuestion } from '@/domain/usedFromReceipts';
import { track } from '@/lib/analytics';
import { cancelClaim, snoozeClaimCheck, startClaim } from '@/lib/claims';
import { markCredit } from '@/lib/credits';
import { useData } from '@/lib/data';
import { answerUsedGuess, markOpportunity } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { radius, space, useColors } from '@/theme';
import { Button, IconBubble, Panel, Row, T } from './ui';

/**
 * "Ask for it": the request PerkScan wrote, ready for the user to send from their own email —
 * or the details to copy into an official claim form. PerkScan never sends anything itself.
 */
export function ClaimHelper({ opp, help }: { opp: Opportunity; help: ClaimHelp }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [expanded, setExpanded] = useState(false);

  // Remember that they started, so PerkScan can ask later whether it arrived.
  const started = async () => {
    if (opp.claim_started_at) return;
    try {
      await startClaim(opp.id, help.kind);
      await refresh();
      toast('We’ll check in with you in a few days', { tone: 'success' });
    } catch {
      // Not essential: the request itself already went out.
    }
  };

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    toast(`${what} copied`, { tone: 'info' });
  };

  return (
    <Panel style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <T variant="heading">{help.heading}</T>
        <T variant="caption" muted>To: {help.to}</T>
      </View>

      {opp.claim_started_at ? (
        <Row gap={space.sm} style={{ backgroundColor: c.accentSoft, borderRadius: radius.md, padding: space.md }}>
          <Ionicons name="paper-plane" size={16} color={c.accentStrong} />
          <T variant="caption" color={c.accentStrong} style={{ flex: 1 }}>
            Started {relativeDays(new Date(opp.claim_started_at), new Date())}. We’ll ask whether it arrived.
          </T>
        </Row>
      ) : null}

      {help.message ? (
        <>
          <Pressable onPress={() => setExpanded(!expanded)} accessibilityRole="button" accessibilityLabel={expanded ? 'Show less' : 'Show the whole message'}>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: space.xs }}>
              <T variant="label">{help.message.subject}</T>
              <T variant="caption" numberOfLines={expanded ? undefined : 5}>{help.message.body}</T>
              <T variant="caption" color={c.accent}>{expanded ? 'Show less' : 'Show all'}</T>
            </View>
          </Pressable>
          {help.gaps.length ? (
            <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <Ionicons name="create-outline" size={16} color={c.warn} />
              <T variant="caption" color={c.warn} style={{ flex: 1 }}>
                Fill in {help.gaps.join(', ')} before sending. PerkScan leaves out anything it doesn’t know rather than guess.
              </T>
            </Row>
          ) : null}
          <Button
            title="Open in my email"
            icon="mail"
            onPress={async () => {
              await Linking.openURL(mailtoLink(help.message!));
              await started();
            }}
          />
          <Button
            title="Copy message"
            kind="secondary"
            icon="copy-outline"
            onPress={async () => {
              await copy(`${help.message!.subject}\n\n${help.message!.body}`, 'Message');
              await started();
            }}
          />
        </>
      ) : null}

      {help.facts.length ? (
        <View style={{ gap: space.xs }}>
          {help.message ? <T variant="overline" muted>Details</T> : null}
          {help.facts.map((f) => (
            <Pressable key={f.label} onPress={() => copy(f.value, f.label)} accessibilityRole="button" accessibilityLabel={`Copy ${f.label}`}>
              <Row gap={space.sm} style={{ paddingVertical: 6 }}>
                <T variant="caption" muted style={{ width: 110 }}>{f.label}</T>
                <T variant="label" style={{ flex: 1 }}>{f.value}</T>
                <Ionicons name="copy-outline" size={14} color={c.textFaint} />
              </Row>
            </Pressable>
          ))}
        </View>
      ) : null}

      {help.url ? (
        <Button
          title={help.kind === 'settlement' ? 'Open the official claim form' : 'Open the claim page'}
          kind={help.message ? 'ghost' : 'primary'}
          icon="open-outline"
          onPress={async () => {
            await Linking.openURL(help.url!);
            await started();
          }}
        />
      ) : null}
      {!help.message && !help.url ? (
        <Button title="I’ve filed it" kind="secondary" icon="checkmark" onPress={started} />
      ) : null}
    </Panel>
  );
}

/**
 * The Claim button on every perk: copies the code if there is one, opens where you use it,
 * and remembers to ask later whether you did. Requests to send open the item's own screen.
 */
export function ClaimButton({ opp, target, size = 'md' }: { opp: Opportunity; target: ClaimTarget; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const { refresh } = useData();
  const claim = async () => {
    if (target.openItem) {
      router.push(opp.type === 'card_credit' ? { pathname: '/credit/[id]', params: { id: opp.id } } : { pathname: '/offer/[id]', params: { id: opp.id } });
      return;
    }
    if (target.copy) {
      await Clipboard.setStringAsync(target.copy);
      toast(`Copied ${target.copy}`, { tone: 'info' });
    }
    if (target.url) await Linking.openURL(target.url);
    if (!opp.claim_started_at) {
      startClaim(opp.id, 'use')
        .then(() => refresh())
        .catch(() => {});
    }
  };
  return (
    <View style={{ gap: 4, alignItems: size === 'sm' ? 'flex-start' : 'stretch' }}>
      <Button title={target.label} icon={target.openItem ? 'arrow-forward' : target.url ? 'open-outline' : 'copy-outline'} size={size} onPress={claim} />
      {size === 'md' ? <T variant="caption" muted center>{target.hint}</T> : null}
    </View>
  );
}

/** A few days after a claim: did the money arrive? Only a "yes" adds to the recovered total. */
export function ArrivalCheck({ opp }: { opp: Opportunity }) {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await fn();
      await refresh();
      toast(message, { tone: key === 'yes' ? 'success' : 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(null);
    }
  };

  const question = followUpQuestion(opp);
  const yes = () => {
    if (opp.type === 'card_credit') {
      run(
        'yes',
        async () => {
          await markCredit(opp.id, true);
          track('claim_checked', { result: 'arrived' });
        },
        opp.value_estimate !== null ? `Nice — ${formatMoney(opp.value_estimate, { currency: opp.currency })} used` : 'Marked as used',
      );
      return;
    }
    // Without a known amount, ask how much on the item's own screen.
    if (opp.value_estimate === null) {
      router.push({ pathname: '/offer/[id]', params: { id: opp.id, arrived: '1' } });
      return;
    }
    run(
      'yes',
      async () => {
        await markOpportunity(opp.id, 'used', opp.value_estimate);
        track('claim_checked', { result: 'arrived' });
      },
      `Nice — ${formatMoney(opp.value_estimate, { currency: opp.currency })} recovered`,
    );
  };

  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="help-circle" tone="blue" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">{question}</T>
          <T variant="caption" muted numberOfLines={2}>
            {opp.title}
            {opp.merchant ? ` · ${opp.merchant}` : ''}
            {opp.value_estimate !== null ? ` · ${formatMoney(opp.value_estimate, { currency: opp.currency })}` : ''}
          </T>
        </View>
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Button title="Yes" size="sm" icon="checkmark" loading={busy === 'yes'} disabled={!!busy} onPress={yes} />
        <Button title="Not yet" size="sm" kind="secondary" loading={busy === 'later'} disabled={!!busy} onPress={() => run('later', () => snoozeClaimCheck(opp.id), 'We’ll ask again in a few days')} />
        {question === 'Did it arrive?' ? (
          <Button
            title="It didn’t work"
            size="sm"
            kind="ghost"
            loading={busy === 'no'}
            disabled={!!busy}
            onPress={() =>
              run(
                'no',
                async () => {
                  await markOpportunity(opp.id, 'dismiss');
                  track('claim_checked', { result: 'didnt_work' });
                },
                'Sorry it didn’t work out',
              )
            }
          />
        ) : (
          // Didn't use it after all: stop asking, keep it in Money.
          <Button title="Didn’t use it" size="sm" kind="ghost" loading={busy === 'no'} disabled={!!busy} onPress={() => run('no', () => cancelClaim(opp.id), 'Kept in Money')} />
        )}
      </Row>
      <T variant="caption" faint style={{ color: c.textFaint }}>Only money you actually got counts toward your total.</T>
    </Panel>
  );
}

/**
 * "Did you use 25% off on your Oct 20 Uber Eats order?": a receipt showed a discount that might be this
 * offer. Yes adds what it saved to Used; No stops asking about it.
 */
export function UsedCheck({ question: q }: { question: UsedQuestion }) {
  const toast = useToast();
  const { refresh } = useData();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const answer = async (used: boolean) => {
    setBusy(used ? 'yes' : 'no');
    try {
      await answerUsedGuess(q.opp.id, used);
      track('used_from_receipt', { result: used ? 'yes' : 'no' });
      await refresh();
      const saved = q.amount ?? q.opp.value_estimate;
      toast(used ? (saved !== null ? `Nice — ${formatMoney(saved, { currency: q.opp.currency })} saved` : 'Marked as used') : 'Got it, kept it to use', { tone: used ? 'success' : 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
      setBusy(null);
    }
  };
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconBubble icon="receipt" tone="green" size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="subheading">Did you use this {orderPhrase(q.receipt)}?</T>
          <T variant="caption" muted numberOfLines={2}>{q.opp.title}</T>
          {q.opp.used_guess_line || q.amount !== null ? (
            <T variant="caption" muted numberOfLines={1}>
              The receipt shows: {q.opp.used_guess_line ?? 'a discount'}
              {q.amount !== null ? ` −${formatMoney(q.amount, { currency: q.opp.currency })}` : ''}
            </T>
          ) : null}
        </View>
      </Row>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Button title="Yes, I used it" size="sm" icon="checkmark" loading={busy === 'yes'} disabled={!!busy} onPress={() => answer(true)} />
        <Button title="No" size="sm" kind="secondary" loading={busy === 'no'} disabled={!!busy} onPress={() => answer(false)} />
      </Row>
    </Panel>
  );
}
