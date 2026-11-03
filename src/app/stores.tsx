import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { Disclaimer } from '@/components/Disclaimer';
import { StorePanel, useYourStores } from '@/components/Stores';
import { Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { formatMoney } from '@/domain/format';
import { track } from '@/lib/analytics';
import { space, useColors } from '@/theme';

/**
 * Your stores: where you actually spend (email receipts, card alerts, your bank), and for each store
 * everything you already have there, from every source PerkScan reads, each with where it came from.
 */
export default function Stores() {
  const c = useColors();
  const s = useYourStores();
  const ready = Object.entries(s.ready).map(([cur, n]) => formatMoney(n, { currency: cur })).join(' + ');

  if (!s.stores.length) {
    return (
      <Screen edges={[]}>
        <Empty
          icon="storefront"
          title="No purchases yet"
          body="Connect Gmail or your bank, or forward a few receipts. PerkScan then lists the stores you use most and everything you already have at each one."
          action={<Button title="Connect Gmail" onPress={() => router.push('/connect-gmail')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Panel style={{ gap: 4 }}>
        <T variant="label" color={c.accentStrong}>At the {s.stores.length} stores you use most</T>
        <T variant="title">{s.things ? `${s.things} thing${s.things === 1 ? '' : 's'} you already have` : 'Nothing extra yet'}</T>
        {ready ? <T>{ready} ready to use now (balances, credits left, the best code, card offers)</T> : null}
        {s.missed > 0 ? <T variant="caption" muted>Paying with the right card would have earned {formatMoney(s.missed, { currency: 'USD' })} more at these stores in the last 6 months (only cash values your card companies state).</T> : null}
        <T variant="caption" faint>From your email receipts, card alerts and bank, your cards’ and memberships’ terms, and the stores’ own pages.</T>
      </Panel>

      {s.cardApps.length ? (
        <Panel style={{ gap: space.sm }}>
          <T variant="subheading">Your card apps have offers too</T>
          <T variant="caption" muted>
            Offers you activate in your bank’s app, on top of your card’s rewards. They change often and PerkScan can’t see them, so check before you shop at {s.stores.slice(0, 3).map((x) => x.store.name).join(', ')}.
          </T>
          {s.cardApps.map((p) => (
            <Row key={p.id} gap={space.sm} style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T variant="label">{p.name}</T>
                <T variant="caption" faint>From: {p.provider}’s own page</T>
              </View>
              <Button
                title="How"
                icon="open-outline"
                size="sm"
                kind="secondary"
                onPress={() => {
                  track('your_stores', { action: 'open', kind: 'card_app' });
                  Linking.openURL(p.url);
                }}
              />
            </Row>
          ))}
        </Panel>
      ) : null}

      {s.stores.map((f) => (
        <StorePanel key={f.store.key} finds={f} />
      ))}
      <Disclaimer />
    </Screen>
  );
}
