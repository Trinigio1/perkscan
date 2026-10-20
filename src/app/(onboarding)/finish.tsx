import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { Disclaimer } from '@/components/Disclaimer';
import { useAuth } from '@/lib/auth';
import { deviceTimeZone, updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { requestReminderPermission } from '@/lib/notifications';
import { space, useColors } from '@/theme';

export default function Finish() {
  const c = useColors();
  const { session } = useAuth();
  const { refresh } = useData();
  const [student, setStudent] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      if (reminders) await requestReminderPermission();
      await updateProfile(session.user.id, {
        is_student: student,
        timezone: deviceTimeZone(),
        onboarded_at: new Date().toISOString(),
      });
      await refresh(); // the navigator moves to Home once onboarded_at is set
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space.xs }}>
        <T variant="label" faint>Step 3 of 3</T>
        <T variant="title">A couple of quick things</T>
      </View>
      <Panel>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heading">I’m a student</T>
            <T variant="caption" muted>Unlocks student discounts in a later update.</T>
          </View>
          <Switch value={student} onValueChange={setStudent} trackColor={{ true: c.accent }} />
        </Row>
      </Panel>
      <Panel>
        <Row>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="heading">Remind me before credits reset</T>
            <T variant="caption" muted>7 days and 2 days before an unused credit expires.</T>
          </View>
          <Switch value={reminders} onValueChange={setReminders} trackColor={{ true: c.accent }} />
        </Row>
      </Panel>
      <Disclaimer />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Show me my money" onPress={done} loading={busy} />
    </Screen>
  );
}
