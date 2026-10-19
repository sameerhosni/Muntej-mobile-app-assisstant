import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Avatar, Card } from '@/components/ui';
import { spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from '@/features/home/value';
import { objectiveTitle, type ObjectiveWithOwner } from './api';
import type { ObjectiveHealth } from './health';
import { DualBar, GapIcons, HealthChip } from './visuals';
import { NS } from './strings';

export function shortDate(iso: string, lang: 'en' | 'ar') {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-US', { month: 'short', day: 'numeric' }).format(
      new Date(iso),
    );
  } catch {
    return new Date(iso).toDateString();
  }
}

export function ownerName(o: ObjectiveWithOwner, lang: 'en' | 'ar') {
  return o.owner ? (lang === 'ar' && o.owner.full_name_ar) || o.owner.full_name : null;
}

export function ObjectiveCard({ objective: o, health: h }: { objective: ObjectiveWithOwner; health: ObjectiveHealth }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const title = objectiveTitle(o, lang);
  const owner = ownerName(o, lang);
  const n = (v: number) => formatNumber(v, lang);
  return (
    <Card
      padding={spacing.xxl}
      onPress={() => router.push({ pathname: '/41-objective', params: { id: o.id } })}
      accessibilityLabel={t('cardA11y', { title, status: t(`l_${h.label}`), progress: n(h.progress), time: n(h.timeUsed) })}
      style={{ gap: spacing.md }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <AppText variant="cardTitle" numberOfLines={2} style={{ flex: 1 }}>
          {title}
        </AppText>
        <HealthChip label={h.label} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {owner ? (
          <>
            <Avatar name={owner} size={20} />
            <AppText variant="caption" weight="semibold" color="textSoft" numberOfLines={1}>
              {owner}
            </AppText>
          </>
        ) : (
          <AppText variant="caption" weight="bold" color="amberText">
            {t('noOwner')}
          </AppText>
        )}
      </View>
      <DualBar health={h} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {t('tasksDue', { count: h.total, n: n(h.total), date: shortDate(o.due_at, lang) })}
        </AppText>
        <GapIcons health={h} />
      </View>
    </Card>
  );
}
