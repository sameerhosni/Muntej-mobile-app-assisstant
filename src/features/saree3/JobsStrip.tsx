// Home: one line about everything Saree3 is handling, "🤖 I'm working on 5 things · all on track, nothing for you to
// do" (or "· 1 needs you" in amber). Tap → screen 54 with each job and its state.
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AppText } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useSaree3Jobs } from './jobs';
import { JOBS_NS } from './strings';

export function JobsStrip() {
  const { t } = useScreenT(JOBS_NS);
  const { lang, isRTL } = useDirection();
  const { jobs, needs, ready } = useSaree3Jobs(t, lang);
  if (!ready || !jobs.length) return null;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={() => router.push('/54-saree3' as Href)}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 10,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: radius.tile,
        backgroundColor: needs ? colors.amberTint : colors.primaryTint,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="extrabold">{t('strip', { count: jobs.length })}</AppText>
        <AppText variant="small" weight="semibold" color={needs ? 'amberText' : 'primary'}>
          {needs ? t('needsYou', { count: needs }) : t('allGood')}
        </AppText>
      </View>
      <Chevron color={needs ? colors.amberText : colors.primary} size={20} />
    </Pressable>
  );
}
