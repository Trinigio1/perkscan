import { Fragment } from 'react';
import { useNextUp } from '@/components/NextUp';
import { Empty, Screen } from '@/components/ui';

/** Everything waiting for you, most important first: the same panels Home used to stack. */
export default function NextUp() {
  const items = useNextUp();
  return (
    <Screen edges={[]}>
      {items.length ? items.map((x) => <Fragment key={x.key}>{x.node}</Fragment>) : <Empty icon="checkmark-done" title="All caught up" body="New things to do show up here and on Home." />}
    </Screen>
  );
}
