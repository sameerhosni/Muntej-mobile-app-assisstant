// Home entry points to screen 40: manager card "Objectives · 2 at risk" and the employee "My objectives" link.
import { View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Target } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile, useTasks, useTeam } from '@/lib/api';
import { formatNumber } from '@/features/home/value';
import { useObjectives } from './api';
import { useObjectivesHealth } from './health';
import { NS } from './strings';

export function ObjectivesLinkCard({ variant = 'manager' }: { variant?: 'manager' | 'employee' }) {
  const { t } = useScreenT(NS);
  const { lang, isRTL } = useDirection();
  const objectives = useObjectives();
  const tasks = useTasks();
  const team = useTeam();
  const me = useMyProfile();
  const { health } = useObjectivesHealth(objectives.data, tasks.data, team.data, me.data);

  const mine =
    variant === 'employee'
      ? (objectives.data ?? []).filter(
          (o) => o.owner_id === me.data?.id || (tasks.data ?? []).some((x) => x.objective_id === o.id && x.owner_id === me.data?.id),
        )
      : (objectives.data ?? []);
  const active = mine.filter((o) => o.status === 'active');
  const atRisk = active.filter((o) => health.get(o.id)?.label === 'atRisk').length;
  const title = variant === 'employee' ? t('myObjectives') : t('title');
  const summary = objectives.isLoading
    ? variant === 'employee'
      ? t('myObjectivesSub')
      : t('linkSub')
    : atRisk > 0
      ? t('linkAtRisk', { n: formatNumber(atRisk, lang) })
      : active.length > 0
        ? t('linkAllGood')
        : variant === 'employee'
          ? t('myObjectivesSub')
          : t('linkNone');
  const tint = variant === 'employee' ? 'purpleTint' : 'primaryTint';
  const fg = variant === 'employee' ? colors.purple : colors.primary;

  return (
    <Card
      padding={spacing.lg}
      onPress={() => router.push('/40-objectives')}
      accessibilityLabel={`${title} · ${summary}`}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: sizes.touch + 12, marginTop: -spacing.sm }}
    >
      <IconBadge size={36} bg={tint}>
        <Target color={fg} size={17} strokeWidth={2} />
      </IconBadge>
      <AppText variant="small" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
        <AppText variant="small" weight="bold">
          {title}
        </AppText>
        {' · '}
        <AppText variant="small" weight={atRisk > 0 ? 'bold' : 'regular'} color={atRisk > 0 ? 'red' : 'textMuted'}>
          {summary}
        </AppText>
      </AppText>
      {atRisk > 0 && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red, marginEnd: spacing.sm }} />}
      <ChevronRight color={colors.textFaint} size={16} strokeWidth={2.2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
    </Card>
  );
}
