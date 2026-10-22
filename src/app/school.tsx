import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ErrorNote, Note, Panel, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { font, radius, space, useColors } from '@/theme';

/** Pick your school, so Student mode shows the perks that come with it. */
export default function School() {
  const c = useColors();
  const toast = useToast();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const country = data.profile?.country ?? null;
  const current = data.profile?.university_id ?? null;

  const needle = q.trim().toLowerCase();
  const inCountry = data.universities.filter((u) => !country || u.country === country);
  const list = (inCountry.length ? inCountry : data.universities).filter(
    (u) => !needle || `${u.name} ${u.short_name}`.toLowerCase().includes(needle),
  );

  const choose = async (id: string | null, label: string) => {
    if (!session) return;
    try {
      await updateProfile(session.user.id, { university_id: id });
      await refresh();
      toast(id ? `${label} saved` : 'School cleared', { tone: 'info' });
      if (router.canGoBack()) router.back();
      else router.replace('/student');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen edges={[]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.lg }}>
        <Ionicons name="search" size={18} color={c.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search schools"
          placeholderTextColor={c.textFaint}
          accessibilityLabel="Search schools"
          style={{ flex: 1, paddingVertical: 13, fontSize: 16, fontFamily: font.medium, color: c.text }}
        />
      </View>
      {error ? <ErrorNote message={error} /> : null}
      <Panel style={{ paddingVertical: space.xs, gap: 0 }}>
        {list.map((u, i) => (
          <View key={u.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
            <SchoolOption title={u.short_name} subtitle={u.name} selected={current === u.id} onPress={() => choose(u.id, u.short_name)} />
          </View>
        ))}
        <View style={{ borderTopWidth: list.length ? 1 : 0, borderTopColor: c.border }}>
          <SchoolOption title="My school isn’t listed" subtitle="You’ll still see offers for students everywhere" selected={current === null} onPress={() => choose(null, '')} />
        </View>
      </Panel>
      <Note icon="information-circle-outline">
        {country === 'TT' || !country
          ? 'Schools come from the Accreditation Council of Trinidad and Tobago’s list of accredited institutions.'
          : `PerkScan doesn’t list schools in ${countryByCode(country)?.name ?? 'your country'} yet.`}
        {' '}Know a perk your school gives students? Send it with a link to the official page and we’ll add it.
      </Note>
    </Screen>
  );
}

function SchoolOption({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1 }}>
        <T variant="subheading">{title}</T>
        {subtitle ? <T variant="caption" muted>{subtitle}</T> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={c.accent} /> : null}
    </Pressable>
  );
}
