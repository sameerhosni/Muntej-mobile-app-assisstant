import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyProfile } from '@/lib/api';
import { homeRouteFor } from '@/features/screens/registry';
import { colors } from '@/theme/tokens';

/** Sends each user to their role's home: managers → 01, employees → 25. */
export default function Index() {
  const { session } = useAuth();
  const me = useMyProfile();
  if (!session) return <Redirect href="/sign-in" />;
  if (me.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <Redirect href={homeRouteFor(me.data?.role)} />;
}
