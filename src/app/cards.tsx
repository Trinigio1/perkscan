import { YourCards } from '@/components/YourCards';
import { Screen } from '@/components/ui';

/** Every card you added, with what's left to use on each. */
export default function Cards() {
  return (
    <Screen edges={[]}>
      <YourCards />
    </Screen>
  );
}
