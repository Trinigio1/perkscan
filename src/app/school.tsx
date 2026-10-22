import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ErrorNote, Loading, Note, Panel, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import type { University } from '@/domain/types';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { schoolListLoaded, searchSchools } from '@/lib/schools';
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

  const [list, setList] = useState<University[] | null>(null);
  const [loaded, setLoaded] = useState<boolean | null>(null);

  // An empty result can mean the list was never loaded into this database: say so instead of showing nothing.
  useEffect(() => {
    schoolListLoaded()
      .then(setLoaded)
      .catch((e: Error) => setError(`Couldn’t load schools: ${e.message}`));
  }, []);
  // Big lists (the US has thousands of schools) wait for a search; small ones show straight away.
  const needsSearch = country === 'US' && q.trim().length < 2;

  useEffect(() => {
    if (needsSearch) return;
    let live = true;
    const t = setTimeout(() => {
      searchSchools(country, q)
        .then((rows) => {
          if (!live) return;
          setList(rows);
          setError(null);
        })
        .catch((e: Error) => live && setError(`Couldn’t search schools: ${e.message}`));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [country, q, needsSearch]);

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
          placeholder={country === 'US' ? 'Search by name or website, e.g. ufl' : 'Search schools'}
          placeholderTextColor={c.textFaint}
          accessibilityLabel="Search schools"
          style={{ flex: 1, paddingVertical: 13, fontSize: 16, fontFamily: font.medium, color: c.text }}
        />
      </View>
      {error ? <ErrorNote message={error} /> : null}
      {loaded === false ? (
        <ErrorNote message="PerkScan’s school list isn’t in your database yet. On your computer, in the PerkScan folder, run: npx supabase db push — then reopen this screen." />
      ) : null}
      {list === null && !needsSearch && loaded !== false && !error ? <Loading /> : null}
      {needsSearch && loaded !== false ? <T variant="caption" muted>Type at least 2 letters of your school’s name or website.</T> : null}
      {loaded && !needsSearch && list?.length === 0 && q.trim() ? (
        <T variant="caption" muted>No schools match “{q.trim()}”. Try part of the name, or the website (for example “ufl” for the University of Florida).</T>
      ) : null}
      <Panel style={{ paddingVertical: space.xs, gap: 0 }}>
        {(needsSearch ? [] : (list ?? [])).map((u, i) => (
          <View key={u.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
            <SchoolOption
              title={u.short_name}
              subtitle={u.short_name === u.name ? [u.email_domains[0], u.state].filter(Boolean).join(' · ') || undefined : u.name}
              selected={current === u.id}
              onPress={() => choose(u.id, u.short_name)}
            />
          </View>
        ))}
        <View style={{ borderTopWidth: !needsSearch && list?.length ? 1 : 0, borderTopColor: c.border }}>
          <SchoolOption title="My school isn’t listed" subtitle="You’ll still see offers for students everywhere" selected={current === null} onPress={() => choose(null, '')} />
        </View>
      </Panel>
      <Note icon="information-circle-outline">
        {country === 'TT'
          ? 'Schools come from the Accreditation Council of Trinidad and Tobago’s list of accredited institutions.'
          : country === 'US'
            ? 'US schools come from a public list of colleges and their email domains.'
            : `PerkScan lists schools in Trinidad & Tobago and the US so far${country ? `, not yet ${countryByCode(country)?.name ?? 'your country'}` : ''}.`}
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
