import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { confirmRevoke, CopyBox, Step, TokenList } from '@/components/Setup';
import { Badge, Button, ErrorNote, IconBubble, Note, Panel, Row, Screen, Segmented, T } from '@/components/ui';
import { relativeDays } from '@/domain/format';
import type { IngestToken } from '@/domain/types';
import { useData } from '@/lib/data';
import { createToken, INGEST_SMS_URL, listMessages, listTokens, revokeToken, sendTestText, SHORTCUT_URL } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

type Phone = 'iphone' | 'android';

/**
 * One automation per word. These catch bank alerts and offers. "code" is left out on
 * purpose: it would also catch sign-in codes (PerkScan drops those, but better not to send them).
 */
const TRIGGER_WORDS = ['Scotiabank', 'TT$', '% off', 'promo', 'reward', 'points'];

export default function ConnectTexts() {
  const toast = useToast();
  const { refresh } = useData();
  const [phone, setPhone] = useState<Phone>(Platform.OS === 'android' ? 'android' : 'iphone');
  const [tokens, setTokens] = useState<IngestToken[]>([]);
  const [lastText, setLastText] = useState<string | null | undefined>(undefined);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listTokens()
      .then((all) => setTokens(all.filter((t) => t.label.startsWith('iPhone'))))
      .catch((e: Error) => setError(e.message));
    listMessages(100)
      .then((m) => setLastText(m.find((x) => x.source === 'sms')?.received_at ?? null))
      .catch(() => setLastText(undefined));
  }, []);
  useFocusEffect(load);

  const create = async () => {
    setBusy('create');
    setError(null);
    try {
      setFresh(await createToken('iPhone texts'));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revoke = (t: IngestToken) =>
    confirmRevoke('Your Shortcut will stop sending texts until you paste in a new token.', async () => {
      try {
        await revokeToken(t.id);
        toast('Token revoked', { tone: 'info' });
        load();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  const test = async () => {
    setBusy('test');
    setError(null);
    try {
      const r = await sendTestText();
      if (r.result?.status === 'parsed') {
        toast('PerkScan read the sample text — check Offers');
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
        <IconBubble icon="chatbubbles" tone="green" size={52} />
        <View style={{ flex: 1 }}>
          <T variant="title">Connect texts</T>
          <T variant="caption" muted>Bank alerts and offers you get by text · free</T>
        </View>
      </Row>
      <Note icon="lock-closed-outline">
        Only texts matching your words are sent. Sign-in codes are thrown away unread; the rest is deleted once read.
      </Note>

      <Segmented<Phone>
        value={phone}
        onChange={setPhone}
        options={[
          { label: 'iPhone', value: 'iphone' },
          { label: 'Android', value: 'android' },
        ]}
      />

      {phone === 'iphone' ? (
        <>
          <Panel style={{ gap: space.lg }}>
            <Step n={1} title="Create your texts token">
              {fresh ? (
                <>
                  <CopyBox label="Token" value={`Bearer ${fresh}`} secret />
                  <T variant="caption" muted>
                    Shown only once, with “Bearer ” in front — paste it exactly like this. Treat it like a password.
                  </T>
                </>
              ) : (
                <Button title={tokens.length ? 'Create a new token' : 'Create token'} icon="key" size="sm" loading={busy === 'create'} onPress={create} style={{ alignSelf: 'flex-start' }} />
              )}
              <CopyBox label="URL" value={INGEST_SMS_URL} />
            </Step>

            <Step n={2} title="Make an automation in Shortcuts">
              {SHORTCUT_URL ? (
                <Button title="Get the ready-made Shortcut" icon="download-outline" kind="secondary" size="sm" onPress={() => Linking.openURL(SHORTCUT_URL!)} style={{ alignSelf: 'flex-start' }} />
              ) : null}
              <T variant="caption" muted>
                Open the Shortcuts app → Automation → + → Message. Under “Message Contains” type a word from below,
                choose “Run Immediately”, then tap Next → New Blank Automation.
              </T>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {TRIGGER_WORDS.map((w) => (
                  <Badge key={w} label={w} />
                ))}
              </Row>
            </Step>

            <Step n={3} title="Add “Get Contents of URL”">
              <T variant="caption" muted>
                Add Action → search “Get Contents of URL”. Tap URL and paste the URL. Tap the arrow to show more:
              </T>
              <T variant="caption" muted>• Method: POST</T>
              <T variant="caption" muted>• Headers → Add new header: key Authorization, value: your token (starting with “Bearer ”)</T>
              <T variant="caption" muted>
                • Request Body: JSON → Add new field → Text. Key: text. Value: tap it, pick “Shortcut Input”, then tap
                Shortcut Input again and choose “Content”.
              </T>
              <T variant="caption" muted>Tap Done. Repeat steps 2–3 for each word you want (Shortcuts allows one word per automation).</T>
            </Step>

            <Step n={4} title="Check it works">
              <T variant="caption" muted>
                Runs a sample offer text through PerkScan. Then send yourself an iMessage with one of your words, and
                watch for it below.
              </T>
              <Button title="Send a test text" icon="paper-plane" kind="secondary" size="sm" loading={busy === 'test'} onPress={test} style={{ alignSelf: 'flex-start' }} />
              {lastText !== undefined ? (
                <Badge
                  label={lastText ? `Last text from your Shortcut: ${relativeDays(new Date(lastText), new Date())}` : 'No texts from your Shortcut yet'}
                  tone={lastText ? 'good' : 'neutral'}
                  icon={lastText ? 'checkmark' : 'time-outline'}
                />
              ) : null}
            </Step>
          </Panel>
          <TokenList tokens={tokens} onRevoke={revoke} />
        </>
      ) : (
        <Panel style={{ gap: space.lg }}>
          <Step n={1} title="Share a text into PerkScan">
            <T variant="caption" muted>
              In Messages, long-press a text → Share → PerkScan. PerkScan never asks to read all your texts.
            </T>
            {Platform.OS === 'android' ? null : (
              <T variant="caption" muted>Sharing works in the installed Android app (not Expo Go or the browser).</T>
            )}
          </Step>
          <Step n={2} title="Or paste it">
            <T variant="caption" muted>Copy any text and paste it into PerkScan. Works on every phone.</T>
            <Button title="Paste a text" icon="clipboard-outline" kind="secondary" size="sm" onPress={() => router.push('/add-text')} style={{ alignSelf: 'flex-start' }} />
          </Step>
        </Panel>
      )}

      {error ? <ErrorNote message={error} /> : null}
    </Screen>
  );
}
