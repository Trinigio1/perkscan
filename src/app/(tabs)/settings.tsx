import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { DISCLAIMER_FULL } from '@/components/Disclaimer';
import { ListRow } from '@/components/ListRow';
import { Chip, ErrorNote, Panel, Row, Screen, T } from '@/components/ui';
import { signOut, useAuth } from '@/lib/auth';
import { accuracyPercent, type Accuracy } from '@/domain/accuracy';
import { countryByCode } from '@/domain/countries';
import { interestLabel } from '@/domain/deals';
import { analyticsConfigured, analyticsOptedOut, setAnalyticsOptOut } from '@/lib/analytics';
import { updateProfile } from '@/lib/cards';
import { getAccuracy } from '@/lib/feedback';
import { myEvents, useData } from '@/lib/data';
import { remindersAvailable, remindersEnabled, requestReminderPermission, setRemindersEnabled, syncReminders } from '@/lib/notifications';
import { useToast } from '@/lib/toast';
import { space, useAppearance, type AppearancePref } from '@/theme';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T variant="overline" muted style={{ paddingHorizontal: space.xs }}>{title}</T>
      <Panel style={{ paddingVertical: space.xs }}>{children}</Panel>
    </View>
  );
}

export default function Settings() {
  const toast = useToast();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const { pref: appearance, setPref: setAppearance } = useAppearance();
  const [reminders, setReminders] = useState(true);
  const [showLegal, setShowLegal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accuracy, setAccuracy] = useState<Accuracy | null>(null);
  const [analyticsOff, setAnalyticsOff] = useState(false);
  useEffect(() => {
    analyticsOptedOut().then(setAnalyticsOff);
  }, []);
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

  const toggleShare = async (v: boolean) => {
    if (!session) return;
    try {
      await updateProfile(session.user.id, { share_deals: v });
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
    if (!remindersAvailable) {
      toast('Expo Go on Android can’t show reminders. They work in PerkScan’s own build.', { tone: 'info' });
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
    if (v) await syncReminders(data.opportunities, data.recovered, myEvents(data));
  };

  const email = session?.user.email ?? 'Signed in';
  const region = data.profile?.country
    ? countryByCode(data.profile.country) ?? { name: 'Somewhere else' }
    : null;

  return (
    <Screen title="Settings">
      {error ? <ErrorNote message={error} /> : null}

      <Group title="Find money">
        <ListRow icon="mail" tone="blue" title="Gmail" subtitle="Read emails you label “PerkScan”" onPress={() => router.push('/connect-gmail')} />
        <ListRow icon="chatbubbles" tone="green" title="Texts" subtitle="Bank alerts and offers by SMS" onPress={() => router.push('/connect-texts')} />
        <ListRow icon="clipboard" tone="orange" title="Add a text" onPress={() => router.push('/add-text')} />
        <ListRow icon="file-tray-full" tone="gray" title="What PerkScan read" onPress={() => router.push('/inbox')} />
        <ListRow
          icon="analytics"
          tone="purple"
          title="Reading accuracy"
          value={accuracy && accuracy.checked ? `${accuracyPercent(accuracy)}%` : undefined}
          onPress={() => router.push('/review')}
        />
      </Group>

      <Group title="You">
        <ListRow icon="card" tone="green" title="Your cards" value={data.userCards.length ? String(data.userCards.length) : 'None yet'} onPress={() => router.push('/cards')} />
        <ListRow icon="ribbon" tone="purple" title="Memberships" subtitle="Prime, Costco, Walmart+, your phone plan…" onPress={() => router.push('/memberships')} />
        <ListRow icon="globe-outline" tone="blue" title="Country" value={region ? `${region.name} · ${data.profile?.home_currency}` : 'Not set'} onPress={() => router.push('/country')} />
        <ListRow
          icon="pricetags"
          tone="pink"
          title="Interests"
          value={data.profile?.interests?.length ? data.profile.interests.map(interestLabel).slice(0, 2).join(', ') + (data.profile.interests.length > 2 ? '…' : '') : 'Not set'}
          onPress={() => router.push('/interests')}
        />
        <ListRow
          icon="contrast"
          tone="gray"
          title="Theme"
          right={
            <Row gap={6}>
              {(['dark', 'light', 'system'] as AppearancePref[]).map((p) => (
                <Chip key={p} label={p === 'system' ? 'Auto' : p === 'dark' ? 'Dark' : 'Light'} selected={appearance === p} onPress={() => setAppearance(p)} />
              ))}
            </Row>
          }
        />
        <ListRow icon="notifications" tone="orange" title="Reminders" toggle={reminders && Platform.OS !== 'web'} onToggle={toggleReminders} />
        <ListRow icon="school" tone="purple" title="I’m a student" toggle={!!data.profile?.is_student} onToggle={toggleStudent} />
        {data.profile?.is_student ? (
          <ListRow icon="gift" tone="purple" title="Student perks" value={data.school?.short_name} onPress={() => router.push('/student')} />
        ) : null}
      </Group>

      <Group title="Privacy & data">
        <ListRow icon="key" tone="gray" title="Connected accounts" onPress={() => router.push('/sources')} />
        <ListRow
          icon="people"
          tone="gray"
          title="Help people nearby find deals"
          subtitle="Public promotions many people get are shown to others, and which stores go together is counted. Never your emails, amounts or who you are."
          toggle={!!data.profile?.share_deals}
          onToggle={toggleShare}
        />
        <ListRow icon="download" tone="gray" title="Export or delete my data" onPress={() => router.push('/data')} />
        {analyticsConfigured ? (
          <ListRow
            icon="stats-chart"
            tone="gray"
            title="Anonymous usage stats"
            toggle={!analyticsOff}
            onToggle={async (v) => {
              await setAnalyticsOptOut(!v);
              setAnalyticsOff(!v);
            }}
          />
        ) : null}
        <ListRow icon="reader" tone="gray" title="Privacy policy" onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} />
        <ListRow icon="document-text-outline" tone="gray" title="Terms of use" onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} />
        <ListRow icon="information-circle-outline" tone="gray" title="What PerkScan does" onPress={() => setShowLegal(!showLegal)} />
        {showLegal ? (
          <View style={{ gap: space.sm, paddingBottom: space.sm }}>
            {DISCLAIMER_FULL.map((p) => (
              <T key={p} variant="caption" muted>{p}</T>
            ))}
          </View>
        ) : null}
      </Group>

      <Group title={email}>
        <ListRow icon="log-out" tone="gray" title="Sign out" onPress={() => signOut()} />
      </Group>
    </Screen>
  );
}
