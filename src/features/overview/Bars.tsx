// Work overview (screen 56): a labelled bar row (by team, by priority) and a stacked bar (work status). Plain Views,
// colors from tokens, no chart library. Each row is tappable (opens the tasks behind it).
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';

export function BarRow({ label, value, max, color, onPress }: { label: string; value: number; max: number; color: string; onPress?: () => void }) {
  const pct = max > 0 ? Math.max(value ? 4 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || !value}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => ({ minHeight: sizes.touch, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.7 : 1 })}
    >
      <AppText variant="small" weight="semibold" numberOfLines={1} style={{ width: 110 }}>
        {label}
      </AppText>
      <View style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.track, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: radius.pill, backgroundColor: color }} />
      </View>
      <AppText variant="small" weight="extrabold" style={{ minWidth: 28 }}>
        {value}
      </AppText>
    </Pressable>
  );
}

export function StackBar({ parts }: { parts: { value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  return (
    <View style={{ flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.track, gap: 2 }}>
      {total > 0 && parts.filter((p) => p.value).map((p, i) => <View key={i} style={{ flex: p.value, backgroundColor: p.color }} />)}
    </View>
  );
}
