import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorNote, Field, Screen, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(email, value);
      // Auth state change moves the user on to onboarding or home.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T variant="title">Check your email</T>
      <T muted>We sent a 6-digit code to {email}. You can also tap the link in that email on this phone.</T>
      <Field
        label="Code"
        value={code}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, 6);
          setCode(digits);
          if (digits.length === 6) submit(digits);
        }}
        placeholder="123456"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Verify" onPress={() => submit()} loading={busy} />
      <Button
        title={resent ? 'Code sent again' : 'Send a new code'}
        kind="ghost"
        disabled={resent}
        onPress={async () => {
          try {
            await sendEmailCode(email);
            setResent(true);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <Button title="Use a different email" kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
