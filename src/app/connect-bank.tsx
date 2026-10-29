import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { Badge, Button, ErrorNote, Note, Panel, Row, Screen, T } from '@/components/ui';
import { connectBank, disconnectBank, listConnections, syncBank, type BankConnection } from '@/lib/bank';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

const STATUS: Record<BankConnection['status'], { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  active: { label: 'Connected', tone: 'good' },
  needs_login: { label: 'Sign in again', tone: 'warn' },
  error: { label: 'Problem', tone: 'bad' },
  revoked: { label: 'Access ended', tone: 'bad' },
};

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet');

/** Connect a bank or card account so every purchase counts, not only the ones that send an email. */
export default function ConnectBank() {
  const toast = useToast();
  const { refresh } = useData();
  const [list, setList] = useState<BankConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listConnections().then(setList).catch((e: Error) => setError(e.message));
  }, []);
  useFocusEffect(load);

  const run = async (id: string, work: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await work();
      load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run('connect', async () => {
      const ok = await connectBank();
      toast(ok ? 'Connected. Your purchases are coming in.' : 'Not connected. You can try again any time.', { tone: ok ? 'success' : 'info' });
      // Straight to what it found.
      if (ok) router.push('/scan');
    });

  const disconnect = (c: BankConnection) => {
    const go = () => run(c.id, async () => {
      await disconnectBank(c.id);
      toast('Disconnected', { tone: 'info' });
    });
    const msg = 'PerkScan stops reading this bank right away. Purchases already brought in stay.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) go();
    } else {
      Alert.alert(`Disconnect ${c.institution_name ?? 'this bank'}?`, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Disconnect', style: 'destructive', onPress: go }]);
    }
  };

  return (
    <Screen edges={[]}>
      <T muted>
        Every card purchase shows up, not only the ones that send an email. PerkScan uses them to spot credits you used, protections you earned, double charges and
        subscriptions.
      </T>
      <Note>
        Read-only: PerkScan can never move money. It keeps the store, amount, date and the card’s last four digits, never full account numbers. Connections go
        through Plaid, and you can disconnect any time.
      </Note>

      {(list ?? []).map((c) => (
        <Panel key={c.id} style={{ gap: space.sm }}>
          <Row gap={space.sm}>
            <T variant="subheading" style={{ flex: 1 }}>{c.institution_name ?? 'Your bank'}</T>
            <Badge label={STATUS[c.status].label} tone={STATUS[c.status].tone} />
          </Row>
          {c.accounts.length ? <T variant="caption" muted>{c.accounts.map((a) => `${a.name}${a.mask ? ` ·· ${a.mask}` : ''}`).join(' · ')}</T> : null}
          <T variant="caption" faint>Last updated {ago(c.last_synced_at)}{c.last_error ? ` · ${c.last_error}` : ''}</T>
          <Row gap={space.sm}>
            {c.status === 'active' ? <Button title="Update now" size="sm" kind="secondary" loading={busy === `sync-${c.id}`} disabled={!!busy} onPress={() => run(`sync-${c.id}`, async () => { await syncBank(c.id); })} /> : null}
            {c.status === 'needs_login' ? <Button title="Sign in again" size="sm" onPress={connect} disabled={!!busy} /> : null}
            <Button title="Disconnect" size="sm" kind="ghost" loading={busy === c.id} disabled={!!busy} onPress={() => disconnect(c)} />
          </Row>
        </Panel>
      ))}

      {/* Before Plaid's keys are set on the server, say so plainly and offer email instead. */}
      {error && /set up/i.test(error) ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Bank connection is coming soon</T>
          <T variant="caption" muted>It isn’t switched on yet. Email works now: receipts, card alerts, codes and refunds.</T>
          <Button title="Connect Gmail" icon="mail" onPress={() => router.push('/connect-gmail')} />
        </Panel>
      ) : error ? (
        <ErrorNote message={error} />
      ) : null}
      <View style={{ gap: space.xs }}>
        <Button title={list?.length ? 'Connect another bank' : 'Connect a bank'} icon="add" loading={busy === 'connect'} disabled={!!busy} onPress={connect} />
        <T variant="caption" faint center>Opens your bank’s sign-in through Plaid. PerkScan never sees your bank password.</T>
      </View>
      <Button title="See what PerkScan found" kind="secondary" icon="sparkles" onPress={() => router.push('/scan')} />
      <Button title="Use email instead" kind="ghost" onPress={() => router.push('/connect-gmail')} />
    </Screen>
  );
}
