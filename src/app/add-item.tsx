import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Chip, ErrorNote, Field, Row, Screen, T } from '@/components/ui';
import { getHomeCurrency } from '@/domain/format';
import { ADD_TYPES, itemTitle, parseAmount, parseDay, type AddType, type Program } from '@/domain/programs';
import { useData } from '@/lib/data';
import { addItem, listPrograms } from '@/lib/programs';
import { useToast } from '@/lib/toast';
import { space } from '@/theme';

const NAME_HINT: Record<AddType, string> = {
  points: 'e.g. Massy Card points',
  gift_card: 'e.g. Amazon gift card',
  store_credit: 'e.g. Courts store credit',
  benefit: 'e.g. FSA balance, phone allowance',
  refund: 'e.g. Refund for cancelled flight',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Add a points balance, gift card, store credit, benefit or refund by hand. */
export default function AddItem() {
  const toast = useToast();
  const { data, refresh } = useData();
  const params = useLocalSearchParams<{ type?: string; program?: string }>();
  const type: AddType = ADD_TYPES.some((a) => a.type === params.type) ? (params.type as AddType) : 'gift_card';
  const home = data.profile?.home_currency?.trim() || getHomeCurrency();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<string | null>(params.program ?? null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(home);
  const [store, setStore] = useState('');
  const [expires, setExpires] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loyalty programs to pick from (points), or the use-it-or-lose-it rules (benefits).
  useEffect(() => {
    if (type !== 'points' && type !== 'benefit') return;
    listPrograms()
      .then((all) => setPrograms(all.filter((p) => p.kind === (type === 'points' ? 'loyalty' : 'deadline_rule'))))
      .catch(() => setPrograms([]));
  }, [type]);
  const program = programs.find((p) => p.id === programId) ?? null;

  const save = async () => {
    const n = parseAmount(amount);
    if (Number.isNaN(n)) return setError(type === 'points' ? 'Enter a number of points, like 12000' : 'Enter an amount like 25 or 12.50');
    const day = expires.trim() ? parseDay(expires) : null;
    if (expires.trim() && !day) return setError('Enter the date as YYYY-MM-DD, e.g. 2026-12-31');
    const title = itemTitle(type, name, type === 'points' ? n : null, program);
    if (!title) return setError('Give it a name');
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return setError('Use a 3-letter currency code, like TTD or USD');
    setBusy(true);
    setError(null);
    try {
      await addItem({
        type,
        title,
        merchant: store.trim() || program?.provider || null,
        amount: type === 'points' ? null : n,
        currency: currency.trim().toUpperCase(),
        expiresOn: day,
        programId: program?.id ?? null,
        note: note.trim() || null,
      });
      await refresh();
      toast('Added — PerkScan will remind you before it expires', { tone: 'success' });
      if (router.canGoBack()) router.back();
      else router.replace('/money');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const today = new Date();
  const quickDates: [string, string][] = [
    ['In 30 days', iso(new Date(today.getTime() + 30 * 86_400_000))],
    ['End of year', `${today.getFullYear()}-12-31`],
  ];

  return (
    <Screen edges={[]}>
      <T variant="title">{ADD_TYPES.find((a) => a.type === type)!.title}</T>

      {programs.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="label">{type === 'points' ? 'Program' : 'Kind'}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            {programs.map((p) => (
              <Chip key={p.id} label={p.name} selected={programId === p.id} onPress={() => setProgramId(programId === p.id ? null : p.id)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <Field label={program ? 'Name (optional)' : 'Name'} value={name} onChangeText={setName} placeholder={program?.name ?? NAME_HINT[type]} />
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 2 }}>
          <Field
            label={type === 'points' ? 'Points or miles' : 'Amount'}
            value={amount}
            onChangeText={setAmount}
            placeholder={type === 'points' ? '12000' : '0.00'}
            keyboardType="decimal-pad"
          />
        </View>
        {type === 'points' ? null : (
          <View style={{ flex: 1 }}>
            <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} />
          </View>
        )}
      </Row>
      {type === 'points' ? null : <Field label="Store or company (optional)" value={store} onChangeText={setStore} placeholder="Where you use it" />}
      <View style={{ gap: space.sm }}>
        <Field label="Expires or due by (optional)" value={expires} onChangeText={setExpires} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Row gap={space.sm}>
          {quickDates.map(([label, d]) => (
            <Chip key={label} label={label} selected={expires === d} onPress={() => setExpires(d)} />
          ))}
        </Row>
      </View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything to remember" />

      {program ? <T variant="caption" muted>{program.summary}</T> : null}
      {error ? <ErrorNote message={error} /> : null}
      <Button title="Add" icon="add" onPress={save} loading={busy} />
    </Screen>
  );
}
