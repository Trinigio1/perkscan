import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { ListRow } from '@/components/ListRow';
import { Badge, Button, ErrorNote, IconBubble, Note, Panel, Row, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import type { StudentOffer } from '@/domain/types';
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
  const { session } = useAuth();
  const { data, refresh } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStudent = !!data.profile?.is_student;
  const country = data.profile?.country ?? null;

  const available = (o: StudentOffer) => o.countries.length === 0 || (!!country && o.countries.includes(country));
  const here = data.studentOffers.filter(available);
  const elsewhere = data.studentOffers.filter((o) => !available(o));
  const claimedCount = here.filter((o) => data.studentClaims.includes(o.id)).length;

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
      <Panel>
        <ListRow icon="school" tone="purple" title="I’m a student" subtitle="Shows student offers on your home screen" toggle={isStudent} onToggle={toggleStudent} />
      </Panel>

      {here.length ? (
        <Row style={{ alignItems: 'baseline' }} gap={6}>
          <T variant="title">{claimedCount} of {here.length}</T>
          <T muted>student offers claimed</T>
        </Row>
      ) : (
        <T muted>No student offers yet. Update PerkScan’s database to load them.</T>
      )}

      {error ? <ErrorNote message={error} /> : null}

      {here.map((o) => (
        <OfferCard key={o.id} offer={o} claimed={data.studentClaims.includes(o.id)} busy={busy === o.id} onToggle={() => toggleClaim(o)} />
      ))}

      {elsewhere.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="overline" muted>Not offered in {countryByCode(country)?.name ?? 'your country'}</T>
          {elsewhere.map((o) => (
            <OfferCard key={o.id} offer={o} claimed={data.studentClaims.includes(o.id)} busy={busy === o.id} onToggle={() => toggleClaim(o)} />
          ))}
        </View>
      ) : null}

      <Note icon="information-circle-outline">
        Offers and what they include change, and some need a school email. Check the terms on the provider’s site before
        signing up. PerkScan isn’t affiliated with these providers and doesn’t sign you up.
      </Note>
    </Screen>
  );
}

function OfferCard({ offer: o, claimed, busy, onToggle }: { offer: StudentOffer; claimed: boolean; busy: boolean; onToggle: () => void }) {
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
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {o.status === 'active' && o.last_verified ? <Badge label={`Checked ${checked(o.last_verified)}`} tone="good" icon="checkmark" /> : <Badge label="Not verified" />}
        <Badge label={o.countries.length ? o.countries.join(', ') : 'Worldwide'} icon="globe-outline" />
      </Row>
      <Row gap={space.sm}>
        <Button title="Open offer" icon="open-outline" size="sm" kind="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(o.url)} />
        <Button
          title={claimed ? 'Claimed' : 'I’ve claimed it'}
          icon={claimed ? 'checkmark-circle' : 'checkmark-circle-outline'}
          size="sm"
          kind={claimed ? 'primary' : 'secondary'}
          loading={busy}
          style={{ flex: 1 }}
          onPress={onToggle}
        />
      </Row>
    </Panel>
  );
}
