import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { planWeeklyDigest } from '@/domain/digest';
import { getHomeCurrency } from '@/domain/format';
import { planCreditReminders } from '@/domain/reminders';
import type { Opportunity, Recovered } from '@/domain/types';

const PREF_KEY = 'reminders_enabled';
const CHANNEL = 'credit-reminders';
// 'credit-' was the Phase 1 prefix; still cancel those so old reminders don't linger.
const PREFIXES = ['remind-', 'credit-', 'digest-'];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function remindersEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await SecureStore.getItemAsync(PREF_KEY)) !== 'false';
}

export async function setRemindersEnabled(enabled: boolean) {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(PREF_KEY, String(enabled));
  if (!enabled) await cancelCreditReminders();
}

/** Asks for permission (once). Returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Expiry reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelCreditReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => PREFIXES.some((p) => n.identifier.startsWith(p))).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Replaces scheduled reminders (expiring soon + the weekly digest) with the current plan. Local notifications. */
export async function syncReminders(opportunities: Opportunity[], recovered: Recovered[]) {
  if (Platform.OS === 'web') return;
  if (!(await remindersEnabled())) return;
  const perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) return;

  const plan = planCreditReminders(opportunities, recovered, new Date());
  await cancelCreditReminders();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { opportunityId: r.opportunityId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL },
    });
  }
  // Sunday-evening "money at risk this week" summary, rebuilt from fresh data every time the app syncs.
  const digest = planWeeklyDigest(opportunities, recovered, new Date(), getHomeCurrency());
  if (digest) {
    await Notifications.scheduleNotificationAsync({
      identifier: digest.id,
      content: { title: digest.title, body: digest.body, data: { route: '/credits' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: digest.fireAt, channelId: CHANNEL },
    });
  }
}
