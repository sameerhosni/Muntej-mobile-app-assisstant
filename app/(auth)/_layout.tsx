import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthProvider';

export default function AuthLayout() {
  const { needsMfa } = useAuth();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {/* email code first; the authenticator step only when 2FA is turned on for this account */}
      <Stack.Protected guard={!needsMfa}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={needsMfa}>
        <Stack.Screen name="mfa" />
      </Stack.Protected>
    </Stack>
  );
}
