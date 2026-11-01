import { useState } from 'react';
import { Linking, View } from 'react-native';
import { claimHelp, fillGaps, gapLabel, mailtoLink, type ClaimHelp } from '@/domain/claims';
import type { Opportunity } from '@/domain/types';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { startClaim } from '@/lib/claims';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';
import { Button, Field, T } from './ui';

const NAME_GAP = '[your name]';

/** The written request for an item, when there is one to send by email. */
export function useRequest(opp: Opportunity): ClaimHelp | null {
  const { data } = useData();
  const receipt = opp.source_receipt_id ? data.receipts.find((r) => r.id === opp.source_receipt_id) : undefined;
  const help = opp.status === 'open' ? claimHelp({ opp, receipt, name: data.profile?.display_name }) : null;
  return help?.message ? help : null;
}

/**
 * "Send request": opens your own email with the request written. Nothing missing: one tap. Something
 * missing (an order number PerkScan didn't see): asks for just that first, so nothing goes out with a
 * [blank] in it. Your name is kept for next time. PerkScan never sends anything itself.
 */
export function SendRequest({ opp, help, size = 'md' }: { opp: Opportunity; help: ClaimHelp; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const { session } = useAuth();
  const { refresh } = useData();
  const [asking, setAsking] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const gaps = help.gaps;
  const ready = gaps.every((g) => values[g]?.trim());

  const send = async () => {
    const message = fillGaps(help.message!, values);
    await Linking.openURL(mailtoLink(message));
    // Your name, once: the next request is signed without asking.
    const name = values[NAME_GAP]?.trim();
    if (name && session) updateProfile(session.user.id, { display_name: name }).catch(() => {});
    if (!opp.claim_started_at) {
      try {
        await startClaim(opp.id, help.kind);
        toast('Sent to your email. We’ll ask in a few days whether it arrived.', { tone: 'success' });
      } catch {
        // Not essential: the request itself is already in their email.
      }
    }
    setAsking(false);
    await refresh();
  };

  if (asking) {
    return (
      <View style={{ gap: space.sm, width: '100%' }}>
        <T variant="caption" muted>PerkScan didn’t see {gaps.length === 1 ? 'this' : 'these'} in your email. Fill {gaps.length === 1 ? 'it' : 'them'} in and it goes straight into the request.</T>
        {gaps.map((g) => (
          <Field
            key={g}
            label={gapLabel(g)}
            value={values[g] ?? ''}
            onChangeText={(v) => setValues((prev) => ({ ...prev, [g]: v }))}
            autoCapitalize={g === NAME_GAP ? 'words' : 'none'}
            autoCorrect={false}
          />
        ))}
        <Button title="Open in my email" icon="mail" disabled={!ready} onPress={send} />
        <Button title="Cancel" kind="ghost" size="sm" onPress={() => setAsking(false)} />
      </View>
    );
  }
  return <Button title={opp.claim_started_at ? 'Send again' : 'Send request'} icon="mail" size={size} onPress={() => (gaps.length ? setAsking(true) : send())} />;
}

