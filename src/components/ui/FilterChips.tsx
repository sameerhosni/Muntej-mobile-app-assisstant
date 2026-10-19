import { ScrollView } from 'react-native';
import { spacing } from '@/theme/tokens';
import { Chip } from './Chip';

export type FilterOption<K extends string> = { key: K; label: string; count?: number };

type Props<K extends string> = {
  options: FilterOption<K>[];
  value: K;
  onChange: (key: K) => void;
};

/**
 * One row of single-select filter chips ("All · Late 3 · …") that scrolls sideways when it doesn't fit.
 * Keep filters simple: one row per screen, "All" first.
 */
export function FilterChips<K extends string>({ options, value, onChange }: Props<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      style={{ flexGrow: 0 }}
    >
      {options.map((o) => (
        <Chip
          key={o.key}
          label={o.count === undefined ? o.label : `${o.label} · ${o.count}`}
          selected={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </ScrollView>
  );
}
