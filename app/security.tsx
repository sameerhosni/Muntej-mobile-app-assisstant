// Screen · Sign-in & security — no mockup; v2 light style per design/TOKENS.md
// Sign-in is the email code, WhatsApp, or the fingerprint / face on this phone. The authenticator-app step
// (Supabase TOTP) was removed on 27 Oct (owner: "only fingerprint needed along with otp and WhatsApp").
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { AppText, Card, IconBadge, IconButton, Screen } from '@/components/ui';
import { colors } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { BiometricCard } from '@/features/auth/BiometricCard';

export default function SecurityScreen() {
  const { t } = useTranslation();
  const { isRTL } = useDirection();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="titleLg">{t('security.title')}</AppText>
      </View>

      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconBadge size={44} bg="primaryTint">
          <ShieldCheck color={colors.primary} size={22} strokeWidth={2} />
        </IconBadge>
        <AppText variant="small" color="textSoft" style={{ flex: 1 }}>
          {t('security.intro')}
        </AppText>
      </Card>

      {/* fingerprint / face sign-in on this phone */}
      <BiometricCard />
    </Screen>
  );
}
