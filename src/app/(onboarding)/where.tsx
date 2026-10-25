import { router } from 'expo-router';
import { View } from 'react-native';
import { CountryPicker } from '@/components/CountryPicker';
import { Steps } from '@/components/Steps';
import { Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { space } from '@/theme';

export default function Where() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  return (
    <Screen>
      <Steps step={1} total={5} />
      <View style={{ gap: space.xs }}>
        <T variant="display">Where do you live?</T>
        <T muted>PerkScan is built for the US. Pick somewhere else and your email and texts still work.</T>
      </View>
      <CountryPicker
        initial={data.profile}
        onSave={async (r) => {
          if (!session) return;
          await updateProfile(session.user.id, r);
          await refresh();
          router.push('/pick-cards');
        }}
      />
    </Screen>
  );
}
