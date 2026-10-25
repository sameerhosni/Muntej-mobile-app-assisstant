// A row that opens the support chat with the Muntej team (Settings, My profile). Hidden where the chat isn't in this
// build. Same look as the other rows: Card, IconBadge, chevron.
import { View } from 'react-native';
import { ChevronLeft, ChevronRight, MessageCircleQuestion } from 'lucide-react-native';
import { AppText, Card, IconBadge } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { useScreenT } from '@/lib/i18n/register';
import { openSupport, supportAvailable, useUnreadSupport } from './intercom';
import { SUPPORT_NS } from './strings';
import { munti } from '@/features/munti/store';

export function SupportRow() {
  const { t } = useScreenT(SUPPORT_NS);
  const { isRTL } = useDirection();
  const unread = useUnreadSupport();
  if (!supportAvailable()) return null;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Card onPress={() => openSupport().then((err) => err && munti.say(`⚠️ ${err}`))} accessibilityLabel={t('talk')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <IconBadge size={40} bg="primaryTint" round>
        <MessageCircleQuestion color={colors.primary} size={20} />
      </IconBadge>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="bold">{t('talk')}</AppText>
        <AppText variant="caption" color={unread ? 'primary' : 'textMuted'} weight={unread ? 'bold' : 'regular'}>
          {unread ? t('unread', { count: unread }) : t('talkSub')}
        </AppText>
      </View>
      <Chevron color={colors.textMuted} size={20} />
    </Card>
  );
}
