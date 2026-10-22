import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button, ErrorNote, IconBubble, Screen, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

/** Supabase sends 6-10 digit codes depending on the project's "Email OTP Length" setting. */
const MIN_CODE = 6;
const MAX_CODE = 10;

/** One box per digit, backed by a hidden input so paste and email/SMS autofill still work. */
function CodeBoxes({ value, onChange, error }: { value: string; onChange: (v: string, pasted: boolean) => void; error: boolean }) {
  const c = useColors();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const boxes = Math.min(MAX_CODE, Math.max(MIN_CODE, value.length));
  return (
    <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: boxes }, (_, i) => {
        const active = i === Math.min(value.length, boxes - 1);
        return (
          <View
            key={i}
            style={{
              flex: 1,
              maxWidth: 48,
              height: 58,
              borderRadius: radius.md,
              borderWidth: active ? 2 : 1,
              borderColor: error ? c.danger : active ? c.accent : c.border,
              backgroundColor: c.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T variant="title" style={{ fontFamily: font.bold }}>{value[i] ?? ''}</T>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, MAX_CODE);
          // Several digits arriving at once means a paste or autofill: the code is complete.
          onChange(digits, digits.length - value.length > 1);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={MAX_CODE}
        accessibilityLabel="Sign-in code"
        placeholder="123456"
        placeholderTextColor="transparent"
        style={{ position: 'absolute', opacity: 0.01, width: '100%', height: '100%', color: 'transparent' }}
      />
    </Pressable>
  );
}

export default function Verify() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opened without an email (e.g. Android restoring this screen on launch): there's no code to enter.
  if (!email) return <Redirect href="/sign-in" />;

  const submit = async (value = code) => {
    if (!new RegExp(`^\\d{${MIN_CODE},${MAX_CODE}}$`).test(value)) return setError('Enter the code from the email.');
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(email, value);
      // The auth state change moves the user on to onboarding or home.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
        <IconBubble icon="mail-open" tone="green" size={64} />
        <T variant="title" center>Check your email</T>
        <T muted center>
          We sent a sign-in code to{'\n'}
          <T variant="label">{email}</T>
        </T>
      </View>
      <CodeBoxes
        value={code}
        error={!!error}
        onChange={(digits, pasted) => {
          setCode(digits);
          setError(null);
          if (pasted && digits.length >= MIN_CODE) submit(digits);
        }}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Verify" onPress={() => submit()} loading={busy} disabled={code.length < MIN_CODE} />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Button
          title={resent ? 'Code sent' : 'Send a new code'}
          kind="ghost"
          size="sm"
          disabled={resent}
          onPress={async () => {
            try {
              await sendEmailCode(email);
              setResent(true);
              toast('New code sent', { tone: 'info' });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
        <Button title="Use a different email" kind="ghost" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
      </View>
    </Screen>
  );
}
