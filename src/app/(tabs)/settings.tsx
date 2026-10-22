import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { DISCLAIMER_FULL } from '@/components/Disclaimer';
import { ListRow } from '@/components/ListRow';
import { ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { accuracyPercent, type Accuracy } from '@/domain/accuracy';
import { countryByCode } from '@/domain/countries';
import { updateProfile } from '@/lib/cards';
import { getAccuracy } from '@/lib/feedback';
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

  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  useFocusEffect(
    useCallback(() => {
      getAccuracy().then(setAccuracy).catch(() => setAccuracy(null));
    }, []),
  );

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
  const region = data.profile?.country
    ? countryByCode(data.profile.country) ?? { name: 'Somewhere else' }
    : null;
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
        <ListRow
          icon="globe-outline"
          tone="blue"
          title="Country & currency"
          subtitle={region ? `${region.name} · amounts in ${data.profile?.home_currency}` : 'Not set'}
          onPress={() => router.push('/country')}
        />
        <ListRow icon="notifications" tone="orange" title="Reminders" subtitle="7 and 2 days before credits and offers expire" toggle={reminders && Platform.OS !== 'web'} onToggle={toggleReminders} />
        <ListRow icon="school" tone="purple" title="I’m a student" subtitle="Shows student offers on Home" toggle={!!data.profile?.is_student} onToggle={toggleStudent} />
        {data.profile?.is_student ? <ListRow icon="gift" tone="purple" title="Student offers" subtitle="Free software and more for students" onPress={() => router.push('/student')} /> : null}
      </Group>

      <Group title="Email & texts">
        <ListRow icon="mail" tone="blue" title="Connect Gmail" subtitle="Emails you label “PerkScan” — add more Gmail accounts too" onPress={() => router.push('/connect-gmail')} />
        <ListRow icon="chatbubbles" tone="green" title="Connect texts" subtitle="Bank alerts and offers you get by text" onPress={() => router.push('/connect-texts')} />
        <ListRow icon="clipboard" tone="orange" title="Paste a text" subtitle="Add one bank alert or offer by hand" onPress={() => router.push('/add-text')} />
        <ListRow icon="file-tray-full" tone="gray" title="Inbox" subtitle="Emails and texts PerkScan has read" onPress={() => router.push('/inbox')} />
      </Group>

      <Group title="About the numbers">
        <ListRow
          icon="analytics"
          tone="purple"
          title="Reading accuracy"
          subtitle="Check what PerkScan read from your emails and texts"
          value={accuracy && accuracy.checked ? `${accuracyPercent(accuracy)}%` : 'Not checked'}
          onPress={() => router.push('/review')}
        />
        <ListRow icon="shield-checkmark" tone="green" title="Verified benefits" subtitle="Unverified amounts count as zero" value={`${verified} of ${data.benefits.length}`} />
        <ListRow icon="lock-closed" tone="blue" title="Your privacy" subtitle="Card names and last 4 digits only. Email text is deleted once read. Never sold or shared." />
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

      <T variant="caption" faint center>PerkScan · Phase 5 preview</T>
    </Screen>
  );
}
