import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Hero } from '@/components/Hero';
import { ListRow } from '@/components/ListRow';
import { Badge, Button, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { groupStudentOffers, personalHow } from '@/domain/student';
import type { StudentOffer, UserPerk } from '@/domain/types';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { setStudentOfferClaimed } from '@/lib/student';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

const CATEGORY_ICON = { software: 'apps', design: 'color-palette', productivity: 'document-text', developer: 'code-slash', music: 'musical-notes', shopping: 'bag-handle', travel: 'airplane', other: 'school' } as const;

const checked = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Student mode: curated student offers, and which ones you've claimed. */
export default function Student() {
  const c = useColors();
  const { session } = useAuth();
  const { data, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStudent = !!data.profile?.is_student;
  const country = data.profile?.country ?? null;

  const school = data.school;
  const schoolEmail = school?.email_domains[0] ?? null;
  const groups = groupStudentOffers(data.studentOffers, { country, universityId: school?.id ?? null });
  const here = [...groups.school, ...groups.everywhere];
  const claimedCount = here.filter((o) => data.studentClaims.includes(o.id)).length;
  const myPerks = data.myPerks.filter((p) => !school || !p.university_id || p.university_id === school.id);
  const card = (o: StudentOffer, unavailable = false, personalize = true) => (
    <OfferCard
      key={o.id}
      offer={o}
      claimed={data.studentClaims.includes(o.id)}
      busy={busy === o.id}
      onToggle={() => toggleClaim(o)}
      unavailable={unavailable}
      personal={unavailable || !personalize ? null : personalHow(o, school)}
    />
  );

  const toggleStudent = async (v: boolean) => {
    if (!session) return;
    try {
      await updateProfile(session.user.id, { is_student: v });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleClaim = async (o: StudentOffer) => {
    const claimed = data.studentClaims.includes(o.id);
    setBusy(o.id);
    setError(null);
    try {
      await setStudentOfferClaimed(o.id, !claimed);
      await refresh();
      toast(claimed ? 'Marked as not claimed' : `Nice — ${o.name} claimed`, { tone: claimed ? 'info' : 'success' });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: 0, paddingVertical: space.xs }}>
        <ListRow icon="school" tone="purple" title="I’m a student" subtitle="Shows student offers on your home screen" toggle={isStudent} onToggle={toggleStudent} />
        <ListRow
          icon="business"
          tone="blue"
          title="Your school"
          subtitle={school ? (schoolEmail ? `Most offers verify with your @${schoolEmail} email` : 'Perks that come with your school are shown first') : 'Pick it to see perks that come with your school'}
          value={school ? school.short_name : 'Choose'}
          onPress={() => router.push('/school')}
        />
      </Panel>

      {school ? (
        <Hero>
          <T variant="label" color={c.heroMuted}>Your perks at</T>
          <T variant="title" color={c.heroText}>{school.short_name}</T>
          <T color={c.heroText}>
            {groups.school.length + myPerks.length} only for {school.short_name} students · {groups.everywhere.length} for all students
          </T>
          {here.length ? (
            <T variant="caption" color={c.heroMuted}>
              {claimedCount} of {here.length} claimed{schoolEmail ? ` · most sign-ups use your @${schoolEmail} email` : ''}
            </T>
          ) : null}
        </Hero>
      ) : (
        <Panel onPress={() => router.push('/school')}>
          <Row gap={space.md}>
            <IconBubble icon="business" tone="blue" />
            <View style={{ flex: 1 }}>
              <T variant="subheading">Pick your school to see your perks</T>
              <T variant="caption" muted>Perks only for your school, plus how to get the general ones with your school email.</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
          </Row>
        </Panel>
      )}

      {!data.studentOffers.length ? (
        <T muted>No student offers loaded. On your computer, in the PerkScan folder, run: npx supabase db push — then pull down to refresh.</T>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {school ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Only for {school.short_name} students</T>
          {/* School-only perks already say how to get them at this school. */}
          {groups.school.map((o) => card(o, false, false))}
          {myPerks.map((p) => (
            <MyPerkCard key={p.id} perk={p} />
          ))}
          {!groups.school.length && !myPerks.length ? (
            <T variant="caption" muted>
              PerkScan doesn’t list perks only for {school.short_name} yet — we only add them from the school’s own pages. Know one? Add it below.
            </T>
          ) : null}
          <Button
            title={`Add a perk from ${school.short_name}`}
            icon="add"
            kind="secondary"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => router.push('/my-perk')}
          />
        </View>
      ) : null}

      {groups.everywhere.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>
            {school
              ? `For all students${schoolEmail ? ` — with your @${schoolEmail} email` : ''}`
              : country
                ? `For students in ${countryByCode(country)?.name ?? 'your country'}`
                : 'For students everywhere'}
          </T>
          {groups.everywhere.map((o) => card(o))}
        </View>
      ) : null}

      {groups.elsewhere.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Not available in {countryByCode(country)?.name ?? 'your country'}</T>
          <T variant="caption" muted>
            Only for students at schools in other countries, so a {countryByCode(country)?.name ?? 'local'} school doesn’t qualify.
          </T>
          {groups.elsewhere.map((o) => card(o, true))}
        </View>
      ) : null}

      <Note icon="information-circle-outline">
        Offers and what they include change, and some need a school email. Check the terms on the provider’s site before
        signing up. PerkScan isn’t affiliated with these providers and doesn’t sign you up.
      </Note>
    </Screen>
  );
}

function OfferCard({
  offer: o,
  claimed,
  busy,
  onToggle,
  unavailable,
  personal,
}: {
  offer: StudentOffer;
  claimed: boolean;
  busy: boolean;
  onToggle: () => void;
  /** Shown for information only: no claim button. */
  unavailable?: boolean;
  /** How *you* get it at your school, e.g. "Use your @ufl.edu email". */
  personal?: string | null;
}) {
  const c = useColors();
  return (
    <Panel style={{ gap: space.sm }}>
      <Row gap={space.md}>
        <IconBubble icon={CATEGORY_ICON[o.category as keyof typeof CATEGORY_ICON] ?? 'school'} tone="purple" />
        <View style={{ flex: 1 }}>
          <T variant="subheading">{o.name}</T>
          <T variant="caption" muted>{o.provider}</T>
        </View>
        {claimed ? <Ionicons name="checkmark-circle" size={22} color={c.accent} /> : null}
      </Row>
      <T>{o.summary}</T>
      <T variant="caption" muted><T variant="caption" style={{ fontWeight: '600' }}>Who: </T>{o.eligibility}</T>
      <T variant="caption" muted><T variant="caption" style={{ fontWeight: '600' }}>How: </T>{o.how_to_verify}</T>
      {personal ? (
        <Row gap={6} style={{ backgroundColor: c.accentSoft, borderRadius: 8, paddingHorizontal: space.sm, paddingVertical: 6 }}>
          <Ionicons name="person-circle-outline" size={16} color={c.accentStrong} />
          <T variant="caption" color={c.accentStrong} style={{ flex: 1 }}>For you: {personal}</T>
        </Row>
      ) : null}
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {o.status === 'active' && o.last_verified ? <Badge label={`Checked ${checked(o.last_verified)}`} tone="good" icon="checkmark" /> : <Badge label="Not verified" />}
        <Badge label={o.countries.length ? `Only ${o.countries.join(', ')}` : o.university_ids.length ? 'Your school' : 'Worldwide'} icon="globe-outline" />
      </Row>
      <Row gap={space.sm}>
        <Button title="Open offer" icon="open-outline" size="sm" kind="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(o.url)} />
        {unavailable ? null : (
          <Button
            title={claimed ? 'Claimed' : 'I’ve claimed it'}
            icon={claimed ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size="sm"
            kind={claimed ? 'primary' : 'secondary'}
            loading={busy}
            style={{ flex: 1 }}
            onPress={onToggle}
          />
        )}
      </Row>
    </Panel>
  );
}

function MyPerkCard({ perk }: { perk: UserPerk }) {
  return (
    <Panel style={{ gap: space.sm }} onPress={() => router.push({ pathname: '/my-perk', params: { id: perk.id } })}>
      <Row gap={space.md}>
        <IconBubble icon="star" tone="orange" />
        <View style={{ flex: 1 }}>
          <T variant="subheading">{perk.title}</T>
          {perk.details ? <T variant="caption" muted>{perk.details}</T> : null}
        </View>
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Badge label="Added by you" icon="person" />
        {perk.suggest ? <Badge label="Suggested to PerkScan" icon="paper-plane-outline" /> : null}
      </Row>
      {perk.url ? (
        <Button title="Open link" icon="open-outline" size="sm" kind="secondary" style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openURL(perk.url!)} />
      ) : null}
    </Panel>
  );
}
