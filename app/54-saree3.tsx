// Screen 54 · What I'm working on — no mockup; v2 light style per design/TOKENS.md
// Everything Saree3 is handling for you right now, grouped: Needs you · I'm on it · Waiting on others. Each line says
// what's happening and either "nothing for you to do" (and when he acts next) or exactly what's needed.
// Opened from the Home strip and Saree3's "What happened?". Data: src/features/saree3/jobs.ts.
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Card, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { Munti } from '@/features/munti/Munti';
import { useSaree3Jobs, type Job, type JobKind } from '@/features/saree3/jobs';
import { JOBS_NS } from '@/features/saree3/strings';

const ORDER: JobKind[] = ['needs', 'working', 'waiting'];

export default function Saree3JobsScreen() {
  const { t } = useScreenT(JOBS_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { jobs, needs } = useSaree3Jobs(t, lang);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} tintColor={colors.primary} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
        <Munti size="sm" mood={needs ? 'think' : 'celebrate'} />
      </View>
      <AppText color="textSoft">{t('sub')}</AppText>

      {!jobs.length && (
        <Card padding={spacing.lg}>
          <AppText color="textSoft">{t('empty')}</AppText>
        </Card>
      )}

      {ORDER.map((k) => {
        const list = jobs.filter((j) => j.kind === k);
        if (!list.length) return null;
        return (
          <View key={k} style={{ gap: spacing.sm }}>
            <AppText variant="section">{t(`sec_${k}`)}</AppText>
            <Card padding={spacing.sm} style={{ gap: 0 }}>
              {list.map((j, i) => (
                <JobRow key={j.key} j={j} first={i === 0} />
              ))}
            </Card>
          </View>
        );
      })}
    </ScrollView>
  );
}

function JobRow({ j, first }: { j: Job; first: boolean }) {
  const tone = j.kind === 'needs' ? colors.amberTint : j.kind === 'working' ? colors.primaryTint : colors.chip;
  return (
    <Pressable
      onPress={() => j.href && router.push(j.href)}
      disabled={!j.href}
      accessibilityRole={j.href ? 'button' : 'text'}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        minHeight: sizes.touch + 8,
        padding: spacing.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
        <AppText>{j.icon}</AppText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{j.text}</AppText>
        <AppText variant="caption" weight="semibold" color={j.kind === 'needs' ? 'amberText' : 'textMuted'}>
          {j.sub}
        </AppText>
      </View>
    </Pressable>
  );
}
