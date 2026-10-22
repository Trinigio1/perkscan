import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Badge, Screen, T } from '@/components/ui';
import { PRIVACY, TERMS } from '@/domain/legal';
import { space } from '@/theme';

/** Draft privacy policy or terms (?doc=privacy|terms). */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const d = doc === 'terms' ? TERMS : PRIVACY;
  return (
    <Screen edges={[]}>
      <View style={{ gap: space.xs }}>
        <T variant="title">{d.title}</T>
        <Badge label={d.updated} tone="warn" />
      </View>
      {d.sections.map((s) => (
        <View key={s.heading} style={{ gap: space.xs }}>
          <T variant="heading">{s.heading}</T>
          {s.body.map((p) => (
            <T key={p.slice(0, 40)} muted>{p}</T>
          ))}
        </View>
      ))}
    </Screen>
  );
}
