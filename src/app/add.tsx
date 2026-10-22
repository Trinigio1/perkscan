import { router } from 'expo-router';
import { ListRow } from '@/components/ListRow';
import { Panel, Screen } from '@/components/ui';
import { ADD_TYPES } from '@/domain/programs';
import { offerIcon } from '@/domain/visuals';
import { space } from '@/theme';

/** One place to add anything: a text from your bank or a store, or something you're owed. */
export default function Add() {
  return (
    <Screen edges={[]}>
      <Panel style={{ paddingVertical: space.xs }}>
        <ListRow icon="clipboard" tone="orange" title="Paste a text" subtitle="A bank alert or an offer by SMS" onPress={() => router.push('/add-text')} />
      </Panel>
      <Panel style={{ paddingVertical: space.xs }}>
        {ADD_TYPES.map((a) => {
          const { icon, tone } = offerIcon(a.type);
          return (
            <ListRow
              key={a.type}
              icon={icon}
              tone={tone}
              title={a.title}
              subtitle={a.example}
              onPress={() => router.push({ pathname: '/add-item', params: { type: a.type } })}
            />
          );
        })}
      </Panel>
    </Screen>
  );
}
