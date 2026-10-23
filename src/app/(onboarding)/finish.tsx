import { useState } from 'react';
import { View } from 'react-native';
import { Disclaimer } from '@/components/Disclaimer';
import { InterestPicker } from '@/components/InterestPicker';
import { ListRow } from '@/components/ListRow';
import { Steps } from '@/components/Steps';
import { Button, ErrorNote, Panel, Screen, T } from '@/components/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { deviceTimeZone, updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { requestReminderPermission } from '@/lib/notifications';
import { space } from '@/theme';

export default function Finish() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  const [student, setStudent] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
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
        interests,
        timezone: deviceTimeZone(),
        onboarded_at: new Date().toISOString(),
      });
      track('onboarding_completed', { cards: data.userCards.length, student });
      // The navigator moves to Home once the reloaded profile shows onboarded_at.
      const r = await refresh();
      if (!r.data?.profile?.onboarded_at) {
        setError(r.error ?? 'Your settings didn’t save. Check your connection and try again.');
        setBusy(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Steps step={4} total={4} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Last thing</T>
        <T muted>You can change these in Settings.</T>
      </View>
      <Panel>
        <ListRow
          icon="notifications"
          tone="orange"
          title="Remind me before things expire"
          toggle={reminders}
          onToggle={setReminders}
        />
        <ListRow
          icon="school"
          tone="purple"
          title="I’m a student"
          toggle={student}
          onToggle={setStudent}
        />
      </Panel>
      <View style={{ gap: space.sm }}>
        <T variant="subheading">What do you spend on?</T>
        <T variant="caption" muted>Optional. Deals for these come first.</T>
        <InterestPicker value={interests} onChange={setInterests} />
      </View>
      <Disclaimer />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Show me my money" icon="sparkles" onPress={done} loading={busy} />
    </Screen>
  );
}
