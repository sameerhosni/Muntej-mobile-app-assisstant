import { View } from 'react-native';
import { spacing } from '@/theme/tokens';
import { Chip } from './Chip';

export type FilterOption<K extends string> = { key: K; label: string; count?: number };

type Props<K extends string> = {
  options: FilterOption<K>[];
  value: K;
  onChange: (key: K) => void;
};

/**
 * Single-select filter chips ("All · Late 3 · …") that wrap onto a second line when they don't fit: scrolling sideways
 * cut the last one in half at the screen's edge (owner, 5 Nov: "many cut words"). One set per screen, "All" first.
 */
export function FilterChips<K extends string>({ options, value, onChange }: Props<K>) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: 2 }}>
      {options.map((o) => (
        <Chip
          key={o.key}
          label={o.count === undefined ? o.label : `${o.label} · ${o.count}`}
          selected={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </View>
  );
}
