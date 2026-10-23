// Home's "Setting up your account 3/6" strip while something in the setup is missing (tap → Saree3's setup guide at
// the next missing item; a paused guide comes back). The very first time a brand-new account opens Home, the guide
// opens by itself.
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { AppText, ProgressBar } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { markOnboarding } from './api';
import { useSetup } from './setup';
import { ONBOARDING_NS } from './strings';

let autoOpened = false;

export function GettingStarted() {
  const { t } = useScreenT(ONBOARDING_NS);
  const { isRTL } = useDirection();
  const qc = useQueryClient();
  const setup = useSetup();
  const r = setup.row;
  const missing = setup.ready && !!r && setup.done < setup.total;

  // not finished and not paused: straight into Saree3's setup guide, once per app open
  useEffect(() => {
    if (missing && !r!.finished_at && !r!.dismissed && !autoOpened) {
      autoOpened = true;
      router.push('/47-welcome');
    }
  }, [missing, r]);

  if (!missing) return null;

  const go = async () => {
    if (r!.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push('/47-welcome');
  };

  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={`${t('stripTitle')}. ${t('stripSub', { done: setup.done, total: setup.total })}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: sizes.touch + 16,
        padding: spacing.lg,
        borderRadius: radius.tile,
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.primary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Sparkles color={colors.primary} size={20} strokeWidth={2.2} />
      <View style={{ flex: 1, gap: 6 }}>
        <AppText weight="bold">{t('stripTitle')}</AppText>
        <ProgressBar value={setup.done / setup.total} />
        <AppText variant="caption" color="textMuted">
          {t('stripSub', { done: setup.done, total: setup.total })}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <AppText variant="small" weight="bold" color="primary">
          {t('stripGo')}
        </AppText>
        <ChevronRight color={colors.primary} size={16} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
      </View>
    </Pressable>
  );
}
