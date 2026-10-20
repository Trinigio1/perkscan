import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { DISCLAIMER_FULL } from '@/components/Disclaimer';
import { ListRow } from '@/components/ListRow';
import { ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { remindersEnabled, requestReminderPermission, setRemindersEnabled, syncReminders } from '@/lib/notifications';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T variant="overline" muted style={{ paddingHorizontal: space.xs }}>{title}</T>
      <Panel style={{ paddingVertical: space.xs }}>{children}</Panel>
    </View>
  );
}

export default function Settings() {
  const c = useColors();
  const toast = useToast();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const [reminders, setReminders] = useState(true);
  const [showLegal, setShowLegal] = useState(false);
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
    if (Platform.OS === 'web') {
      toast('Reminders work in the phone app', { tone: 'info' });
      return;
    }
    if (v && !(await requestReminderPermission())) {
      Alert.alert('Notifications are off', 'Turn on notifications for PerkScan in your phone settings to get reminders.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setReminders(v);
    await setRemindersEnabled(v);
    if (v) await syncReminders(data.opportunities, data.recovered);
  };

  const email = session?.user.email ?? 'Signed in';
  const verified = data.benefits.filter((b) => b.status === 'active').length;

  return (
    <Screen title="Settings">
      {error ? <ErrorNote message={error} /> : null}

      <Panel>
        <Row gap={space.md}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T variant="title" color={c.accentStrong}>{email.slice(0, 1).toUpperCase()}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="caption" muted>Signed in as</T>
            <T variant="subheading" numberOfLines={1}>{email}</T>
          </View>
        </Row>
      </Panel>

      <Group title="Preferences">
        <ListRow icon="notifications" tone="orange" title="Credit reminders" subtitle="7 and 2 days before a credit resets" toggle={reminders && Platform.OS !== 'web'} onToggle={toggleReminders} />
        <ListRow icon="school" tone="purple" title="I’m a student" subtitle="Student discounts arrive later" toggle={!!data.profile?.is_student} onToggle={toggleStudent} />
      </Group>

      <Group title="About the numbers">
        <ListRow icon="shield-checkmark" tone="green" title="Verified benefits" subtitle="Unverified amounts count as $0" value={`${verified} of ${data.benefits.length}`} />
        <ListRow icon="lock-closed" tone="blue" title="Your privacy" subtitle="Only card names and last 4 digits. Never sold or shared." />
      </Group>

      <Group title="Legal">
        <ListRow icon="document-text" tone="gray" title="Disclaimer" subtitle="What PerkScan does and doesn’t do" onPress={() => setShowLegal(!showLegal)} />
        {showLegal ? (
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            {DISCLAIMER_FULL.map((p) => (
              <T key={p} variant="caption" muted>{p}</T>
            ))}
          </View>
        ) : null}
        <ListRow icon="reader" tone="gray" title="Privacy policy & terms" subtitle="Published before launch" />
      </Group>

      <Group title="Account">
        <ListRow icon="log-out" tone="gray" title="Sign out" onPress={signOut} />
        <ListRow icon="download" tone="gray" title="Export or delete my data" subtitle="Coming in a later update" />
      </Group>

      <T variant="caption" faint center>PerkScan · Phase 1 preview</T>
    </Screen>
  );
}
