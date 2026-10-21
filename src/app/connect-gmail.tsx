import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { confirmRevoke, CopyBox, Step, TokenList } from '@/components/Setup';
import { Button, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import type { IngestToken } from '@/domain/types';
import { useData } from '@/lib/data';
import { createToken, GMAIL_SCRIPT_URL, INGEST_URL, listTokens, revokeToken, sendTestEmail } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

export default function ConnectGmail() {
  const toast = useToast();
  const { refresh } = useData();
  const [tokens, setTokens] = useState<IngestToken[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listTokens().then(setTokens).catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      // One token per Gmail account, e.g. a second inbox that gets your bank alerts.
      const gmail = tokens.filter((t) => t.label.startsWith('Gmail')).length;
      setFresh(await createToken(gmail ? `Gmail ${gmail + 1}` : 'Gmail'));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doRevoke = async (t: IngestToken) => {
    try {
      await revokeToken(t.id);
      toast('Token revoked', { tone: 'info' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const revoke = (t: IngestToken) => confirmRevoke('Anything using it (a Gmail script or iPhone Shortcut) will stop sending.', () => doRevoke(t));

  const test = async () => {
    setBusy('test');
    setError(null);
    try {
      const r = await sendTestEmail();
      if (r.result?.status === 'parsed') {
        toast('It works — check Offers');
        refresh();
      } else setError(r.result?.error ?? `Test finished with status “${r.result?.status ?? 'unknown'}”.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={[]}>
      <Row gap={space.md}>
        <IconBubble icon="mail" tone="blue" size={52} />
        <View style={{ flex: 1 }}>
          <T variant="title">Connect Gmail</T>
          <T variant="caption" muted>Free · about 5 minutes · needs a computer once</T>
        </View>
      </Row>
      <Note icon="lock-closed-outline">
        PerkScan only sees emails you label “PerkScan”. A small script in your own Google account sends them; nothing
        else in your inbox is read.
      </Note>

      <Panel style={{ gap: space.lg }}>
        <Step n={1} title="Create a token for this Gmail account">
          {fresh ? (
            <>
              <CopyBox label="Token" value={fresh} secret />
              <T variant="caption" muted>Shown only once. Treat it like a password — anyone with it can send emails to your PerkScan.</T>
            </>
          ) : (
            <Button title={tokens.length ? 'Create another token' : 'Create token'} icon="key" size="sm" loading={busy === 'create'} onPress={create} style={{ alignSelf: 'flex-start' }} />
          )}
          <CopyBox label="URL" value={INGEST_URL} />
        </Step>
        <Step n={2} title="Add the script to Google">
          <T variant="caption" muted>
            On a computer, open the setup guide, paste the script into script.google.com, and fill in your token and URL.
          </T>
          <Button title="Open setup guide" icon="open-outline" kind="secondary" size="sm" onPress={() => Linking.openURL(GMAIL_SCRIPT_URL)} style={{ alignSelf: 'flex-start' }} />
        </Step>
        <Step n={3} title="Label emails “PerkScan”">
          <T variant="caption" muted>The guide has a Gmail filter that labels receipts, coupons, gift cards and trials automatically.</T>
        </Step>
        <Step n={4} title="Check it works">
          <T variant="caption" muted>Runs a sample coupon through PerkScan’s email reader.</T>
          <Button title="Send a test email" icon="paper-plane" kind="secondary" size="sm" loading={busy === 'test'} onPress={test} style={{ alignSelf: 'flex-start' }} />
        </Step>
      </Panel>

      {error ? <ErrorNote message={error} /> : null}

      <TokenList tokens={tokens} onRevoke={revoke} />
    </Screen>
  );
}
