import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, ErrorNote, Loading, Screen, T } from '@/components/ui';
import { completeAuthFromUrl } from '@/lib/auth';

/** Landing route for magic links: perkscan://auth/callback?code=… */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    completeAuthFromUrl(url)
      .then(() => router.replace('/'))
      .catch((e: Error) => setError(e.message));
  }, [url]);

  if (!error) return <Loading />;
  return (
    <Screen>
      <T variant="title">That link didn’t work</T>
      <ErrorNote message={error} />
      <T muted>Links expire after a while and only work on the device that requested them. Use the 6-digit code instead.</T>
      <Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
