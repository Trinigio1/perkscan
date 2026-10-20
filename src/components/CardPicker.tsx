import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { Card } from '@/domain/types';
import { radius, space, useColors } from '@/theme';
import { T } from './ui';

/** Searchable multi-select over the card catalog. */
export function CardPicker({
  cards,
  selected,
  onToggle,
  ownedIds = [],
}: {
  cards: Card[];
  selected: string[];
  onToggle: (id: string) => void;
  ownedIds?: string[];
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cards;
    return cards.filter((card) => `${card.issuer} ${card.product_name}`.toLowerCase().includes(needle));
  }, [cards, q]);

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: space.md }}>
        <Ionicons name="search" size={18} color={c.textFaint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search cards"
          placeholderTextColor={c.textFaint}
          style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: c.text }}
          autoCorrect={false}
        />
      </View>
      {shown.map((card) => {
        const on = selected.includes(card.id);
        const owned = ownedIds.includes(card.id);
        return (
          <Pressable
            key={card.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(card.id)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              padding: space.lg,
              borderRadius: radius.md,
              backgroundColor: on ? c.accentSoft : c.surface,
              borderWidth: 1,
              borderColor: on ? c.accent : c.border,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="label" faint>{card.issuer}</T>
              <T variant="heading">{card.product_name}</T>
              {owned ? <T variant="caption" muted>Already in your wallet — add another if you have two.</T> : null}
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? c.accent : c.textFaint} />
          </Pressable>
        );
      })}
      {shown.length === 0 ? (
        <T muted style={{ textAlign: 'center', padding: space.lg }}>
          No match. More cards are coming — the catalog is curated so every benefit can be verified.
        </T>
      ) : null}
    </View>
  );
}
