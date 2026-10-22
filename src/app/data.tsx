import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button, ErrorNote, Note, Panel, Screen, T } from '@/components/ui';
import { deleteAccount, deliverExport, exportMyData } from '@/lib/account';
import { signOut, useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

/** Export everything, or delete everything. */
export default function YourData() {
  const c = useColors();
  const toast = useToast();
  const { session } = useAuth();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    setBusy('export');
    setError(null);
    try {
      const { json, fileName } = await exportMyData(session?.user.email ?? null);
      await deliverExport(json, fileName);
      toast('Your data is ready', { tone: 'info' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    if (confirm.trim() !== 'DELETE') return setError('Type DELETE in capitals to confirm.');
    setBusy('delete');
    setError(null);
    try {
      await deleteAccount();
      await signOut(); // the account no longer exists; this clears the session on this device
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: space.sm }}>
        <T variant="heading">Export my data</T>
        <T variant="caption" muted>
          A file with everything PerkScan keeps about you: profile, cards, credits, offers, receipts, the summary of each email or text,
          reviews, perks and connected sources. Email and text contents are already deleted once read.
        </T>
        <Button title="Export" icon="download-outline" kind="secondary" loading={busy === 'export'} onPress={doExport} />
      </Panel>

      <Panel style={{ gap: space.sm, borderColor: c.danger }}>
        <T variant="heading" color={c.danger}>Delete my account and data</T>
        <T variant="caption" muted>
          Permanently deletes your account and everything in it, right away. This can’t be undone. Your Gmail script and iPhone
          Shortcut stop working too — you can remove them afterwards.
        </T>
        <T variant="label">Type DELETE to confirm</T>
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space.md }}>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            placeholder="DELETE"
            placeholderTextColor={c.textFaint}
            accessibilityLabel="Type DELETE to confirm"
            style={{ paddingVertical: 12, fontSize: 16, fontFamily: font.medium, color: c.text }}
          />
        </View>
        <Button title="Delete everything" icon="trash-outline" kind="danger" loading={busy === 'delete'} disabled={confirm.trim() !== 'DELETE'} onPress={doDelete} />
      </Panel>

      {error ? <ErrorNote message={error} /> : null}
      <Note icon="lock-closed-outline">PerkScan never sells or shares your data.</Note>
    </Screen>
  );
}
