import { useState } from 'react';
import { View } from 'react-native';
import { Disclaimer } from '@/components/Disclaimer';
import { ListRow } from '@/components/ListRow';
import { Steps } from '@/components/Steps';
import { Button, ErrorNote, Panel, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { deviceTimeZone, updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { requestReminderPermission } from '@/lib/notifications';
import { space } from '@/theme';

export default function Finish() {
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
      <Steps step={3} total={3} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Last thing</T>
        <T muted>Two quick preferences. You can change them anytime in Settings.</T>
      </View>
      <Panel>
        <ListRow
          icon="notifications"
          tone="orange"
          title="Remind me before credits reset"
          subtitle="A week before, and two days before"
          toggle={reminders}
          onToggle={setReminders}
        />
        <ListRow
          icon="school"
          tone="purple"
          title="I’m a student"
          subtitle="Student discounts arrive in a later update"
          toggle={student}
          onToggle={setStudent}
        />
      </Panel>
      <Disclaimer />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Show me my money" icon="sparkles" onPress={done} loading={busy} />
    </Screen>
  );
}
