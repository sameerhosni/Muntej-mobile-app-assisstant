// Signed in with an email no account has invited (no profile was made for it): say so plainly, offer Sign out.
import { View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme/tokens';
import { useScreenT } from '@/lib/i18n/register';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSignOut } from '@/lib/api';
import { ACCOUNTS_NS } from './strings';

export function NotInvited() {
  const { t } = useScreenT(ACCOUNTS_NS);
  const { session } = useAuth();
  const signOut = useSignOut();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.screen, gap: spacing.lg }}>
      <AppText variant="titleLg">{t('notInvitedTitle')}</AppText>
      <AppText color="textSoft">{t('notInvitedBody', { email: session?.user.email ?? '' })}</AppText>
      <Button label={t('signOut')} variant="outline" onPress={() => signOut.mutate()} />
    </View>
  );
}
