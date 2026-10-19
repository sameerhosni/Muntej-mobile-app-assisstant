import { Pressable, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { contentDirection } from './Bubbles';
import { NS } from './strings';

/** Optional next steps under the latest task card; tapping one just sends it as a chat message. */
export function Suggestions({ items, onPick, disabled }: { items: string[]; onPick: (text: string) => void; disabled?: boolean }) {
  const { t } = useScreenT(NS);
  if (!items.length) return null;
  return (
    <View style={{ gap: spacing.sm, paddingStart: 38 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Sparkles color={colors.purple} size={12} strokeWidth={2.4} />
        <AppText variant="caption" weight="bold" color="textMuted">
          {t('nextSteps')}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {items.map((s) => (
          <Pressable
            key={s}
            onPress={() => onPick(s)}
            disabled={disabled}
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: sizes.touch - 6,
              justifyContent: 'center',
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.purpleBorder,
              backgroundColor: colors.purpleTint,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <AppText variant="small" weight="bold" color="purpleText" style={{ writingDirection: contentDirection(s) }}>
              {s}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
