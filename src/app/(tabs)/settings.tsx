import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { DISCLAIMER_FULL } from '@/components/Disclaimer';
import { Button, ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { remindersEnabled, requestReminderPermission, setRemindersEnabled, syncReminders } from '@/lib/notifications';
import { space, useColors } from '@/theme';

export default function Settings() {
  const c = useColors();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const [reminders, setReminders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    remindersEnabled().then(setReminders);
  }, []);

  const toggleStudent = async (v: boolean) => {
    if (!session) return;
    try {
      await updateProfile(session.user.id, { is_student: v });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleReminders = async (v: boolean) => {
    if (v && !(await requestReminderPermission())) {
      Alert.alert('Notifications are off', 'Turn on notifications for PerkScan in your phone settings to get reminders.');
      return;
    }
    setReminders(v);
    await setRemindersEnabled(v);
    if (v) await syncReminders(data.opportunities, data.recovered);
  };

  const verifiedDates = data.benefits.map((b) => b.last_verified).filter(Boolean).sort();
  const unverified = data.benefits.filter((b) => b.status === 'TODO_VERIFY').length;

  return (
    <Screen>
      <T variant="title">Settings</T>
      {error ? <ErrorNote message={error} /> : null}

      <Panel>
        <T variant="label" faint>Signed in as</T>
        <T variant="heading">{session?.user.email ?? 'Apple / Google account'}</T>
      </Panel>

      <Panel>
        <Row>
          <View style={{ flex: 1 }}><T variant="heading">I’m a student</T></View>
          <Switch value={!!data.profile?.is_student} onValueChange={toggleStudent} trackColor={{ true: c.accent }} />
        </Row>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heading">Credit reminders</T>
            <T variant="caption" muted>7 and 2 days before an unused credit resets.</T>
          </View>
          <Switch value={reminders} onValueChange={toggleReminders} trackColor={{ true: c.accent }} />
        </Row>
      </Panel>

      <Panel>
        <T variant="heading">About the numbers</T>
        <T variant="caption" muted>
          {unverified} of {data.benefits.length} catalog benefits are not verified yet and count as $0.
          {verifiedDates.length ? ` Latest verification: ${verifiedDates[verifiedDates.length - 1]}.` : ''}
        </T>
      </Panel>

      <Panel>
        <T variant="heading">Disclaimer</T>
        {DISCLAIMER_FULL.map((p) => (
          <T key={p} variant="caption" muted>{p}</T>
        ))}
      </Panel>

      <Panel>
        <T variant="heading">Privacy & terms</T>
        <T variant="caption" muted>
          PerkScan stores only your card names, last four digits, and the benefits you track. We never store full card
          numbers and never sell or share your data. Full privacy policy and terms will be published before launch.
        </T>
      </Panel>

      <View style={{ gap: space.sm }}>
        <Button title="Sign out" kind="secondary" icon="log-out-outline" onPress={signOut} />
        <T variant="caption" faint style={{ textAlign: 'center' }}>
          Export and delete-my-data arrive in a later update.
        </T>
      </View>
    </Screen>
  );
}
