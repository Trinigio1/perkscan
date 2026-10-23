import { View } from 'react-native';
import { CONFIDENCE_LABELS, type Confidence } from '@/domain/confidence';
import { useColors } from '@/theme';
import { Row, T } from './ui';

/** The one way PerkScan says how sure it is: a coloured dot and a word. */
export function ConfidenceTag({ value }: { value: Confidence }) {
  const c = useColors();
  const color = value === 'confirmed' ? c.accentStrong : value === 'likely' ? c.textMuted : c.warn;
  return (
    <Row gap={4}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <T variant="caption" color={color}>{CONFIDENCE_LABELS[value]}</T>
    </Row>
  );
}
