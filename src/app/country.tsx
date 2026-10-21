import { router } from 'expo-router';
import { CountryPicker } from '@/components/CountryPicker';
import { Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { updateProfile } from '@/lib/cards';
import { useData } from '@/lib/data';
import { useToast } from '@/lib/toast';

export default function CountrySettings() {
  const { session } = useAuth();
  const { data, refresh } = useData();
  const toast = useToast();
  return (
    <Screen edges={[]}>
      <T muted>Your home currency is shown big on the home screen. Amounts in other currencies are listed next to it.</T>
      <CountryPicker
        initial={data.profile}
        saveTitle="Save"
        onSave={async (r) => {
          if (!session) return;
          await updateProfile(session.user.id, r);
          await refresh();
          toast('Saved');
          router.back();
        }}
      />
    </Screen>
  );
}
