import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { addMembership, removeMembership } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';
import { Chip, IconBubble, Row, T } from './ui';

/** Memberships in the catalog for the user's country, and which ones they have. */
export function useMemberships() {
  const { data } = useData();
  return useMemo(() => {
    const country = data.profile?.country ?? 'US';
    const all = data.cards.filter((c) => c.kind === 'membership' && c.country === country);
    const owned = new Map(data.userCards.filter((u) => all.some((m) => m.id === u.card_id)).map((u) => [u.card_id, u.id]));
    return { all, owned };
  }, [data.cards, data.userCards, data.profile?.country]);
}

/**
 * Pick the memberships you have; each one is added or removed straight away. Chips for setup,
 * rows (with what each includes) for the Memberships screen.
 */
export function MembershipPicker({ variant = 'rows', suggested = [] }: { variant?: 'chips' | 'rows'; suggested?: string[] }) {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const { all, owned } = useMemberships();
  const [busy, setBusy] = useState<string | null>(null);
  // Suggested ones (seen in your email) first.
  const list = [...all].sort((a, b) => Number(suggested.includes(b.id)) - Number(suggested.includes(a.id)));

  const toggle = async (id: string) => {
    setBusy(id);
    try {
      const mine = owned.get(id);
      if (mine) await removeMembership(mine);
      else await addMembership(id);
      await refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    } finally {
      setBusy(null);
    }
  };

  if (variant === 'chips') {
    return (
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {list.map((m) => (
          <Chip key={m.id} label={m.product_name} icon={owned.has(m.id) ? 'checkmark' : 'add'} selected={owned.has(m.id)} onPress={() => busy || toggle(m.id)} />
        ))}
      </Row>
    );
  }

  return (
    <View>
      {list.map((m, i) => {
        const perks = data.benefits.filter((b) => b.card_id === m.id);
        return (
          <Row key={m.id} gap={space.md} style={{ paddingVertical: space.md, alignItems: 'flex-start', borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <IconBubble icon="ribbon" tone={owned.has(m.id) ? 'green' : 'gray'} size={36} />
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="subheading">{m.product_name}</T>
              {suggested.includes(m.id) && !owned.has(m.id) ? <T variant="caption" color={c.accentStrong}>Looks like you have this: it’s in your email</T> : null}
              <T variant="caption" muted numberOfLines={2}>{perks.slice(0, 3).map((p) => p.name).join(' · ')}</T>
            </View>
            <Switch
              value={owned.has(m.id)}
              disabled={busy === m.id}
              onValueChange={() => toggle(m.id)}
              trackColor={{ true: c.accent, false: c.border }}
              accessibilityLabel={`I have ${m.product_name}`}
            />
          </Row>
        );
      })}
    </View>
  );
}
