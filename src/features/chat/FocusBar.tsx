import { Pressable, View } from 'react-native';
import { Crosshair, X } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { contentDirection } from './Bubbles';
import { NS } from './strings';

type Props = {
  title: string;
  ownerFirstName?: string | null;
  onClear: () => void;
};

/** Pinned above the composer while the chat is locked on one task: everything said changes that task. */
export function FocusBar({ title, ownerFirstName, onClear }: Props) {
  const { t } = useScreenT(NS);
  return (
    <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, backgroundColor: colors.bg }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colors.primaryTint,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.borderBlue,
          paddingStart: spacing.lg,
          minHeight: sizes.touch,
        }}
      >
        <Crosshair color={colors.primary} size={16} strokeWidth={2.2} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <AppText variant="caption" weight="semibold" color="textMuted">
            {t('talkingAbout')}
          </AppText>
          <AppText
            variant="small"
            weight="bold"
            color="primary"
            numberOfLines={1}
            style={{ flexShrink: 1, writingDirection: contentDirection(title) }}
          >
            {title}
          </AppText>
          {!!ownerFirstName && (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              · {ownerFirstName}
            </AppText>
          )}
        </View>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('clearFocus')}
          style={({ pressed }) => ({
            width: sizes.touch,
            height: sizes.touch,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <X color={colors.textSoft} size={18} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}
