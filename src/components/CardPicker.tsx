import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { countryByCode } from '@/domain/countries';
import type { Card } from '@/domain/types';
import { font, radius, space, useColors } from '@/theme';
import { CardArt } from './CardArt';
import { T } from './ui';

/** Searchable multi-select over the card catalog. Cards from the user's country come first. */
export function CardPicker({
  cards,
  selected,
  onToggle,
  ownedIds = [],
  country = null,
}: {
  cards: Card[];
  selected: string[];
  onToggle: (id: string) => void;
  ownedIds?: string[];
  country?: string | null;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => `${card.issuer} ${card.product_name}`.toLowerCase().includes(needle));
  }, [cards, q]);
  const local = shown.filter((card) => card.country === country);
  const groups =
    local.length && local.length < shown.length
      ? [
          { title: `Cards in ${countryByCode(country)?.name ?? 'your country'}`, items: local },
          { title: 'Other countries', items: shown.filter((card) => card.country !== country) },
        ]
      : [{ title: null, items: local.length ? local : shown }];

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.lg }}>
        <Ionicons name="search" size={18} color={c.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search cards or banks"
          placeholderTextColor={c.textFaint}
          style={{ flex: 1, paddingVertical: 13, fontSize: 16, fontFamily: font.medium, color: c.text }}
          autoCorrect={false}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={c.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {groups.map((g) => [
        g.title ? <T key={g.title} variant="overline" muted style={{ marginTop: space.sm }}>{g.title}</T> : null,
        ...g.items.map((card) => {
        const on = selected.includes(card.id);
        const owned = ownedIds.includes(card.id);
        return (
          <Pressable
            key={card.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={card.product_name}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              onToggle(card.id);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.lg,
              backgroundColor: on ? c.accentSoft : c.surface,
              borderWidth: on ? 2 : 1,
              borderColor: on ? c.accent : c.border,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <CardArt cardId={card.id} issuer={card.issuer} name={card.product_name} size="sm" />
            <View style={{ flex: 1, gap: 1 }}>
              <T variant="caption" muted>{card.issuer}</T>
              <T variant="subheading" numberOfLines={1}>{card.product_name.replace(/®/g, '')}</T>
              {owned ? <T variant="caption" faint>In your wallet · tap to add another</T> : null}
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'add-circle-outline'} size={26} color={on ? c.accent : c.textFaint} />
          </Pressable>
        );
        }),
      ])}
      {cards.length === 0 ? (
        <T muted center style={{ padding: space.lg }}>
          The card catalog is empty. In VS Code run: npx supabase db push --include-seed
        </T>
      ) : shown.length === 0 ? (
        <T muted center style={{ padding: space.lg }}>
          No match yet. We add cards one at a time so every benefit can be checked against the issuer.
        </T>
      ) : null}
    </View>
  );
}
