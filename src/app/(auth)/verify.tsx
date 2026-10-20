import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button, ErrorNote, IconBubble, Screen, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

/** Six boxes backed by one hidden input, so paste and SMS/email autofill still work. */
function CodeBoxes({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: boolean }) {
  const c = useColors();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: space.sm, justifyContent: 'center' }}>
      {Array.from({ length: 6 }, (_, i) => {
        const active = i === Math.min(value.length, 5);
        return (
          <View
            key={i}
            style={{
              width: 48,
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
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        accessibilityLabel="6-digit code"
        placeholder="123456"
        style={{ position: 'absolute', opacity: 0.01, width: '100%', height: '100%' }}
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

  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter the 6-digit code from the email.');
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
          We sent a 6-digit code to{'\n'}
          <T variant="label">{email}</T>
        </T>
      </View>
      <CodeBoxes
        value={code}
        error={!!error}
        onChange={(digits) => {
          setCode(digits);
          setError(null);
          if (digits.length === 6) submit(digits);
        }}
      />
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Verify" onPress={() => submit()} loading={busy} disabled={code.length < 6} />
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
        <Button title="Use a different email" kind="ghost" size="sm" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
