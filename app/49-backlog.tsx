// Screen 49 · Backlog (super admin only) — no mockup; v2 light style per design/TOKENS.md
// Everything started or promised that isn't finished yet, grouped by what it needs (the owner, a new build, testing,
// later ideas, cleanup). The list comes from docs/BACKLOG.md (src/features/backlog/data.ts, regenerated on every
// publish). Opened from Settings; anyone else is sent Home.
import { Redirect, router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { AppText, Card, IconButton } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { BACKLOG, BACKLOG_UPDATED } from '@/features/backlog/data';
import { BACKLOG_NS } from '@/features/backlog/strings';

export default function BacklogScreen() {
  const { t } = useScreenT(BACKLOG_NS);
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const { data: me } = useMyProfile();
  const realRole = (me as { actual_role?: string } | undefined)?.actual_role ?? me?.role;
  if (me && realRole !== 'super_admin') return <Redirect href="/" />;
  const sections = BACKLOG.filter((s) => s.items.length);
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
      </View>
      <AppText color="textSoft">{t('sub', { count: total, n: total, date: BACKLOG_UPDATED })}</AppText>

      {sections.map((s) => (
        <View key={s.title} style={{ gap: spacing.sm }}>
          <AppText variant="section">{s.title}</AppText>
          {s.items.map((i) => (
            <Card key={i.id} padding={spacing.lg} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryTint }}>
                  <AppText variant="caption" weight="extrabold" color="primary">
                    {i.id}
                  </AppText>
                </View>
                <AppText weight="bold" style={{ flex: 1 }}>
                  {i.title}
                </AppText>
              </View>
              {!!i.detail && (
                <AppText variant="small" color="textSoft">
                  {i.detail}
                </AppText>
              )}
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
