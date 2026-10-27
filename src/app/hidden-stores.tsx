import { useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, Panel, Row, Screen, T } from '@/components/ui';
import { unmuteStore } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { space, useColors } from '@/theme';

/** Stores whose offers you hid. Their marketing isn't read; their receipts still are. */
export default function HiddenStores() {
  const c = useColors();
  const toast = useToast();
  const { data, refresh } = useData();
  const [busy, setBusy] = useState<string | null>(null);

  const unhide = async (key: string, name: string) => {
    setBusy(key);
    try {
      await unmuteStore(key);
      await refresh();
      toast(`${name} offers will show again`, { tone: 'info' });
    } catch (e) {
      toast((e as Error).message, { tone: 'info' });
    } finally {
      setBusy(null);
    }
  };

  if (!data.storeMutes.length) {
    return (
      <Screen edges={[]}>
        <Empty icon="eye-off-outline" title="No hidden stores" body="Open any offer and tap “Hide all offers from…” to stop seeing a store’s promotions." />
      </Screen>
    );
  }
  return (
    <Screen edges={[]}>
      <T muted>Offers from these stores aren’t shown, and their promotional emails aren’t read. Their receipts still count toward your card protections.</T>
      <Panel style={{ paddingVertical: space.xs }}>
        {data.storeMutes.map((m, i) => {
          const name = m.name ?? m.store_key;
          return (
            <Row key={m.store_key} gap={space.md} style={[{ paddingVertical: space.md, alignItems: 'center' }, i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : null]}>
              <View style={{ flex: 1 }}>
                <T variant="subheading">{name}</T>
              </View>
              <Button title="Show again" size="sm" kind="secondary" loading={busy === m.store_key} disabled={!!busy} onPress={() => unhide(m.store_key, name)} />
            </Row>
          );
        })}
      </Panel>
    </Screen>
  );
}
