import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { Button, ErrorNote, Field, Screen, T } from '@/components/ui';
import { sendEmailCode, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { APPLE_SIGN_IN_ENABLED } from '@/lib/env';
import { space } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const scheme = useColorScheme();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'email' | 'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'email' | 'google' | 'apple', fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'ERR_REQUEST_CANCELED') setError(err.message ?? 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const onEmail = () =>
    run('email', async () => {
      const value = email.trim().toLowerCase();
      if (!EMAIL_RE.test(value)) throw new Error('Enter a valid email address.');
      await sendEmailCode(value);
      router.push({ pathname: '/verify', params: { email: value } });
    });

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.xxl }}>
        <T variant="display">PerkScan</T>
        <T variant="heading" muted>Find the money your cards already owe you.</T>
      </View>

      <View style={{ gap: space.md, marginTop: space.xl }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={onEmail}
        />
        <Button title="Email me a sign-in code" onPress={onEmail} loading={busy === 'email'} disabled={!!busy} />
      </View>

      <T variant="caption" faint style={{ textAlign: 'center' }}>or</T>

      <View style={{ gap: space.md }}>
        <Button title="Continue with Google" kind="secondary" icon="logo-google" onPress={() => run('google', signInWithGoogle)} loading={busy === 'google'} disabled={!!busy} />
        {APPLE_SIGN_IN_ENABLED && Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={{ height: 50 }}
            onPress={() => run('apple', signInWithApple)}
          />
        ) : null}
      </View>

      {error ? <ErrorNote message={error} /> : null}

      <T variant="caption" faint style={{ textAlign: 'center', marginTop: space.lg }}>
        We only store what we need: card names and last four digits — never full card numbers.
      </T>
    </Screen>
  );
}
