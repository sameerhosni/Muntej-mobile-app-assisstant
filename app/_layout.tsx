import '@/lib/i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { ViewingBanner } from '@/features/accounts/AccountSwitcher';
import { CoachHost } from '@/features/coach/CoachHost';
import { QuietBoundary } from '@/components/QuietBoundary';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appFonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { loadSavedLanguage, useDirection } from '@/lib/i18n';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { SCREENS } from '@/features/screens/registry';
import { ProtoBar } from '@/features/prototype/ProtoBar';
import { HelperButton } from '@/features/munti/HelperButton';
import { usePushNotifications } from '@/features/notifications/push';
import { useLiveSync } from '@/lib/realtime';
import { ShareIntentProvider } from 'expo-share-intent';
import { ShareIntake } from '@/features/incoming/ShareIntake';
import { LaunchCard } from '@/features/launch/LaunchCard';
import '@/features/prototype/strings';

// non-tab numbered screens, e.g. "14-task-detail"
const STACK_SCREENS = SCREENS.filter((s) => !s.tab).map((s) => s.route.slice(1));

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    // first, so text shared from other apps ("Share to Muntej") is caught at launch
    <ShareIntentProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SafeAreaProvider>
            <RootNavigator />
          </SafeAreaProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ShareIntentProvider>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [langReady, setLangReady] = useState(false);
  const { session, ready: authReady, needsMfa } = useAuth();
  const { direction, lang } = useDirection();
  // register this phone for push + open tasks from tapped notifications (no-op in Expo Go / web)
  usePushNotifications(!!session && !needsMfa);
  // live updates: any change to data this person can see refreshes the screen by itself
  useLiveSync(!!session && !needsMfa, session?.user.id);
  // the app's language is the language of everything Muntej sends (notifications, WhatsApp, emails): tell the server
  useEffect(() => {
    if (session && !needsMfa) Promise.resolve(supabase.rpc('set_my_locale' as never, { p_locale: lang } as never)).catch(() => {});
  }, [session, needsMfa, lang]);

  useEffect(() => {
    loadSavedLanguage().finally(() => setLangReady(true));
  }, []);

  const ready = (fontsLoaded || !!fontError) && langReady && authReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  // email code done AND (no 2FA, or authenticator code entered)
  const signedIn = !!session && !needsMfa;

  return (
    // direction flips the whole layout instantly when the language changes (works in Expo Go too).
    <View style={{ flex: 1, direction, backgroundColor: colors.bg }}>
      {/* light theme → dark status-bar text; Hero switches to light while it is on screen */}
      <StatusBar style="dark" />
      {/* super admin looking into another account: always visible, one tap back to their own */}
      {signedIn && <ViewingBanner />}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: direction === 'rtl' ? 'slide_from_left' : 'slide_from_right',
        }}
      >
        {/* every signed-in route must be listed here, or it is reachable without a session */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="security" />
          <Stack.Screen name="prototype" />
          {STACK_SCREENS.map((name) => (
            <Stack.Screen
              key={name}
              name={name}
              options={name === '02-capture' ? { presentation: 'modal', animation: 'slide_from_bottom' } : undefined}
            />
          ))}
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
      <ShareIntake signedIn={signedIn} />
      {/* floating overlays: a crash in one hides it, never the whole app */}
      {signedIn && (
        <QuietBoundary name="helper">
          <HelperButton />
        </QuietBoundary>
      )}
      {signedIn && (
        <QuietBoundary name="launch">
          <LaunchCard />
        </QuietBoundary>
      )}
      {/* Saree3's first-time tips + one-tap feedback (one card per app open, after onboarding) */}
      {signedIn && (
        <QuietBoundary name="coach">
          <CoachHost />
        </QuietBoundary>
      )}
      {signedIn && <ProtoBar />}
    </View>
  );
}
