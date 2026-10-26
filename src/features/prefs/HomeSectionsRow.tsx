// A row that opens "Customize Home" (screen 58): at the bottom of Home and in Settings. Same look as the other rows.
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { PREFS_NS } from './strings';

export function HomeSectionsRow() {
  const { t } = useScreenT(PREFS_NS);
  const { isRTL } = useDirection();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Card
      onPress={() => router.push('/58-home-sections' as Href)}
      accessibilityLabel={t('row')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <IconBadge size={40} bg="purpleTint" round>
        <SlidersHorizontal color={colors.purple} size={20} />
      </IconBadge>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{t('row')}</AppText>
        <AppText variant="caption" color="textMuted">
          {t('rowSub')}
        </AppText>
      </View>
      <Chevron color={colors.textMuted} size={20} />
    </Card>
  );
}
