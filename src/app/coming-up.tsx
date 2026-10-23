import { useMemo } from 'react';
import { View } from 'react-native';
import { EventRow, SuggestionRow } from '@/components/ComingUp';
import { Empty, Panel, Screen, T } from '@/components/ui';
import { countryByCode } from '@/domain/countries';
import { relevantEvents } from '@/domain/events';
import type { Card } from '@/domain/types';
import { useData } from '@/lib/data';
import { useSuggestions } from '@/lib/suggestions';
import { space, useColors } from '@/theme';

/** Everything coming up near you in the next few months, and what you probably qualify for. */
export default function ComingUp() {
  const c = useColors();
  const { data } = useData();
  const { list: forYou, hide } = useSuggestions();
  const country = data.profile?.country ?? null;

  const events = useMemo(() => {
    const cards = data.userCards.map((uc) => data.cards.find((x) => x.id === uc.card_id)).filter((x): x is Card => !!x);
    return relevantEvents(data.events, { country, region: data.profile?.region ?? null, cards, today: new Date().toISOString().slice(0, 10), horizonDays: 120 });
  }, [data, country]);

  return (
    <Screen edges={[]}>
      <T muted>{countryByCode(country) ? `${countryByCode(country)!.name} · ` : ''}Updated as new promotions and dates are announced.</T>

      {events.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">Near you</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {events.map((e, i) => (
              <View key={e.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <EventRow e={e} />
              </View>
            ))}
          </Panel>
        </View>
      ) : (
        <Empty icon="calendar" title="Nothing coming up yet" body={country ? 'New promotions and dates for where you live show up here as they’re announced.' : 'Set your country in Settings to see what’s coming up near you.'} />
      )}

      {forYou.length ? (
        <View style={{ gap: space.sm }}>
          <T variant="heading">For you</T>
          <Panel style={{ paddingVertical: space.xs }}>
            {forYou.map((s, i) => (
              <View key={s.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
                <SuggestionRow s={s} onHide={() => hide(s.id)} />
              </View>
            ))}
          </Panel>
        </View>
      ) : null}
    </Screen>
  );
}
