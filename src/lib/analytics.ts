import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { sanitizeEvent, type EventName } from '@/domain/analyticsEvents';

// Anonymous product analytics via PostHog's capture API. Off unless EXPO_PUBLIC_POSTHOG_KEY is set,
// and users can opt out in Settings. Events and properties are limited to src/domain/analyticsEvents.ts.

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '').trim();
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').trim().replace(/\/+$/, '');
const ID_KEY = 'analytics_anonymous_id';
const OPT_OUT_KEY = 'analytics_opt_out';

export const analyticsConfigured = KEY.length > 0;

/** A random id for this install only — never the account id or email. */
async function anonymousId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(ID_KEY);
    if (existing) return existing;
    const id = Crypto.randomUUID();
    await AsyncStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return Crypto.randomUUID();
  }
}

export async function analyticsOptedOut(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OPT_OUT_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setAnalyticsOptOut(optOut: boolean) {
  await AsyncStorage.setItem(OPT_OUT_KEY, String(optOut));
  // Forget the install id too, so opting back in starts fresh.
  if (optOut) await AsyncStorage.removeItem(ID_KEY);
}

/** Fire-and-forget. Never throws and never blocks the UI. */
export function track(name: EventName, props: Record<string, unknown> = {}) {
  if (!analyticsConfigured) return;
  void (async () => {
    try {
      if (await analyticsOptedOut()) return;
      const clean = sanitizeEvent(name, props);
      if (!clean) return;
      await fetch(`${HOST}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: KEY,
          event: clean.event,
          distinct_id: await anonymousId(),
          // Anonymous events: no person profile is created.
          properties: { ...clean.properties, platform: Platform.OS, $process_person_profile: false },
        }),
      });
    } catch {
      // Analytics must never break the app.
    }
  })();
}
