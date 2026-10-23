import { View } from 'react-native';
import { INTERESTS } from '@/domain/deals';
import { space } from '@/theme';
import { Chip, type IconName } from './ui';

/** Tappable chips; picks several. Defaults to the deal interests. */
export function InterestPicker({
  value,
  onChange,
  options = INTERESTS.map((i) => ({ id: i.id, label: i.label, icon: i.icon })),
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options?: { id: string; label: string; icon?: IconName }[];
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return <Chip key={o.id} label={o.label} icon={o.icon} selected={on} onPress={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])} />;
      })}
    </View>
  );
}
