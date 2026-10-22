// Screen 46 · Growth — no mockup; v2 light style per design/TOKENS.md. Super admin only (growth_overview refuses others).
// Every account's first steps as five checkpoints (named → first task → team → hand-off → review), newest first,
// with this week's task count; then the one-tap feedback people gave after big moments.
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft } from 'lucide-react-native';
import { AppText, Card, IconButton, SectionTitle } from '@/components/ui';
import { colors, radius, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { COACH_NS } from '@/features/coach/strings';

type AccountRow = {
  id: string;
  name: string;
  created_at: string;
  people: number;
  named: boolean;
  first_task: boolean;
  team: boolean;
  handoff: boolean;
  review: boolean;
  tasks_7d: number;
};
type FeedbackRow = { moment: string; rating: number; comment: string | null; created_at: string; person: string; account: string };
const FACES = ['', '😍', '🙂', '😐', '🙁'];

export default function GrowthScreen() {
  const { t } = useScreenT(COACH_NS);
  const { lang, isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const data = useQuery({
    queryKey: ['growth'],
    queryFn: async () => {
      const { data: d, error } = await (supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'growth_overview',
      );
      if (error) throw new Error(error.message);
      return d as { accounts: AccountRow[]; feedback: FeedbackRow[] };
    },
  });
  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso));
  const steps = (a: AccountRow) => [
    ['stNamed', a.named],
    ['stTask', a.first_task],
    ['stTeam', a.team],
    ['stHandoff', a.handoff],
    ['stReview', a.review],
  ] as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{t('growthTitle')}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('growthSub')}
          </AppText>
        </View>
      </View>

      {data.isLoading && <ActivityIndicator color={colors.primary} />}
      {data.isError && (
        <AppText color="red" variant="small">
          {(data.error as Error).message}
        </AppText>
      )}

      {(data.data?.accounts ?? []).map((a) => (
        <Card key={a.id} style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <AppText weight="bold" style={{ flex: 1 }} numberOfLines={1}>
              {a.name}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {`${day(a.created_at)} · ${a.people} ${t('colPeople')}`}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {steps(a).map(([k, ok]) => (
              <View
                key={k}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: ok ? colors.greenTint : colors.chip }}
              >
                {ok && <Check color={colors.greenText} size={11} strokeWidth={3} />}
                <AppText variant="micro" weight="bold" color={ok ? 'greenText' : 'textMuted'}>
                  {t(k)}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" color={a.tasks_7d ? 'primary' : 'textMuted'}>
            {a.tasks_7d ? t('tasks7d', { n: a.tasks_7d }) : t('noTasks')}
          </AppText>
        </Card>
      ))}

      <SectionTitle title={t('feedback')} />
      {(data.data?.feedback ?? []).length === 0 && !data.isLoading ? (
        <AppText color="textMuted" variant="small">
          {t('noFeedback')}
        </AppText>
      ) : (
        (data.data?.feedback ?? []).map((f, i) => (
          <Card key={i} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <AppText style={{ fontSize: 22 }}>{FACES[f.rating] ?? ''}</AppText>
              <AppText variant="small" weight="bold" style={{ flex: 1 }} numberOfLines={1}>
                {`${f.person} · ${f.account}`}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {day(f.created_at)}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              {t(`fb_${f.moment}`)}
            </AppText>
            {!!f.comment && <AppText variant="small">{f.comment}</AppText>}
          </Card>
        ))
      )}
    </ScrollView>
  );
}
