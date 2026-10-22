import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ListRow } from '@/components/ListRow';
import { confirmRevoke, CopyBox, TokenList } from '@/components/Setup';
import { Button, ErrorNote, Note, Panel, Screen, T } from '@/components/ui';
import type { IngestToken } from '@/domain/types';
import { regenerateForwardingAddress } from '@/lib/account';
import { useData } from '@/lib/data';
import { listTokens, revokeToken } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

/** Everything that can send PerkScan your emails and texts, in one place. */
export default function Sources() {
  const toast = useToast();
  const { data, refresh } = useData();
  const [tokens, setTokens] = useState<IngestToken[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listTokens().then(setTokens).catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const revoke = (t: IngestToken) =>
    confirmRevoke(`“${t.label}” will stop sending to PerkScan right away.`, async () => {
      try {
        await revokeToken(t.id);
        toast('Revoked', { tone: 'info' });
        load();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const regenerate = async () => {
    setBusy(true);
    try {
      await regenerateForwardingAddress();
      await refresh();
      toast('New forwarding ID made', { tone: 'info' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>Each Gmail account and your iPhone texts Shortcut has its own token. Revoke one and it stops at once.</T>
      {tokens && !tokens.length ? <T variant="caption" muted>Nothing connected.</T> : null}
      {tokens ? <TokenList tokens={tokens} onRevoke={revoke} /> : null}
      <Panel style={{ paddingVertical: space.xs }}>
        <ListRow icon="mail" tone="blue" title="Connect a Gmail account" onPress={() => router.push('/connect-gmail')} />
        <ListRow icon="chatbubbles" tone="green" title="Connect texts" onPress={() => router.push('/connect-texts')} />
      </Panel>

      <Panel style={{ gap: space.sm }}>
        <T variant="subheading">Forwarding ID</T>
        <T variant="caption" muted>
          Reserved for email forwarding, which PerkScan doesn’t use yet (Gmail connects with the script above). Make a new one if it
          was ever shared by mistake.
        </T>
        {data.profile?.forwarding_address ? <CopyBox label="Forwarding ID" value={data.profile.forwarding_address} /> : null}
        <Button title="Make a new ID" icon="refresh" kind="secondary" size="sm" loading={busy} onPress={regenerate} style={{ alignSelf: 'flex-start' }} />
      </Panel>
      {error ? <ErrorNote message={error} /> : null}
      <Note icon="lock-closed-outline">Tokens are stored only as a fingerprint, so nobody — including PerkScan — can read them back.</Note>
    </Screen>
  );
}
