import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COUNTRIES, CURRENCIES, OTHER_COUNTRY, countryByCode, guessCountry } from '@/domain/countries';
import { currencyPrefix } from '@/domain/format';
import { deviceTimeZone } from '@/lib/cards';
import { radius, space, useColors } from '@/theme';
import { Button, Chip, ErrorNote, Panel, Row, T } from './ui';

export interface Region {
  country: string;
  home_currency: string;
}

/** Country list plus, for "somewhere else", a currency choice. Calls onSave with the pick. */
export function CountryPicker({
  initial,
  onSave,
  saveTitle = 'Continue',
}: {
  initial?: { country: string | null; home_currency: string | null } | null;
  onSave: (r: Region) => Promise<void>;
  saveTitle?: string;
}) {
  const c = useColors();
  const start = initial?.country ?? guessCountry(deviceTimeZone());
  const [country, setCountry] = useState<string | null>(start);
  // home_currency defaults to USD in the database, so only trust it once a country has been chosen.
  const [currency, setCurrency] = useState(
    (initial?.country ? initial.home_currency?.trim() : null) || countryByCode(start)?.currency || 'USD',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (code: string) => {
    setCountry(code);
    const known = countryByCode(code);
    if (known) setCurrency(known.currency);
  };

  const save = async () => {
    if (!country) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ country, home_currency: currency });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const options = [...COUNTRIES.map((x) => ({ code: x.code, label: x.name, flag: x.flag })), { code: OTHER_COUNTRY, label: 'Somewhere else', flag: '🌎' }];

  return (
    <View style={{ gap: space.md }}>
      <Panel padded={false} style={{ gap: 0, overflow: 'hidden' }}>
        {options.map((o, i) => {
          const selected = country === o.code;
          return (
            <Pressable
              key={o.code}
              onPress={() => pick(o.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: c.border,
                backgroundColor: selected ? c.accentSoft : pressed ? c.surfaceAlt : 'transparent',
              })}
            >
              <Text style={{ fontSize: 22 }}>{o.flag}</Text>
              <T variant="subheading" style={{ flex: 1 }}>{o.label}</T>
              {countryByCode(o.code) ? <T variant="caption" muted>{countryByCode(o.code)!.currency}</T> : null}
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: radius.pill,
                  borderWidth: 2,
                  borderColor: selected ? c.accent : c.border,
                  backgroundColor: selected ? c.accent : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected ? <Ionicons name="checkmark" size={13} color={c.accentText} /> : null}
              </View>
            </Pressable>
          );
        })}
      </Panel>

      {country === OTHER_COUNTRY ? (
        <View style={{ gap: space.sm }}>
          <T variant="subheading">Which currency do you mostly spend in?</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {CURRENCIES.map((cur) => (
              <Chip key={cur} label={`${cur} ${currencyPrefix(cur, '')}`.trim()} selected={currency === cur} onPress={() => setCurrency(cur)} />
            ))}
          </Row>
        </View>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}
      <Button title={country ? saveTitle : 'Pick your country'} icon={country ? 'arrow-forward' : undefined} disabled={!country} loading={busy} onPress={save} />
    </View>
  );
}
