// The way in to Build your team (screen 61): on the Team screen and in Saree3's setup guide.
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { TEAM_IMPORT_NS } from './strings';

export function BuildTeamCard() {
  const { t } = useScreenT(TEAM_IMPORT_NS);
  const { isRTL } = useDirection();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Card
      onPress={() => router.push('/61-build-team' as Href)}
      accessibilityLabel={t('cta')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1.5, borderColor: colors.purpleBorder, backgroundColor: colors.purpleTint }}
    >
      <IconBadge size={44} bg="surface" round>
        <Sparkles color={colors.purple} size={22} />
      </IconBadge>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText weight="extrabold">{t('cta')}</AppText>
        <AppText variant="caption" color="textSoft">
          {t('ctaSub')}
        </AppText>
      </View>
      <Chevron color={colors.purple} size={20} />
    </Card>
  );
}
