import { ActivityIndicator, View } from 'react-native';
import { Redirect, type Href } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { NotInvitedError, useMyProfile } from '@/lib/api';
import { NotInvited } from '@/features/accounts/NotInvited';
import { homeRouteFor } from '@/features/screens/registry';
import { useAiConsent } from '@/features/ai-consent/api';
import { colors } from '@/theme/tokens';

/** Sends each user to their role's home: managers → 01, employees → 25. Asks about AI once first (Apple 5.1.2). */
export default function Index() {
  const { session } = useAuth();
  const me = useMyProfile();
  const ai = useAiConsent();
  if (!session) return <Redirect href="/sign-in" />;
  if (me.isLoading || (me.data && ai.loading)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  // signed in, but no account has invited this email
  if (me.error instanceof NotInvitedError) return <NotInvited />;
  // nothing of theirs goes to the AI before they answer
  if (ai.needsAnswer) return <Redirect href={'/ai-consent' as Href} />;
  return <Redirect href={homeRouteFor(me.data?.role)} />;
}
