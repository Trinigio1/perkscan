import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { planWeeklyDigest } from '@/domain/digest';
import type { LocalEvent } from '@/domain/events';
import type { Moment } from '@/domain/moments';
import { getHomeCurrency } from '@/domain/format';
import { MAX_REMINDERS, planCreditReminders } from '@/domain/reminders';
import type { Opportunity, Recovered } from '@/domain/types';

const PREF_KEY = 'reminders_enabled';
const CHANNEL = 'credit-reminders';
// 'credit-' was the Phase 1 prefix; still cancel those so old reminders don't linger.
const PREFIXES = ['remind-', 'credit-', 'digest-', 'renew-', 'event-', 'birthday-'];

/**
 * Expo Go on Android ships without parts of expo-notifications, and importing it there crashes the app.
 * So it's loaded only where it works: PerkScan's own builds, and Expo Go on iPhone.
 */
export const remindersAvailable =
  Platform.OS !== 'web' && !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

let loaded: typeof NotificationsModule | null = null;
function notificationsModule(): typeof NotificationsModule {
  if (!loaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as typeof NotificationsModule;
    loaded.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  return loaded;
}

export async function remindersEnabled(): Promise<boolean> {
  if (!remindersAvailable) return false;
  return (await SecureStore.getItemAsync(PREF_KEY)) !== 'false';
}

export async function setRemindersEnabled(enabled: boolean) {
  if (!remindersAvailable) return;
  await SecureStore.setItemAsync(PREF_KEY, String(enabled));
  if (!enabled) await cancelCreditReminders();
}

/** Asks for permission (once). Returns whether reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersAvailable || !Device.isDevice) return false;
  const Notifications = notificationsModule();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Expiry reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function cancelCreditReminders() {
  const Notifications = notificationsModule();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => PREFIXES.some((p) => n.identifier.startsWith(p))).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Replaces scheduled reminders (expiring soon + the weekly digest) with the current plan. Local notifications. */
export async function syncReminders(opportunities: Opportunity[], recovered: Recovered[], events: LocalEvent[] = [], moments: Moment[] = []) {
  if (!(await remindersEnabled())) return;
  const Notifications = notificationsModule();
  const perms = await Notifications.getPermissionsAsync();
  if (!perms.granted) return;

  // Expiry reminders and right-moment nudges share the device's limit; the soonest go first.
  const plan: (Moment | (ReturnType<typeof planCreditReminders>[number] & { route?: undefined }))[] = [...planCreditReminders(opportunities, recovered, new Date()), ...moments]
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, MAX_REMINDERS);
  await cancelCreditReminders();
  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: r.route ? { route: r.route } : { opportunityId: r.opportunityId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.fireAt, channelId: CHANNEL },
    });
  }
  // Sunday-evening "money at risk this week" summary, rebuilt from fresh data every time the app syncs.
  const digest = planWeeklyDigest(opportunities, recovered, new Date(), getHomeCurrency(), events);
  if (digest) {
    await Notifications.scheduleNotificationAsync({
      identifier: digest.id,
      content: { title: digest.title, body: digest.body, data: { route: '/at-risk' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: digest.fireAt, channelId: CHANNEL },
    });
  }
}

/** Opens the screen a tapped reminder points to (the weekly digest opens "At risk this week"). Returns an unsubscribe. */
export function onReminderTap(open: (route: string) => void): () => void {
  if (!remindersAvailable) return () => {};
  const sub = notificationsModule().addNotificationResponseReceivedListener((r) => {
    const route = r.notification.request.content.data?.route;
    if (typeof route === 'string' && route.startsWith('/')) open(route);
  });
  return () => sub.remove();
}
