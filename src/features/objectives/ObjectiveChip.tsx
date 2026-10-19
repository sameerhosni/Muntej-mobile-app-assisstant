// Small "◎ Objective title" link under a task row; tap → objective detail. Reads the shared objectives list query
// (one request app-wide) instead of joining objectives into useTasks.
import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Target } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { objectiveTitle, useObjectiveIndex } from './api';

export function ObjectiveChip({ objectiveId }: { objectiveId: string }) {
  const { lang } = useDirection();
  const o = useObjectiveIndex().get(objectiveId);
  if (!o) return null;
  const title = objectiveTitle(o, lang);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/41-objective', params: { id: o.id } })}
      accessibilityRole="link"
      accessibilityLabel={title}
      hitSlop={{ top: (sizes.touch - 28) / 2, bottom: (sizes.touch - 28) / 2 }}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minHeight: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: colors.purpleTint,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Target color={colors.purple} size={13} strokeWidth={2.3} />
      <AppText variant="caption" weight="bold" color="purpleText" numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </AppText>
    </Pressable>
  );
}
