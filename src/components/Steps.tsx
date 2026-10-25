import { useEffect } from 'react';
import { View } from 'react-native';
import { track } from '@/lib/analytics';
import { radius, space, useColors } from '@/theme';
import { Row, T } from './ui';

/** "Step 2 of 3" with a segmented bar. Counts each setup step reached, to see where people stop. */
export function Steps({ step, total }: { step: number; total: number }) {
  const c = useColors();
  useEffect(() => track('onboarding_step', { step, total }), [step, total]);
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={6}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: i < step ? c.accent : c.surfaceSunken }} />
        ))}
      </Row>
      <T variant="overline" muted>Step {step} of {total}</T>
    </View>
  );
}
