import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, ErrorNote, Note, Screen, T } from '@/components/ui';
import { useData } from '@/lib/data';
import { submitText } from '@/lib/inbox';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

/** Paste a text, or receive one shared from another app (Android "Share → PerkScan"). */
export default function AddText() {
  const c = useColors();
  const toast = useToast();
  const { refresh } = useData();
  const params = useLocalSearchParams<{ text?: string }>();
  const [text, setText] = useState(typeof params.text === 'string' ? params.text : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opened straight from a share there may be nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/offers'));

  const send = async () => {
    if (!text.trim()) return setError('Paste a text message first.');
    setBusy(true);
    setError(null);
    try {
      const r = await submitText(text.trim());
      if (r.skipped === 'security_code') {
        toast('That text has a sign-in code, so PerkScan didn’t keep it', { tone: 'info' });
        close();
        return;
      }
      if (r.skipped === 'duplicate') {
        toast('PerkScan already has that text', { tone: 'info' });
        close();
        return;
      }
      if (r.result?.status !== 'parsed') {
        setError(r.result?.error ?? 'PerkScan couldn’t read that text. Try again later from Inbox.');
        return;
      }
      await refresh();
      const found = r.result.opportunities ?? 0;
      toast(
        r.result.kind === 'card_alert'
          ? 'Purchase added to your card'
          : found
            ? `Found ${found} thing${found === 1 ? '' : 's'} to use`
            : r.result.kind === 'other'
              ? 'Nothing to save in that one'
              : 'Saved',
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>Paste a bank alert or an offer you got by text. PerkScan reads it the same way as an email.</T>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: space.md }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="e.g. There was an authorization… on your Scotiabank Credit Card ***1234"
          placeholderTextColor={c.textFaint}
          multiline
          autoFocus={!text}
          maxLength={5000}
          accessibilityLabel="Text message"
          style={{ minHeight: 140, fontSize: 16, fontFamily: font.regular, color: c.text, textAlignVertical: 'top' }}
        />
      </View>
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Add to PerkScan" icon="checkmark" onPress={send} loading={busy} />
      <Note icon="lock-closed-outline">
        Texts with sign-in or verification codes are never kept. Card numbers are hidden before anything is read, and the
        text is deleted once PerkScan has read it.
      </Note>
    </Screen>
  );
}
