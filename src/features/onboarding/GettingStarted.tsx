// Home's "Getting started 2/4" strip while onboarding isn't finished (tap → Saree3 picks up where it stopped; a
// skipped onboarding comes back). The very first time a brand-new account opens Home, the chat opens by itself.
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { AppText, ProgressBar } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { markOnboarding, progressOf, useOnboarding } from './api';
import { ONBOARDING_NS } from './strings';

let autoOpened = false;

export function GettingStarted() {
  const { t } = useScreenT(ONBOARDING_NS);
  const { isRTL } = useDirection();
  const qc = useQueryClient();
  const me = useMyProfile();
  const row = useOnboarding(me.data?.id);
  const tasks = useTasks();
  const team = useTeam();
  const r = row.data;
  const ready = !!r && !!me.data && !!tasks.data && !!team.data;
  const p = ready ? progressOf(r!, me.data!, tasks.data ?? [], team.data ?? []) : null;

  // a brand-new account: straight into Saree3's welcome, once
  useEffect(() => {
    if (ready && !r!.finished_at && !r!.dismissed && p!.done === 0 && !autoOpened) {
      autoOpened = true;
      router.push('/02-capture');
    }
  }, [ready, r, p]);

  if (!ready || r!.finished_at || !p) return null;

  const go = async () => {
    if (r!.dismissed) await markOnboarding(qc, { dismissed: false }).catch(() => {});
    router.push('/02-capture');
  };

  return (
    <Pressable
      onPress={go}
      accessibilityRole="button"
      accessibilityLabel={`${t('stripTitle')}. ${t('stripSub', { done: p.done, total: p.total })}`}
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
        <ProgressBar value={p.done / p.total} />
        <AppText variant="caption" color="textMuted">
          {t('stripSub', { done: p.done, total: p.total })}
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
