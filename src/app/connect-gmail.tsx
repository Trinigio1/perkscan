import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { Button, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import { relativeDays } from '@/domain/format';
import type { IngestToken } from '@/domain/types';
import { useData } from '@/lib/data';
import { createToken, GMAIL_SCRIPT_URL, INGEST_URL, listTokens, revokeToken, sendTestEmail } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

function CopyBox({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const c = useColors();
  const toast = useToast();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <Pressable
        onPress={async () => {
          await Clipboard.setStringAsync(value);
          toast(`${label} copied`, { tone: 'info' });
        }}
        accessibilityLabel={`Copy ${label}`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          padding: space.md,
          borderRadius: radius.md,
          backgroundColor: secret ? c.warnSoft : c.surfaceAlt,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <T variant="caption" style={{ flex: 1, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }} numberOfLines={3}>
          {value}
        </T>
        <Ionicons name="copy-outline" size={18} color={c.textMuted} />
      </Pressable>
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="label" color={c.accentText} style={{ fontFamily: font.bold }}>{n}</T>
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <T variant="subheading">{title}</T>
        {children}
      </View>
    </Row>
  );
}

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
      setFresh(await createToken('Gmail'));
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
  const revoke = (t: IngestToken) => {
    const msg = 'Any Gmail script using it will stop sending emails.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`Revoke this token? ${msg}`)) doRevoke(t);
      return;
    }
    Alert.alert('Revoke this token?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => doRevoke(t) },
    ]);
  };

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
        <Step n={1} title="Create your personal token">
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

      {tokens.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Active tokens</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {tokens.map((t) => (
              <Row key={t.id} gap={space.md} style={{ paddingVertical: space.sm }}>
                <IconBubble icon="key" tone="gray" size={34} />
                <View style={{ flex: 1 }}>
                  <T variant="subheading">{t.label}</T>
                  <T variant="caption" muted>
                    Created {relativeDays(new Date(t.created_at), new Date())} · {t.last_used_at ? `last used ${relativeDays(new Date(t.last_used_at), new Date())}` : 'not used yet'}
                  </T>
                </View>
                <Button title="Revoke" kind="danger" size="sm" onPress={() => revoke(t)} />
              </Row>
            ))}
          </Panel>
        </View>
      ) : null}
    </Screen>
  );
}
