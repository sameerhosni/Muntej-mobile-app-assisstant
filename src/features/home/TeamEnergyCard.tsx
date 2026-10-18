// "Team energy this week" card on Manager Home — see design/v2/html/Main.dc.html
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Avatar, Button, Card, PointsCoin, SectionTitle } from '@/components/ui';
import { colors, radius, sizes, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { formatNumber } from './value';
import { teamEnergyDemo } from './demoData';
import { NS } from './strings';

export function TeamEnergyCard({ raised }: { raised?: boolean }) {
  const { t } = useScreenT(NS);
  const { lang } = useDirection();
  const d = teamEnergyDemo;
  const names = d.stars.map((s) => (lang === 'ar' ? s.nameAr : s.name));

  return (
    <Card elevation={raised ? 'raised' : 'card'} padding={spacing.xl}>
      <SectionTitle title={t('energyTitle')} actionLabel={t('pointsSettings')} onAction={() => router.push('/27-points-control')} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.md,
            backgroundColor: colors.orangeTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PointsCoin size={24} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="big" color="orangeText">
              {formatNumber(d.points, lang)}
            </AppText>
            <View style={{ backgroundColor: colors.greenTint, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 }}>
              <AppText variant="caption" weight="bold" color="green">
                {'▲ '}
                {formatNumber(d.deltaPct, lang)}%
              </AppText>
            </View>
          </View>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {t('energySub', { count: d.streakCount })}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingStart: spacing.md,
          paddingEnd: spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {d.stars.map((s, i) => (
            <View key={s.name} style={{ marginStart: i === 0 ? 0 : -9 }}>
              <Avatar name={names[i]} size={30} gradient={s.gradient} ring />
            </View>
          ))}
        </View>
        <AppText variant="small" color="textSoft" style={{ flex: 1, lineHeight: 18 }} numberOfLines={2}>
          {t('didGreat', { a: names[0], b: names[1] })}
        </AppText>
        <Button label={t('recognize')} size="md" onPress={() => router.push('/28-kudos')} style={{ minHeight: sizes.touch }} />
      </View>
    </Card>
  );
}
