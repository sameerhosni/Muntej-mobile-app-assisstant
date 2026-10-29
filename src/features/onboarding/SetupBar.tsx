// A slim "Setting up your account · 3/6" bar for the main screens (Tasks, Team, Decisions, More, Tasks from email),
// so a setup left halfway can be continued from anywhere: tap → Saree3's setup guide at the next missing item.
// Home has the bigger strip (GettingStarted). Gone once everything is set up.
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { markOnboarding } from './api';
import { useSetup } from './setup';
import { ONBOARDING_NS } from './strings';

export function SetupBar() {
  const { t } = useScreenT(ONBOARDING_NS);
  const { isRTL } = useDirection();
  const qc = useQueryClient();
  const setup = useSetup();
  // an admin's three steps (company, team, first task) bring them back to the setup chat; a member's short chat is
  // offered by Home's card alone
  const items = setup.chat.items;
  const done = items.filter((i) => i.done).length;
  if (!setup.ready || !setup.row || setup.member || done >= items.length) return null;
  const go = async () => {
    if (setup.row?.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push('/63-setup-chat' as Href);
  };
  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={`${t('stripTitle')} ${done}/${items.length}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: sizes.touch,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: colors.primaryTint,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Sparkles color={colors.primary} size={16} />
      <AppText variant="small" weight="bold" color="primary" style={{ flex: 1 }} numberOfLines={1}>
        {t('stripTitle')}
      </AppText>
      {/* a mini progress: filled dots for what's done */}
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {items.map((i) => (
          <View key={i.key} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: i.done ? colors.green : colors.borderBlue }} />
        ))}
      </View>
      <AppText variant="small" weight="extrabold" color="primary" style={{ writingDirection: 'ltr' }}>
        {`${done}/${items.length}`}
      </AppText>
      <ChevronRight color={colors.primary} size={16} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
    </Pressable>
  );
}
