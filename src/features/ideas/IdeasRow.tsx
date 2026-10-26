// A row that opens "Your ideas" (screen 59) from Settings, and for the super admin the wish list (screen 60).
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardList, Lightbulb } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { useMyProfile } from '@/lib/api';
import { IDEAS_NS } from './strings';

export function IdeasRow({ from = 'settings' }: { from?: string }) {
  const { t } = useScreenT(IDEAS_NS);
  const { isRTL } = useDirection();
  const me = useMyProfile();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const superAdmin = (me.data?.actual_role ?? me.data?.role) === 'super_admin';
  const row = (title: string, sub: string, href: string, icon: React.ReactNode, bg: 'amberTint' | 'purpleTint') => (
    <Card onPress={() => router.push(href as Href)} accessibilityLabel={title} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconBadge size={40} bg={bg} round>
        {icon}
      </IconBadge>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {sub}
        </AppText>
      </View>
      <Chevron color={colors.textMuted} size={20} />
    </Card>
  );
  return (
    <>
      {row(t('row'), t('rowSub'), `/59-ideas?from=${from}`, <Lightbulb color={colors.amberText} size={20} />, 'amberTint')}
      {superAdmin && row(t('wRow'), t('wRowSub'), '/60-wishlist', <ClipboardList color={colors.purple} size={20} />, 'purpleTint')}
    </>
  );
}
