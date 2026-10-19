import { Pressable, View } from 'react-native';
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { AppText, Avatar } from '@/components/ui';
import { colors, radius, shadows, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatDue } from '@/features/capture/format';
import type { Candidate } from './api';
import { contentDirection } from './Bubbles';
import { NS } from './strings';

/** Several tasks fit what the user described: tap one to lock the chat on it and re-send the message. */
export function Candidates({
  items,
  onPick,
  disabled,
}: {
  items: Candidate[];
  onPick: (c: Candidate) => void;
  disabled?: boolean;
}) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  if (!items.length) return null;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <View style={{ gap: spacing.sm, paddingStart: 38 }}>
      <AppText variant="caption" weight="bold" color="textMuted">
        {t('whichOne')}
      </AppText>
      {items.slice(0, 3).map((c) => {
        const owner = c.owner_name ? c.owner_name.split(' ')[0] : null;
        return (
          <Pressable
            key={c.id}
            onPress={() => onPick(c)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('pickA11y', { title: c.title })}
            style={({ pressed }) => ({
              minHeight: sizes.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              paddingVertical: spacing.sm,
              paddingStart: spacing.lg,
              paddingEnd: spacing.sm,
              borderRadius: radius.tile,
              borderWidth: 1,
              borderColor: colors.borderBlue,
              backgroundColor: colors.surface,
              boxShadow: shadows.tile,
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <AppText weight="bold" numberOfLines={1} style={{ writingDirection: contentDirection(c.title) }}>
                {c.title}
              </AppText>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                {owner ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Avatar name={owner} size={16} />
                    <AppText variant="caption" weight="semibold" color="textSoft">
                      {owner}
                    </AppText>
                  </View>
                ) : (
                  <AppText variant="caption" weight="semibold" color="amberText">
                    {t('noOwner')}
                  </AppText>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Calendar color={colors.textMuted} size={11} strokeWidth={2.2} />
                  <AppText variant="caption" color="textMuted">
                    {c.due_at ? formatDue(c.due_at, lang) : t('noDue')}
                  </AppText>
                </View>
              </View>
            </View>
            <Chevron color={colors.primary} size={18} strokeWidth={2.2} />
          </Pressable>
        );
      })}
    </View>
  );
}
