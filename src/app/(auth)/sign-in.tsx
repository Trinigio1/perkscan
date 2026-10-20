import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, useColorScheme, View } from 'react-native';
import { Hero, LogoMark } from '@/components/Hero';
import { Button, ErrorNote, Field, Row, Screen, T } from '@/components/ui';
import { sendEmailCode, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { APPLE_SIGN_IN_ENABLED } from '@/lib/env';
import { space, useColors } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const POINTS: { icon: 'card' | 'notifications' | 'trending-up'; text: string }[] = [
  { icon: 'card', text: 'Tracks every credit on your cards' },
  { icon: 'notifications', text: 'Reminds you before they reset' },
  { icon: 'trending-up', text: 'Shows what you’ve recovered' },
];

export default function SignIn() {
  const c = useColors();
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Hero style={{ marginTop: space.sm, paddingVertical: space.xxl }}>
          <LogoMark />
          <T variant="display" color={c.heroText} style={{ marginTop: space.lg }}>
            Stop leaving money on the table.
          </T>
          <T color={c.heroMuted} style={{ marginTop: space.xs }}>
            PerkScan finds the credits and perks your cards already owe you.
          </T>
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            {POINTS.map((p) => (
              <Row key={p.text}>
                <Ionicons name={p.icon} size={16} color={c.heroFill} />
                <T variant="label" color={c.heroText}>{p.text}</T>
              </Row>
            ))}
          </View>
        </Hero>

        <View style={{ gap: space.md }}>
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
          <Button title="Email me a sign-in code" icon="mail" onPress={onEmail} loading={busy === 'email'} disabled={!!busy} />
        </View>

        <Row gap={space.md}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <T variant="caption" faint>or</T>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </Row>

        <View style={{ gap: space.md }}>
          <Button title="Continue with Google" kind="secondary" icon="logo-google" onPress={() => run('google', signInWithGoogle)} loading={busy === 'google'} disabled={!!busy} />
          {APPLE_SIGN_IN_ENABLED && Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={999}
              style={{ height: 52 }}
              onPress={() => run('apple', signInWithApple)}
            />
          ) : null}
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <Row style={{ justifyContent: 'center' }} gap={6}>
          <Ionicons name="lock-closed" size={13} color={c.textFaint} />
          <T variant="caption" faint>We never store full card numbers — only the last 4 digits.</T>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}
